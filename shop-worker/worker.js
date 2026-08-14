// Cloudflare Worker לחנות של pashutlitzor.com — יצירת תשלום דרך Grow (משולם),
// קליטת callback על תשלום, שמירת הזמנות ב-D1, ושליחת מיילי אישור.
// אח ל-oauth-worker/worker.js.
//
// ⚠️ שלד (scaffold) — טרם הושלם! מבוסס על מידע חלקי בלבד על ה-API של Grow.
// לפני פריסה לפרודקשן חובה לוודא כל סעיף המסומן ב-TODO מול התיעוד הרשמי
// שמתקבל בחשבון Grow בפועל (grow-il.readme.io / developers.grow.business),
// ובמיוחד את אימות ה-callback — בלי זה כל אחד יכול לזייף "הזמנה שולמה".
//
// Secrets נדרשים (wrangler secret put ...): GROW_USER_ID, GROW_PAGE_CODE,
//   GROW_API_KEY (אם רלוונטי לחשבון), RESEND_API_KEY
// D1 binding נדרש (ב-wrangler.toml): ORDERS_DB

const GROW_API_BASE = "https://sandbox.meshulam.co.il/api/light/server/1.0"; // TODO: לוודא כתובת production (סביר שונה מ-sandbox)
const STORE_URL = "https://pashutlitzor.com";
const OWNER_EMAIL = "nhftk154@gmail.com"; // TODO: להחליף אם רוצים כתובת עסקית נפרדת
const ALLOWED_ORIGINS = [
  "https://pashutlitzor.com",
  "https://www.pashutlitzor.com",
  "http://localhost:4599",
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    try {
      if (url.pathname === "/api/checkout" && request.method === "POST") {
        return await handleCheckout(request, env, origin);
      }
      if (url.pathname === "/api/grow-callback" && request.method === "POST") {
        return await handleGrowCallback(request, env);
      }
      if (url.pathname === "/api/order-by-ref" && request.method === "GET") {
        return await handleOrderByRef(url, env, origin);
      }
      if (url.pathname === "/api/orders" && request.method === "GET") {
        return await withAuth(request, env, origin, () => handleListOrders(url, env, origin));
      }
      const orderIdMatch = url.pathname.match(/^\/api\/orders\/(\d+)$/);
      if (orderIdMatch && request.method === "GET") {
        return await withAuth(request, env, origin, () => handleGetOrder(orderIdMatch[1], env, origin));
      }
      if (orderIdMatch && request.method === "PATCH") {
        return await withAuth(request, env, origin, () => handleUpdateOrder(orderIdMatch[1], request, env, origin));
      }
    } catch (err) {
      return json({ error: "internal_error", message: String((err && err.message) || err) }, 500, origin);
    }

    return json({ error: "not_found" }, 404, origin);
  },
};

/* ============ CHECKOUT ============ */
// זורם ככה: יוצרים הזמנה 'pending' אצלנו קודם, שולחים ל-Grow עם מזהה
// פנימי (paymentRef) שאמור לחזור אלינו ב-callback, ומחזירים לפרונט את
// כתובת דף התשלום של Grow.

async function handleCheckout(request, env, origin) {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return json({ error: "empty_cart" }, 400, origin);
  }

  const productsRes = await fetch(STORE_URL + "/content/products.json", { cf: { cacheTtl: 0 } });
  if (!productsRes.ok) return json({ error: "catalog_unavailable" }, 502, origin);
  const products = ((await productsRes.json()).items || []);

  const orderItems = [];
  let totalIls = 0;
  for (const raw of body.items) {
    const qty = Math.max(1, Math.min(20, parseInt(raw.qty, 10) || 0));
    if (!qty) continue;
    const product = products.find((p) => p.slug === raw.slug && p.active !== false);
    if (!product) continue;

    let priceIls = product.priceIls;
    let name = product.name;
    if (raw.variantSku && product.variants && product.variants.length) {
      const variant = product.variants.find((v) => v.sku === raw.variantSku);
      if (!variant) continue;
      priceIls = variant.priceIls;
      name = product.name + " — " + variant.label;
    }

    const lineTotal = Number(priceIls) * qty;
    if (!lineTotal || lineTotal <= 0) continue;
    orderItems.push({ name, qty, lineTotal });
    totalIls += lineTotal;
  }

  if (orderItems.length === 0) return json({ error: "no_valid_items" }, 400, origin);

  const paymentRef = crypto.randomUUID();

  await env.ORDERS_DB
    .prepare(`INSERT INTO orders (payment_ref, items_json, total_agorot, status) VALUES (?, ?, ?, 'pending')`)
    .bind(paymentRef, JSON.stringify(orderItems), Math.round(totalIls * 100))
    .run();

  // TODO: לוודא מול תיעוד Grow בפועל:
  //  - שמות השדות המדויקים (יכול להיות userId/pageCode/apiKey/sum/successUrl/
  //    cancelUrl/description, אך יש לאמת מול "createPaymentProcess" האמיתי)
  //  - שם הפרמטר הנכון להעברת מזהה פנימי (paymentRef) שחוזר אלינו ב-callback
  //    (למשל cField1, pageField, custom field אחר)
  //  - איך מפעילים bit / תשלומים (paymentsNum?) אם רוצים לאפשר ללקוח לבחור
  const params = new URLSearchParams();
  params.set("userId", env.GROW_USER_ID);
  params.set("pageCode", env.GROW_PAGE_CODE);
  if (env.GROW_API_KEY) params.set("apiKey", env.GROW_API_KEY);
  params.set("sum", totalIls.toFixed(2));
  params.set("description", "הזמנה מ-" + STORE_URL);
  params.set("successUrl", STORE_URL + "/order-confirmation.html?ref=" + paymentRef);
  params.set("cancelUrl", STORE_URL + "/shop.html");
  params.set("cField1", paymentRef); // TODO: לוודא שזה השם הנכון של השדה

  const growRes = await fetch(GROW_API_BASE + "/createPaymentProcess", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const growData = await growRes.json().catch(() => null);

  // TODO: לוודא את מבנה התגובה המדויק — באיזה שדה נמצאת כתובת דף התשלום
  const paymentUrl = growData && (growData.url || (growData.data && growData.data.url));
  if (!growRes.ok || !paymentUrl) {
    return json({ error: "grow_error", message: growData && growData.message }, 502, origin);
  }

  return json({ url: paymentUrl }, 200, origin);
}

/* ============ CALLBACK (Grow -> אנחנו, על תשלום) ============ */

async function handleGrowCallback(request, env) {
  // ⚠️ TODO קריטי לאבטחה: לוודא מול Grow איך מאמתים שהבקשה הזו באמת הגיעה
  // מהם ולא זויפה (חתימה בהדר? סוד משותף בגוף הבקשה? allowlist כתובות IP?).
  // כרגע אין שום אימות — אסור לפרוס ל-production במצב הזה.

  const contentType = request.headers.get("Content-Type") || "";
  const payload = contentType.includes("application/json")
    ? await request.json().catch(() => null)
    : Object.fromEntries(new URLSearchParams(await request.text()));

  if (!payload) return new Response("bad payload", { status: 400 });

  const paymentRef = payload.cField1 || payload.paymentRef; // TODO: לוודא שם השדה בפועל
  if (!paymentRef) return new Response("missing ref", { status: 400 });

  const order = await env.ORDERS_DB.prepare("SELECT * FROM orders WHERE payment_ref = ?").bind(paymentRef).first();
  if (!order) return new Response("order not found", { status: 404 });
  if (order.status !== "pending") return new Response("ok", { status: 200 }); // כבר טופל

  // TODO: לוודא את הערך/שדה המדויק שמסמן הצלחה (status? statusCode? "1"?)
  const paid = payload.statusCode === "1" || payload.status === "success" || payload.status === "הצליח";

  if (!paid) {
    await env.ORDERS_DB
      .prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?")
      .bind(order.id)
      .run();
    return new Response("ok", { status: 200 });
  }

  const customerName = payload.fullName || "";
  const customerEmail = payload.payerEmail || "";
  const customerPhone = payload.payerPhone || "";

  await env.ORDERS_DB
    .prepare(
      `UPDATE orders SET status = 'paid', customer_name = ?, customer_email = ?, customer_phone = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(customerName, customerEmail, customerPhone, order.id)
    .run();

  await sendOrderEmails(env, {
    customerName,
    customerEmail,
    items: JSON.parse(order.items_json),
    totalIls: order.total_agorot / 100,
  });

  return new Response("ok", { status: 200 });
}

/* ============ EMAIL (Resend) ============ */

async function sendOrderEmails(env, order) {
  const itemsHtml = order.items
    .map((it) => `<tr><td>${escHtml(it.name)} × ${it.qty}</td><td>₪${it.lineTotal.toFixed(2)}</td></tr>`)
    .join("");

  const customerHtml = `
    <h2>תודה על ההזמנה!</h2>
    <p>ההזמנה שלך התקבלה ותטופל בקרוב.</p>
    <table>${itemsHtml}</table>
    <p><strong>סה"כ: ₪${order.totalIls.toFixed(2)}</strong></p>`;

  const ownerHtml = `
    <h2>התקבלה הזמנה חדשה 🎉</h2>
    <p>לקוח/ה: ${escHtml(order.customerName || "לא צוין")} (${escHtml(order.customerEmail || "")})</p>
    <table>${itemsHtml}</table>
    <p><strong>סה"כ: ₪${order.totalIls.toFixed(2)}</strong></p>`;

  const send = (to, subject, html) =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "פשוט ליצור <onboarding@resend.dev>", to: [to], subject, html }),
    });

  const tasks = [send(OWNER_EMAIL, "התקבלה הזמנה חדשה", ownerHtml)];
  if (order.customerEmail) tasks.push(send(order.customerEmail, "אישור הזמנה — פשוט ליצור", customerHtml));
  await Promise.allSettled(tasks);
}

function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ============ ORDER LOOKUP (public, confirmation page) ============ */

async function handleOrderByRef(url, env, origin) {
  const ref = url.searchParams.get("ref");
  if (!ref) return json({ error: "missing_ref" }, 400, origin);

  const row = await env.ORDERS_DB
    .prepare("SELECT id, status, items_json, total_agorot FROM orders WHERE payment_ref = ?")
    .bind(ref)
    .first();
  if (!row) return json({ error: "not_found" }, 404, origin);
  if (row.status === "pending") return json({ error: "not_ready" }, 202, origin);

  return json({ id: row.id, items: JSON.parse(row.items_json), totalIls: row.total_agorot / 100 }, 200, origin);
}

/* ============ ADMIN ORDERS (auth-gated) ============ */

async function withAuth(request, env, origin, handler) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401, origin);

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: "Bearer " + token, "User-Agent": "pashutlitzor-shop-worker" },
  });
  if (!userRes.ok) return json({ error: "unauthorized" }, 401, origin);
  const user = await userRes.json();

  const permRes = await fetch(
    `https://api.github.com/repos/nhftk154/-pashutlitzor/collaborators/${user.login}/permission`,
    { headers: { Authorization: "Bearer " + token, "User-Agent": "pashutlitzor-shop-worker" } }
  );
  if (!permRes.ok) return json({ error: "forbidden" }, 403, origin);
  const perm = await permRes.json();
  if (!["admin", "write"].includes(perm.permission)) return json({ error: "forbidden" }, 403, origin);

  return handler();
}

async function handleListOrders(url, env, origin) {
  const page = Math.max(1, parseInt(url.searchParams.get("page"), 10) || 1);
  const pageSize = 25;
  const rows = await env.ORDERS_DB
    .prepare("SELECT id, customer_name, customer_email, customer_phone, items_json, total_agorot, status, created_at FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .bind(pageSize, (page - 1) * pageSize)
    .all();

  const orders = rows.results.map((r) => ({
    id: r.id,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    customerPhone: r.customer_phone,
    items: JSON.parse(r.items_json),
    totalIls: r.total_agorot / 100,
    status: r.status,
    createdAt: r.created_at,
  }));

  return json({ orders, page }, 200, origin);
}

async function handleGetOrder(id, env, origin) {
  const row = await env.ORDERS_DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "not_found" }, 404, origin);
  return json(
    {
      id: row.id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      customerPhone: row.customer_phone,
      items: JSON.parse(row.items_json),
      totalIls: row.total_agorot / 100,
      status: row.status,
      fulfillmentNote: row.fulfillment_note,
      createdAt: row.created_at,
    },
    200,
    origin
  );
}

async function handleUpdateOrder(id, request, env, origin) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "invalid_body" }, 400, origin);

  const allowedStatuses = ["pending", "paid", "preparing", "ready", "shipped", "completed", "cancelled", "refunded"];
  if (body.status && !allowedStatuses.includes(body.status)) {
    return json({ error: "invalid_status" }, 400, origin);
  }

  await env.ORDERS_DB
    .prepare("UPDATE orders SET status = COALESCE(?, status), fulfillment_note = COALESCE(?, fulfillment_note), updated_at = datetime('now') WHERE id = ?")
    .bind(body.status || null, body.fulfillmentNote || null, id)
    .run();

  return json({ ok: true }, 200, origin);
}
