// Cloudflare Worker לחנות של pashutlitzor.com — יצירת תשלומי Stripe Checkout,
// קליטת webhook, שמירת הזמנות ב-D1, ושליחת מיילי אישור. אח ל-oauth-worker/worker.js.
//
// Secrets נדרשים (wrangler secret put ...): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY
// D1 binding נדרש (ב-wrangler.toml): ORDERS_DB
//
// GITHUB_REPO / OWNER_EMAIL / STORE_URL אפשר לקבוע כאן או כ-vars ב-wrangler.toml.

const GITHUB_REPO = "nhftk154/-pashutlitzor";
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
      if (url.pathname === "/api/stripe-webhook" && request.method === "POST") {
        return await handleWebhook(request, env);
      }
      if (url.pathname === "/api/order-by-session" && request.method === "GET") {
        return await handleOrderBySession(url, env, origin);
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

async function handleCheckout(request, env, origin) {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return json({ error: "empty_cart" }, 400, origin);
  }

  const productsRes = await fetch(STORE_URL + "/content/products.json", { cf: { cacheTtl: 0 } });
  if (!productsRes.ok) return json({ error: "catalog_unavailable" }, 502, origin);
  const products = ((await productsRes.json()).items || []);

  const lineItems = [];
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

    const unitAmount = Math.round(Number(priceIls) * 100);
    if (!unitAmount || unitAmount <= 0) continue;

    lineItems.push({ name, unitAmount, qty });
  }

  if (lineItems.length === 0) return json({ error: "no_valid_items" }, 400, origin);

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("locale", "he");
  params.set("success_url", STORE_URL + "/order-confirmation.html?session_id={CHECKOUT_SESSION_ID}");
  params.set("cancel_url", STORE_URL + "/shop.html");
  params.set("phone_number_collection[enabled]", "true");
  params.set("custom_fields[0][key]", "full_name");
  params.set("custom_fields[0][label][type]", "custom");
  params.set("custom_fields[0][label][custom]", "שם מלא");
  params.set("custom_fields[0][type]", "text");

  lineItems.forEach((li, i) => {
    params.set(`line_items[${i}][quantity]`, String(li.qty));
    params.set(`line_items[${i}][price_data][currency]`, "ils");
    params.set(`line_items[${i}][price_data][unit_amount]`, String(li.unitAmount));
    params.set(`line_items[${i}][price_data][product_data][name]`, li.name);
  });

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const session = await stripeRes.json();
  if (!stripeRes.ok) return json({ error: "stripe_error", message: session.error && session.error.message }, 502, origin);

  return json({ url: session.url }, 200, origin);
}

/* ============ WEBHOOK ============ */

async function handleWebhook(request, env) {
  const signatureHeader = request.headers.get("Stripe-Signature") || "";
  const payload = await request.text();

  const valid = await verifyStripeSignature(payload, signatureHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return new Response("invalid signature", { status: 400 });

  const event = JSON.parse(payload);
  if (event.type !== "checkout.session.completed") {
    return new Response("ok", { status: 200 });
  }

  const session = event.data.object;

  const existing = await env.ORDERS_DB
    .prepare("SELECT id FROM orders WHERE stripe_session_id = ?")
    .bind(session.id)
    .first();
  if (existing) return new Response("ok", { status: 200 });

  const lineItemsRes = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${session.id}/line_items?limit=100`,
    { headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY } }
  );
  const lineItemsData = await lineItemsRes.json();
  const items = (lineItemsData.data || []).map((li) => ({
    name: li.description,
    qty: li.quantity,
    lineTotal: li.amount_total / 100,
  }));

  const customerName =
    (session.custom_fields || []).find((f) => f.key === "full_name")?.text?.value || "";
  const customerEmail = (session.customer_details && session.customer_details.email) || "";
  const customerPhone = (session.customer_details && session.customer_details.phone) || "";

  await env.ORDERS_DB
    .prepare(
      `INSERT INTO orders (stripe_session_id, customer_name, customer_email, customer_phone, items_json, total_agorot, status)
       VALUES (?, ?, ?, ?, ?, ?, 'paid')`
    )
    .bind(session.id, customerName, customerEmail, customerPhone, JSON.stringify(items), session.amount_total)
    .run();

  await sendOrderEmails(env, { customerName, customerEmail, items, totalIls: session.amount_total / 100 });

  return new Response("ok", { status: 200 });
}

async function verifyStripeSignature(payload, signatureHeader, secret) {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    })
  );
  if (!parts.t || !parts.v1) return false;

  const signedPayload = `${parts.t}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = [...new Uint8Array(sigBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

  return timingSafeEqual(expected, parts.v1);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
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

async function handleOrderBySession(url, env, origin) {
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) return json({ error: "missing_session_id" }, 400, origin);

  const row = await env.ORDERS_DB
    .prepare("SELECT id, items_json, total_agorot FROM orders WHERE stripe_session_id = ?")
    .bind(sessionId)
    .first();
  if (!row) return json({ error: "not_found" }, 404, origin);

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
    `https://api.github.com/repos/${GITHUB_REPO}/collaborators/${user.login}/permission`,
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

  const allowedStatuses = ["paid", "preparing", "ready", "shipped", "completed", "cancelled", "refunded"];
  if (body.status && !allowedStatuses.includes(body.status)) {
    return json({ error: "invalid_status" }, 400, origin);
  }

  await env.ORDERS_DB
    .prepare("UPDATE orders SET status = COALESCE(?, status), fulfillment_note = COALESCE(?, fulfillment_note), updated_at = datetime('now') WHERE id = ?")
    .bind(body.status || null, body.fulfillmentNote || null, id)
    .run();

  return json({ ok: true }, 200, origin);
}
