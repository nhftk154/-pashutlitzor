/* Shared cart module — vanilla JS, no build step, mirrors index.html's own
   fetch-JSON + render-by-template conventions. Persists to localStorage only;
   never trusted as a price source (the checkout Worker re-resolves prices). */
(function(){
  'use strict';
  var STORAGE_KEY = 'pl_cart_v1';
  var productsCache = null;
  var drawerEl, overlayEl, bodyEl, footerEl;

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function readCart(){
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function writeCart(cart){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    updateBadge();
    renderDrawer();
  }

  function findLine(cart, slug, variantSku){
    var v = variantSku || null;
    for (var i = 0; i < cart.length; i++){
      if (cart[i].slug === slug && (cart[i].variantSku || null) === v) return cart[i];
    }
    return null;
  }

  function addItem(slug, variantSku, qty){
    qty = qty || 1;
    var cart = readCart();
    var line = findLine(cart, slug, variantSku);
    if (line) { line.qty += qty; }
    else { cart.push({ slug: slug, variantSku: variantSku || null, qty: qty }); }
    writeCart(cart);
    openDrawer();
  }

  function updateQty(slug, variantSku, qty){
    var cart = readCart();
    var line = findLine(cart, slug, variantSku);
    if (!line) return;
    if (qty <= 0) cart = cart.filter(function(l){ return l !== line; });
    else line.qty = qty;
    writeCart(cart);
  }

  function removeItem(slug, variantSku){
    var v = variantSku || null;
    writeCart(readCart().filter(function(l){ return !(l.slug === slug && (l.variantSku || null) === v); }));
  }

  function getCartCount(){
    return readCart().reduce(function(sum, l){ return sum + l.qty; }, 0);
  }

  function loadProducts(){
    if (productsCache) return Promise.resolve(productsCache);
    return fetch('content/products.json')
      .then(function(r){ return r.json(); })
      .then(function(data){ productsCache = data.items || []; return productsCache; })
      .catch(function(){ return []; });
  }

  function resolveLine(products, line){
    var product = products.filter(function(p){ return p.slug === line.slug; })[0];
    if (!product) return null;
    var variant = null;
    if (line.variantSku && product.variants && product.variants.length){
      variant = product.variants.filter(function(v){ return v.sku === line.variantSku; })[0] || null;
    }
    var price = variant ? variant.priceIls : product.priceIls;
    return {
      slug: product.slug,
      variantSku: line.variantSku || null,
      name: product.name,
      variantLabel: variant ? variant.label : null,
      image: (product.images && product.images[0]) || '',
      price: price,
      qty: line.qty,
      lineTotal: price * line.qty
    };
  }

  function updateBadge(){
    var count = getCartCount();
    var badges = document.querySelectorAll('.nav-cart-badge');
    for (var i = 0; i < badges.length; i++){
      badges[i].textContent = count > 0 ? String(count) : '';
      badges[i].setAttribute('data-count', String(count));
    }
  }

  function ensureDrawer(){
    if (drawerEl) return;

    overlayEl = document.createElement('div');
    overlayEl.className = 'cart-overlay';
    overlayEl.addEventListener('click', closeDrawer);

    drawerEl = document.createElement('aside');
    drawerEl.className = 'cart-drawer';
    drawerEl.setAttribute('aria-label', 'עגלת קניות');
    drawerEl.innerHTML =
      '<div class="cart-header"><h2>עגלה</h2>' +
      '<button class="cart-close" type="button" aria-label="סגירת עגלה">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
      '</button></div>' +
      '<div class="cart-body"></div>' +
      '<div class="cart-footer"></div>';

    document.body.appendChild(overlayEl);
    document.body.appendChild(drawerEl);
    bodyEl = drawerEl.querySelector('.cart-body');
    footerEl = drawerEl.querySelector('.cart-footer');
    drawerEl.querySelector('.cart-close').addEventListener('click', closeDrawer);

    var openers = document.querySelectorAll('[data-cart-open]');
    for (var i = 0; i < openers.length; i++){
      openers[i].addEventListener('click', function(e){ e.preventDefault(); openDrawer(); });
    }

    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape') closeDrawer();
    });
  }

  function openDrawer(){
    ensureDrawer();
    renderDrawer();
    overlayEl.classList.add('open');
    drawerEl.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer(){
    if (!drawerEl) return;
    overlayEl.classList.remove('open');
    drawerEl.classList.remove('open');
    document.body.style.overflow = '';
  }

  function renderDrawer(){
    if (!bodyEl) return;
    var cart = readCart();

    if (cart.length === 0){
      bodyEl.innerHTML =
        '<div class="cart-empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>' +
        '<p>העגלה שלך ריקה</p>' +
        '<a class="btn btn-ghost" href="shop.html">המשך בקניות</a>' +
        '</div>';
      footerEl.innerHTML = '';
      return;
    }

    loadProducts().then(function(products){
      var lines = cart.map(function(l){ return resolveLine(products, l); }).filter(Boolean);
      var total = lines.reduce(function(s, l){ return s + l.lineTotal; }, 0);

      bodyEl.innerHTML = lines.map(function(l){
        return '<div class="cart-line" data-slug="' + esc(l.slug) + '" data-variant="' + esc(l.variantSku || '') + '">' +
          '<img src="' + esc(l.image) + '" alt="" loading="lazy">' +
          '<div class="cart-line-info">' +
            '<span class="cart-line-name">' + esc(l.name) + '</span>' +
            (l.variantLabel ? '<span class="cart-line-variant">' + esc(l.variantLabel) + '</span>' : '') +
            '<div class="cart-line-bottom">' +
              '<div class="qty-stepper">' +
                '<button type="button" data-qty-down aria-label="הפחתת כמות">−</button>' +
                '<output>' + l.qty + '</output>' +
                '<button type="button" data-qty-up aria-label="הוספת כמות">+</button>' +
              '</div>' +
              '<span class="cart-line-price">₪' + l.lineTotal.toFixed(2) + '</span>' +
            '</div>' +
            '<button type="button" class="cart-line-remove" data-remove>הסרה</button>' +
          '</div>' +
        '</div>';
      }).join('');

      footerEl.innerHTML =
        '<div class="cart-total-row"><span>סה"כ</span><span class="amount">₪' + total.toFixed(2) + '</span></div>' +
        '<a class="btn btn-primary btn-block" href="checkout.html">מעבר לתשלום</a>';

      var lineEls = bodyEl.querySelectorAll('.cart-line');
      for (var i = 0; i < lineEls.length; i++){
        (function(lineEl){
          var slug = lineEl.getAttribute('data-slug');
          var variant = lineEl.getAttribute('data-variant') || null;
          var line = findLine(cart, slug, variant);
          if (!line) return;
          lineEl.querySelector('[data-qty-up]').addEventListener('click', function(){ updateQty(slug, variant, line.qty + 1); });
          lineEl.querySelector('[data-qty-down]').addEventListener('click', function(){ updateQty(slug, variant, line.qty - 1); });
          lineEl.querySelector('[data-remove]').addEventListener('click', function(){ removeItem(slug, variant); });
        })(lineEls[i]);
      }
    });
  }

  window.PLCart = {
    addItem: addItem,
    updateQty: updateQty,
    removeItem: removeItem,
    getCart: readCart,
    getCartCount: getCartCount,
    loadProducts: loadProducts,
    resolveLine: resolveLine,
    open: openDrawer,
    close: closeDrawer
  };

  document.addEventListener('DOMContentLoaded', function(){
    ensureDrawer();
    updateBadge();
  });
})();
