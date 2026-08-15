/**
 * Synvorax Labs — Shopping Cart & Checkout
 */

const CartManager = (() => {
  const STORAGE_KEY = 'synvorax-cart';
  let catalog = null;
  let items = [];
  let drawer = null;
  let submitting = false;
  let appliedCoupon = null;
  let couponCheck = 0;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    updateBadge();
    render();
    refreshCoupon();
  }

  function getProduct(id) {
    return catalog?.products?.find(p => p.id === id) || null;
  }

  function formatMoney(amount, currency = 'EUR') {
    const symbols = { EUR: '€', USD: '$', GBP: '£' };
    const symbol = symbols[currency] || `${currency} `;
    return `${symbol}${Number(amount).toFixed(2)}`;
  }

  function cartCurrency() {
    const first = items[0] && getProduct(items[0].id);
    return first?.currency || 'EUR';
  }

  function normalizeItems() {
    const valid = items.filter(line => getProduct(line.id));
    if (valid.length !== items.length) {
      items = valid;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  }

  function subtotal() {
    return items.reduce((sum, line) => {
      const product = getProduct(line.id);
      if (!product || product.price == null) return sum;
      return sum + product.price * line.qty;
    }, 0);
  }

  function count() {
    return items.reduce((sum, line) => {
      const product = getProduct(line.id);
      if (!product) return sum;
      return sum + line.qty;
    }, 0);
  }

  function shippingConfig() {
    const cfg = catalog?.shipping || {};
    return {
      freeThreshold: Number(cfg.freeThreshold) || 200,
      fee: Number(cfg.fee) || 0,
      label: cfg.label || 'Delivery',
      freeLabel: cfg.freeLabel || 'Free',
      chargedDetail: cfg.chargedDetail || 'flat rate for the whole order',
      freeDetail: cfg.freeDetail || 'on orders {threshold}+',
      chargedNote: cfg.chargedNote || 'Delivery is {fee} for the whole order on purchases under {threshold}.',
      progressNote: cfg.progressNote || 'Add {remaining} more for free delivery.',
      freeNote: cfg.freeNote || 'Free delivery — this order is {threshold} or more.',
    };
  }

  function fillCopy(template, vars) {
    return String(template || '').replace(/\{(\w+)\}/g, (_, key) => (
      vars[key] == null ? '' : String(vars[key])
    ));
  }

  function totals() {
    const goods = subtotal();
    const cfg = shippingConfig();
    const isFree = goods >= cfg.freeThreshold;
    const shipping = isFree ? 0 : cfg.fee;
    const discount = appliedCoupon ? Number(appliedCoupon.discount) || 0 : 0;
    return {
      goods,
      shipping,
      discount,
      total: Math.max(0, goods - discount) + shipping,
      isFree,
      remaining: Math.max(0, cfg.freeThreshold - goods),
      cfg,
    };
  }

  function add(productId, qty = 1) {
    const product = getProduct(productId);
    if (!product || product.status === 'out-of-stock') return false;

    const existing = items.find(line => line.id === productId);
    if (existing) existing.qty += qty;
    else items.push({ id: productId, qty });

    save();
    return true;
  }

  function setQty(productId, qty) {
    const line = items.find(item => item.id === productId);
    if (!line) return;
    if (qty < 1) {
      remove(productId);
      return;
    }
    line.qty = Math.min(99, Number(qty) || 1);
    save();
  }

  function remove(productId) {
    items = items.filter(line => line.id !== productId);
    save();
  }

  function clear() {
    items = [];
    appliedCoupon = null;
    save();
    syncCouponUi();
  }

  function open() {
    if (!drawer) return;
    drawer.classList.add('active');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    showPanel(items.length ? 'cart' : 'cart');
  }

  function close() {
    if (!drawer) return;
    drawer.classList.remove('active');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function showPanel(name) {
    drawer.querySelectorAll('[data-cart-panel]').forEach(panel => {
      panel.hidden = panel.dataset.cartPanel !== name;
    });
  }

  function updateBadge() {
    const badge = document.getElementById('cart-badge');
    if (!badge) return;
    const total = count();
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.hidden = total === 0;
  }

  function applyCopy() {
    const copy = catalog.cart || {};
    const setText = (sel, value) => {
      const el = drawer.querySelector(sel);
      if (el && value != null) el.textContent = value;
    };

    setText('[data-cart-title]', copy.title);
    setText('[data-cart-empty]', copy.empty);
    setText('[data-cart-subtotal-label]', copy.subtotalLabel);
    setText('[data-cart-total-label]', copy.totalLabel || 'Total');
    setText('[data-cart-shipping-label]', shippingConfig().label);
    setText('[data-checkout-title]', copy.checkoutTitle);
    setText('[data-checkout-subtitle]', copy.checkoutSubtitle);
    setText('#cart-to-checkout', 'Checkout');
    setText('#checkout-back', '← Back to cart');
    setText('#checkout-submit', copy.placeOrderLabel);
    setText('#coupon-apply', copy.couponApply || 'Apply');
    setText('#coupon-remove', copy.couponRemove || 'Remove');
    setText('[data-cart-discount-label]', copy.discountLabel || 'Discount');
    setText('[data-success-title]', copy.successTitle);
    setText('#success-text', copy.successText);
    setText('#success-close', copy.continueLabel);

    const fields = copy.fields || {};
    Object.entries(fields).forEach(([name, label]) => {
      const field = drawer.querySelector(`[data-field="${name}"]`);
      if (field) field.textContent = label;
    });
  }

  function render() {
    const copy = catalog.cart || {};
    const list = document.getElementById('cart-items');
    const empty = document.getElementById('cart-empty');
    const footer = document.getElementById('cart-footer');
    const subtotalEl = document.getElementById('cart-subtotal');
    if (!list) return;

    if (!items.length) {
      list.innerHTML = '';
      if (empty) empty.hidden = false;
      if (footer) footer.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;
    if (footer) footer.hidden = false;

    list.innerHTML = items.map(line => {
      const product = getProduct(line.id);
      if (!product) return '';
      const lineTotal = (product.price || 0) * line.qty;
      return `
        <article class="cart-item" data-id="${product.id}">
          <img class="cart-item__image" src="${product.image}" alt="${product.name}" width="64" height="64">
          <div class="cart-item__body">
            <h4 class="cart-item__name">${product.name}</h4>
            <p class="cart-item__price">${formatMoney(product.price, product.currency)} each</p>
            <div class="cart-item__controls">
              <div class="qty-control" aria-label="${copy.quantityLabel || 'Qty'}">
                <button type="button" data-qty-dec="${product.id}" aria-label="Decrease quantity">−</button>
                <span>${line.qty}</span>
                <button type="button" data-qty-inc="${product.id}" aria-label="Increase quantity">+</button>
              </div>
              <button type="button" class="cart-item__remove" data-remove="${product.id}">${copy.removeLabel || 'Remove'}</button>
            </div>
          </div>
          <div class="cart-item__total">${formatMoney(lineTotal, product.currency)}</div>
        </article>
      `;
    }).join('');

    const t = totals();
    const currency = cartCurrency();
    const cfg = t.cfg;
    const vars = {
      fee: formatMoney(cfg.fee, currency),
      threshold: formatMoney(cfg.freeThreshold, currency),
      remaining: formatMoney(t.remaining, currency),
    };

    if (subtotalEl) subtotalEl.textContent = formatMoney(t.goods, currency);

    const shippingEl = document.getElementById('cart-shipping');
    const shippingDetail = document.getElementById('cart-shipping-detail');
    const shippingRow = document.getElementById('cart-shipping-row');
    const shippingNote = document.getElementById('cart-shipping-note');
    const totalEl = document.getElementById('cart-total');

    if (shippingEl) {
      shippingEl.textContent = t.isFree ? cfg.freeLabel : formatMoney(t.shipping, currency);
    }
    if (shippingDetail) {
      shippingDetail.textContent = t.isFree
        ? fillCopy(cfg.freeDetail, vars)
        : cfg.chargedDetail;
    }
    if (shippingRow) shippingRow.classList.toggle('is-free', t.isFree);
    if (shippingNote) {
      shippingNote.textContent = t.isFree
        ? fillCopy(cfg.freeNote, vars)
        : `${fillCopy(cfg.chargedNote, vars)} ${fillCopy(cfg.progressNote, vars)}`.trim();
    }
    if (totalEl) totalEl.textContent = formatMoney(t.total, currency);

    const discountRow = document.getElementById('cart-discount-row');
    const discountEl = document.getElementById('cart-discount');
    const discountDetail = document.getElementById('cart-discount-detail');
    if (discountRow) discountRow.hidden = !(t.discount > 0);
    if (discountEl) discountEl.textContent = `−${formatMoney(t.discount, currency)}`;
    if (discountDetail) {
      discountDetail.textContent = appliedCoupon
        ? `${appliedCoupon.code}${appliedCoupon.label ? ' · ' + appliedCoupon.label : ''}`
        : '';
    }

    const summary = document.getElementById('checkout-summary');
    if (summary) {
      const productRows = items.map(line => {
        const product = getProduct(line.id);
        if (!product) return '';
        return `<li><span>${line.qty}× ${product.name}</span><strong>${formatMoney((product.price || 0) * line.qty, product.currency)}</strong></li>`;
      }).join('');

      const shippingValue = t.isFree ? cfg.freeLabel : formatMoney(t.shipping, currency);
      const shippingHint = t.isFree
        ? fillCopy(cfg.freeDetail, vars)
        : cfg.chargedDetail;

      const discountRowHtml = t.discount > 0
        ? `<li class="checkout-summary__discount"><span>${copy.discountLabel || 'Discount'}<small>${appliedCoupon.code}${appliedCoupon.label ? ' · ' + appliedCoupon.label : ''}</small></span><strong>−${formatMoney(t.discount, currency)}</strong></li>`
        : '';

      summary.innerHTML = productRows +
        `<li><span>${copy.subtotalLabel || 'Subtotal'}</span><strong>${formatMoney(t.goods, currency)}</strong></li>` +
        discountRowHtml +
        `<li class="checkout-summary__shipping ${t.isFree ? 'is-free' : ''}"><span>${cfg.label}<small>${shippingHint}</small></span><strong>${shippingValue}</strong></li>` +
        `<li class="checkout-summary__total"><span>${copy.totalLabel || 'Total'}</span><strong>${formatMoney(t.total, currency)}</strong></li>`;
    }
  }

  function buildOrderPayload(form) {
    const fd = new FormData(form);
    const currency = cartCurrency();
    const orderId = `SVX-${Date.now().toString(36).toUpperCase()}`;
    const t = totals();
    const shippingName = t.isFree
      ? `${t.cfg.label} — ${t.cfg.freeLabel}`
      : `${t.cfg.label} — ${formatMoney(t.cfg.fee, currency)}`;

    const lines = items.map(line => {
      const product = getProduct(line.id);
      return {
        id: line.id,
        name: product?.name || line.id,
        qty: line.qty,
        unitPrice: product?.price || 0,
        lineTotal: (product?.price || 0) * line.qty,
        currency: product?.currency || currency,
      };
    });

    lines.push({
      id: 'delivery',
      name: shippingName,
      qty: 1,
      unitPrice: t.shipping,
      lineTotal: t.shipping,
      currency,
    });

    const customer = {
      fullName: String(fd.get('fullName') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      address: String(fd.get('address') || '').trim(),
      city: String(fd.get('city') || '').trim(),
      postalCode: String(fd.get('postalCode') || '').trim(),
      country: String(fd.get('country') || '').trim(),
      notes: String(fd.get('notes') || '').trim(),
    };

    const shippingAddress = [
      customer.address,
      customer.city,
      customer.postalCode,
      customer.country,
    ].filter(Boolean).join(', ');

    const orderItemsText = lines
      .map(line => `${line.qty}x ${line.name} — ${formatMoney(line.lineTotal, line.currency)}`)
      .join('\n');

    return {
      orderId,
      customer,
      shippingAddress,
      lines,
      orderItemsText,
      total: formatMoney(t.total, currency),
      subtotal: formatMoney(t.goods, currency),
      shippingFee: formatMoney(t.shipping, currency),
      companyName: catalog.company?.name || 'Synvorax Labs',
      adminEmail: catalog.email?.adminEmail || 'synvorax@gmail.com',
      couponCode: appliedCoupon?.code || '',
    };
  }

  function couponCopy() {
    return catalog.cart || {};
  }

  function setCouponMessage(text, isError = false) {
    const el = document.getElementById('coupon-message');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.classList.toggle('is-error', Boolean(isError && text));
  }

  function syncCouponUi() {
    const input = document.getElementById('coupon-input');
    const applyBtn = document.getElementById('coupon-apply');
    const removeBtn = document.getElementById('coupon-remove');
    const active = Boolean(appliedCoupon);

    if (input) {
      if (active) input.value = appliedCoupon.code;
      input.readOnly = active;
    }
    if (applyBtn) applyBtn.hidden = active;
    if (removeBtn) removeBtn.hidden = !active;
  }

  async function requestCoupon(code, goods) {
    const endpoint = catalog.orders?.endpoint;
    if (!isConfigured(endpoint)) {
      throw new Error('Order endpoint is not configured');
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'validateCoupon',
        code,
        subtotal: goods,
      }),
    });

    if (!res.ok) throw new Error(`Coupon endpoint returned ${res.status}`);
    const result = await res.json();
    if (!result.ok) throw new Error(result.error || couponCopy().couponInvalid || 'Invalid code');
    return result;
  }

  async function applyCouponFromInput() {
    const input = document.getElementById('coupon-input');
    const applyBtn = document.getElementById('coupon-apply');
    const copy = couponCopy();
    const code = String(input?.value || '').trim();

    if (!code) {
      setCouponMessage(copy.couponInvalid || 'Enter a discount code.', true);
      return;
    }

    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.textContent = 'Checking…';
    }

    try {
      appliedCoupon = await requestCoupon(code, subtotal());
      setCouponMessage(`${appliedCoupon.code} applied — ${appliedCoupon.label}.`);
      syncCouponUi();
      render();
    } catch (err) {
      appliedCoupon = null;
      setCouponMessage(err.message || copy.couponInvalid, true);
      syncCouponUi();
      render();
    } finally {
      if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.textContent = copy.couponApply || 'Apply';
      }
    }
  }

  function removeCoupon() {
    appliedCoupon = null;
    const input = document.getElementById('coupon-input');
    if (input) input.value = '';
    setCouponMessage('');
    syncCouponUi();
    render();
  }

  async function refreshCoupon() {
    if (!appliedCoupon) return;
    const id = ++couponCheck;
    const code = appliedCoupon.code;
    try {
      const quoted = await requestCoupon(code, subtotal());
      if (id !== couponCheck) return;
      appliedCoupon = quoted;
      render();
      syncCouponUi();
    } catch (err) {
      if (id !== couponCheck) return;
      appliedCoupon = null;
      setCouponMessage(err.message || couponCopy().couponInvalid, true);
      syncCouponUi();
      render();
    }
  }

  function isConfigured(value) {
    return Boolean(value) && !String(value).startsWith('REPLACE_');
  }

  async function submitOrder(order) {
    const endpoint = catalog.orders?.endpoint;

    if (isConfigured(endpoint)) {
      // text/plain keeps this a simple request, so Apps Script never sees a CORS preflight
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(order),
      });

      if (!res.ok) throw new Error(`Order endpoint returned ${res.status}`);

      const result = await res.json();
      if (!result.ok) throw new Error(result.error || 'Order was rejected');
      return;
    }

    await sendEmails(order);
  }

  async function sendEmails(order) {
    const cfg = catalog.email || {};
    if (cfg.provider !== 'emailjs') {
      throw new Error('Email provider not configured');
    }

    const missing = ['publicKey', 'serviceId', 'customerTemplateId', 'adminTemplateId']
      .filter(key => !isConfigured(cfg[key]));
    if (missing.length) {
      throw new Error(`EmailJS not configured (${missing.join(', ')})`);
    }

    if (typeof emailjs === 'undefined') {
      throw new Error('EmailJS library failed to load');
    }

    emailjs.init({ publicKey: cfg.publicKey });

    const params = {
      order_id: order.orderId,
      customer_name: order.customer.fullName,
      customer_email: order.customer.email,
      customer_phone: order.customer.phone,
      shipping_address: order.shippingAddress,
      order_items: order.orderItemsText,
      order_total: order.total,
      notes: order.customer.notes || '—',
      company_name: order.companyName,
      admin_email: order.adminEmail,
      reply_to: order.customer.email,
    };

    await emailjs.send(cfg.serviceId, cfg.customerTemplateId, {
      ...params,
      to_email: order.customer.email,
    });

    await emailjs.send(cfg.serviceId, cfg.adminTemplateId, {
      ...params,
      to_email: order.adminEmail,
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting || !items.length) return;

    const form = e.currentTarget;
    const submitBtn = form.querySelector('[type="submit"]');
    const errorEl = document.getElementById('checkout-error');
    const copy = catalog.cart || {};

    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }

    submitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = copy.placingOrderLabel || 'Placing order…';
    }

    try {
      const order = buildOrderPayload(form);
      await submitOrder(order);
      clear();
      form.reset();
      const successText = document.getElementById('success-text');
      if (successText) {
        successText.textContent = copy.successText || 'Thank you! A payment link will be sent to your email shortly.';
      }
      showPanel('success');
    } catch (err) {
      console.error('Checkout failed:', err);
      if (errorEl) {
        errorEl.textContent = copy.errorText || 'We could not send your order. Please try again.';
        errorEl.hidden = false;
      }
    } finally {
      submitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = copy.placeOrderLabel || 'Place Order';
      }
    }
  }

  function bindUi() {
    document.getElementById('cart-toggle')?.addEventListener('click', open);
    drawer.querySelector('.cart-drawer__close')?.addEventListener('click', close);
    drawer.querySelector('.cart-drawer__backdrop')?.addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('active')) close();
    });

    document.addEventListener('click', (e) => {
      const openLink = e.target.closest('a[href="#cart"], button[data-open-cart]');
      if (openLink) {
        e.preventDefault();
        open();
      }

      const addBtn = e.target.closest('[data-add-to-cart]');
      if (addBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = addBtn.dataset.addToCart;
        if (add(id)) {
          const label = catalog.cart?.addedLabel || 'Added';
          const original = addBtn.dataset.label || addBtn.textContent;
          const fromModal = Boolean(addBtn.closest('#modal'));
          addBtn.dataset.label = original;
          addBtn.textContent = label;
          addBtn.classList.add('is-added');
          setTimeout(() => {
            addBtn.textContent = original;
            addBtn.classList.remove('is-added');
            if (fromModal && window.ModalManager) ModalManager.close();
          }, fromModal ? 600 : 1200);
        }
      }
    });

    drawer.querySelector('#cart-items')?.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-remove]');
      if (removeBtn) {
        remove(removeBtn.dataset.remove);
        return;
      }

      const dec = e.target.closest('[data-qty-dec]');
      if (dec) {
        const line = items.find(item => item.id === dec.dataset.qtyDec);
        if (line) setQty(line.id, line.qty - 1);
        return;
      }

      const inc = e.target.closest('[data-qty-inc]');
      if (inc) {
        const line = items.find(item => item.id === inc.dataset.qtyInc);
        if (line) setQty(line.id, line.qty + 1);
      }
    });

    drawer.querySelector('#cart-to-checkout')?.addEventListener('click', () => {
      if (!items.length) return;
      showPanel('checkout');
    });

    drawer.querySelector('#checkout-back')?.addEventListener('click', () => showPanel('cart'));
    drawer.querySelector('#success-close')?.addEventListener('click', () => {
      showPanel('cart');
      close();
    });

    drawer.querySelector('#checkout-form')?.addEventListener('submit', onSubmit);
    drawer.querySelector('#coupon-apply')?.addEventListener('click', applyCouponFromInput);
    drawer.querySelector('#coupon-remove')?.addEventListener('click', removeCoupon);
    drawer.querySelector('#coupon-input')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (!appliedCoupon) applyCouponFromInput();
    });
  }

  function init(data) {
    catalog = data;
    items = load();
    normalizeItems();
    drawer = document.getElementById('cart-drawer');
    if (!drawer) return;

    bindUi();
    applyCopy();
    render();
    updateBadge();
    syncCouponUi();
  }

  return { init, open, close, add, count };
})();

window.CartManager = CartManager;
