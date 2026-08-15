/**
 * Synvorax Labs — Orders Backoffice
 */

(() => {
  const TOKEN_KEY = 'synvorax-admin-token';
  const STATUSES = ['Pending payment', 'Paid', 'Shipped', 'Cancelled'];

  let endpoint = null;
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let orders = [];
  let coupons = [];
  let statusFilter = 'all';
  let query = '';

  const el = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function statusSlug(status) {
    return String(status || '').toLowerCase().replace(/[^a-z]+/g, '-');
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '—');
    return date.toLocaleString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function parseAmount(total) {
    const match = String(total || '').match(/[\d.,]+/);
    if (!match) return 0;
    return Number(match[0].replace(/,/g, '')) || 0;
  }

  async function loadConfig() {
    const res = await fetch('data/catalog.json');
    const data = await res.json();
    endpoint = data.orders?.endpoint;

    if (!endpoint || endpoint.startsWith('REPLACE_')) {
      throw new Error('Order endpoint is not configured in data/catalog.json');
    }
  }

  async function apiList() {
    const url = `${endpoint}?action=list&token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Request rejected');
    return data.orders || [];
  }

  async function apiUpdateStatus(orderId, status) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'updateStatus', token, orderId, status }),
    });

    if (!res.ok) throw new Error(`Request failed (${res.status})`);

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Update rejected');
  }

  async function apiListCoupons() {
    const url = `${endpoint}?action=listCoupons&token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Request rejected');
    if (!Array.isArray(data.coupons)) {
      throw new Error('Apps Script still on the old version. Deploy a new version of Code.gs.');
    }
    return data.coupons;
  }

  async function apiCreateCoupon(payload) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'createCoupon', token, ...payload }),
    });

    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const data = await res.json();
    if (!data.ok) {
      const stale = /invalid order payload/i.test(data.error || '');
      throw new Error(stale
        ? 'Apps Script still on the old version. Deploy a new version of Code.gs.'
        : (data.error || 'Could not create coupon'));
    }
    return data.coupon;
  }

  async function apiToggleCoupon(code, active) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'toggleCoupon', token, code, active }),
    });

    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Could not update coupon');
  }

  function showFeedback(message, isError = false) {
    const box = el('feedback');
    box.textContent = message;
    box.classList.toggle('feedback--error', isError);
    box.hidden = !message;
    if (message && !isError) setTimeout(() => { box.hidden = true; }, 2500);
  }

  function filtered() {
    const q = query.trim().toLowerCase();
    return orders.filter(order => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (!q) return true;
      return [order.orderId, order.name, order.email]
        .some(field => String(field || '').toLowerCase().includes(q));
    });
  }

  function renderStats() {
    const total = orders.length;
    const pending = orders.filter(o => o.status === 'Pending payment').length;
    const revenue = orders
      .filter(o => o.status !== 'Cancelled')
      .reduce((sum, o) => sum + parseAmount(o.total), 0);

    const cards = [
      { label: 'Total orders', value: total },
      { label: 'Pending payment', value: pending },
      { label: 'Revenue', value: `€${revenue.toFixed(2)}` },
    ];

    el('stats').innerHTML = cards.map(card => `
      <article class="stat">
        <span class="stat__label">${card.label}</span>
        <strong class="stat__value">${card.value}</strong>
      </article>
    `).join('');
  }

  function renderFilters() {
    const options = ['all', ...STATUSES];
    el('status-filters').innerHTML = options.map(option => `
      <button type="button" class="chip ${statusFilter === option ? 'active' : ''}" data-status="${escapeHtml(option)}">
        ${option === 'all' ? 'All' : escapeHtml(option)}
      </button>
    `).join('');
  }

  function renderTable() {
    const rows = filtered();
    el('empty').hidden = rows.length > 0;

    el('orders-body').innerHTML = rows.map(order => `
      <tr data-order="${escapeHtml(order.orderId)}">
        <td>${formatDate(order.timestamp)}</td>
        <td class="mono">${escapeHtml(order.orderId)}</td>
        <td>
          <div class="cell-strong">${escapeHtml(order.name)}</div>
          <div class="cell-sub">${escapeHtml(order.email)}</div>
        </td>
        <td class="cell-total">${escapeHtml(order.total)}</td>
        <td><span class="badge badge--${statusSlug(order.status)}">${escapeHtml(order.status)}</span></td>
      </tr>
    `).join('');
  }

  function renderCoupons() {
    const rows = coupons;
    const empty = el('coupons-empty');
    const body = el('coupons-body');
    if (!body) return;

    if (empty) empty.hidden = rows.length > 0;

    body.innerHTML = rows.map(coupon => {
      const discount = coupon.type === 'percent'
        ? `${coupon.value}%`
        : `€${Number(coupon.value).toFixed(2)}`;
      const uses = coupon.maxUses > 0
        ? `${coupon.usedCount} / ${coupon.maxUses}`
        : `${coupon.usedCount} / ∞`;
      const expires = coupon.expires
        ? formatDate(coupon.expires).replace(/, \d{2}:\d{2}$/, '')
        : 'No expiry';
      const nextActive = !coupon.active;

      return `
        <tr>
          <td class="mono">${escapeHtml(coupon.code)}</td>
          <td>${escapeHtml(discount)}</td>
          <td>${coupon.minSubtotal ? `€${Number(coupon.minSubtotal).toFixed(2)}` : '—'}</td>
          <td>${escapeHtml(uses)}</td>
          <td>${escapeHtml(expires)}</td>
          <td><span class="badge badge--${coupon.active ? 'paid' : 'cancelled'}">${coupon.active ? 'Active' : 'Off'}</span></td>
          <td>
            <button type="button" class="btn btn--ghost btn--small" data-toggle-coupon="${escapeHtml(coupon.code)}" data-active="${nextActive}">
              ${coupon.active ? 'Deactivate' : 'Activate'}
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function render() {
    renderStats();
    renderFilters();
    renderTable();
    renderCoupons();
  }

  function openDetail(orderId) {
    const order = orders.find(o => o.orderId === orderId);
    if (!order) return;

    const address = [order.address, order.city, order.postalCode, order.country]
      .filter(Boolean).join(', ');

    el('detail-title').textContent = order.orderId;
    el('detail-body').innerHTML = `
      <div class="field"><span>Date</span><p>${formatDate(order.timestamp)}</p></div>
      <div class="field"><span>Customer</span><p>${escapeHtml(order.name)}</p></div>
      <div class="field"><span>Email</span><p><a href="mailto:${escapeHtml(order.email)}">${escapeHtml(order.email)}</a></p></div>
      <div class="field"><span>Phone</span><p>${escapeHtml(order.phone)}</p></div>
      <div class="field"><span>Shipping address</span><p>${escapeHtml(address)}</p></div>
      <div class="field"><span>Items</span><pre>${escapeHtml(order.items)}</pre></div>
      <div class="field"><span>Total</span><p class="cell-total">${escapeHtml(order.total)}</p></div>
      <div class="field"><span>Notes</span><p>${escapeHtml(order.notes || '—')}</p></div>
      <div class="field">
        <span>Status</span>
        <select id="detail-status">
          ${STATUSES.map(s => `<option value="${escapeHtml(s)}" ${s === order.status ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
        </select>
      </div>
      <button type="button" class="btn btn--primary" id="save-status" data-order="${escapeHtml(order.orderId)}">Save status</button>
      <p class="detail__error" id="detail-error" hidden></p>
    `;

    el('detail').classList.add('active');
    el('detail').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeDetail() {
    el('detail').classList.remove('active');
    el('detail').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  async function saveStatus(orderId) {
    const select = el('detail-status');
    const button = el('save-status');
    const errorEl = el('detail-error');
    const status = select.value;

    button.disabled = true;
    button.textContent = 'Saving…';
    errorEl.hidden = true;

    try {
      await apiUpdateStatus(orderId, status);
      const order = orders.find(o => o.orderId === orderId);
      if (order) order.status = status;
      render();
      closeDetail();
      showFeedback(`${orderId} updated to “${status}”.`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = 'Save status';
    }
  }

  async function loadDashboard() {
    const [orderList, couponList] = await Promise.all([apiList(), apiListCoupons()]);
    orders = orderList;
    coupons = couponList;
  }

  async function refresh() {
    const button = el('refresh');
    button.disabled = true;
    try {
      await loadDashboard();
      render();
    } catch (err) {
      showFeedback(err.message, true);
      if (/unauthorized/i.test(err.message)) signOut();
    } finally {
      button.disabled = false;
    }
  }

  function showLogin(message) {
    el('app').hidden = true;
    el('login').hidden = false;
    const errorEl = el('login-error');
    errorEl.textContent = message || '';
    errorEl.hidden = !message;
  }

  function showApp() {
    const errorEl = el('login-error');
    errorEl.textContent = '';
    errorEl.hidden = true;
    el('login').hidden = true;
    el('app').hidden = false;
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    token = '';
    orders = [];
    coupons = [];
    showLogin();
  }

  function bindEvents() {
    el('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = el('token-input');
      const button = e.currentTarget.querySelector('button');
      token = input.value.trim();
      if (!token) return;

      button.disabled = true;
      button.textContent = 'Checking…';

      try {
        await loadDashboard();
        localStorage.setItem(TOKEN_KEY, token);
        input.value = '';
        showApp();
        render();
      } catch (err) {
        token = '';
        showLogin(err.message);
      } finally {
        button.disabled = false;
        button.textContent = 'Sign in';
      }
    });

    el('logout').addEventListener('click', signOut);
    el('refresh').addEventListener('click', refresh);

    el('search').addEventListener('input', (e) => {
      query = e.target.value;
      renderTable();
    });

    el('status-filters').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-status]');
      if (!chip) return;
      statusFilter = chip.dataset.status;
      renderFilters();
      renderTable();
    });

    el('orders-body').addEventListener('click', (e) => {
      const row = e.target.closest('[data-order]');
      if (row) openDetail(row.dataset.order);
    });

    el('coupon-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const fd = new FormData(form);
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      button.textContent = 'Saving…';
      try {
        await apiCreateCoupon({
          code: fd.get('code'),
          type: fd.get('type'),
          value: fd.get('value'),
          minSubtotal: fd.get('minSubtotal') || 0,
          maxUses: fd.get('maxUses') || 0,
          expires: fd.get('expires') || '',
          note: fd.get('note') || '',
        });
        form.reset();
        coupons = await apiListCoupons();
        renderCoupons();
        showFeedback('Coupon created.');
      } catch (err) {
        showFeedback(err.message, true);
      } finally {
        button.disabled = false;
        button.textContent = 'Create coupon';
      }
    });

    el('coupons-body').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-toggle-coupon]');
      if (!btn) return;
      btn.disabled = true;
      try {
        await apiToggleCoupon(btn.dataset.toggleCoupon, btn.dataset.active === 'true');
        coupons = await apiListCoupons();
        renderCoupons();
      } catch (err) {
        showFeedback(err.message, true);
      } finally {
        btn.disabled = false;
      }
    });

    el('detail-body').addEventListener('click', (e) => {
      const save = e.target.closest('#save-status');
      if (save) saveStatus(save.dataset.order);
    });

    document.querySelector('.detail__close').addEventListener('click', closeDetail);
    document.querySelector('.detail__backdrop').addEventListener('click', closeDetail);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDetail();
    });
  }

  async function init() {
    bindEvents();

    try {
      await loadConfig();
    } catch (err) {
      showLogin(err.message);
      return;
    }

    if (!token) {
      showLogin();
      return;
    }

    try {
      await loadDashboard();
      showApp();
      render();
    } catch (err) {
      showLogin(err.message);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
