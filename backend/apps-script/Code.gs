/**
 * Synvorax Labs — order intake and admin API
 * Deploy as a Web App (Execute as: Me, Access: Anyone) and paste the URL
 * into data/catalog.json under orders.endpoint
 *
 * When updating this file, keep the ADMIN_TOKEN already in the Apps Script editor.
 */

const SHEET_NAME = 'Orders';
const COUPON_SHEET_NAME = 'Coupons';
const ADMIN_EMAIL = 'synvorax@gmail.com';
const COMPANY_NAME = 'Synvorax Labs';

// Shared secret for the backoffice. Replace with a long random string.
const ADMIN_TOKEN = 'CHANGE_ME_TO_A_LONG_RANDOM_STRING';

const SHIPPING_FEE = 10;
const FREE_SHIPPING_THRESHOLD = 200;

const HEADERS = [
  'Timestamp',
  'Order ID',
  'Name',
  'Email',
  'Phone',
  'Address',
  'City',
  'Postal Code',
  'Country',
  'Items',
  'Total',
  'Notes',
  'Status',
];

const COUPON_HEADERS = [
  'Code',
  'Type',
  'Value',
  'Min Subtotal',
  'Max Uses',
  'Used Count',
  'Expires',
  'Active',
  'Note',
];

const STATUS_COLUMN = HEADERS.indexOf('Status') + 1;
const COUPON_USED_COLUMN = COUPON_HEADERS.indexOf('Used Count') + 1;
const COUPON_ACTIVE_COLUMN = COUPON_HEADERS.indexOf('Active') + 1;

function doGet(e) {
  const params = (e && e.parameter) || {};

  if (params.action === 'list') {
    if (params.token !== ADMIN_TOKEN) {
      return jsonResponse({ ok: false, error: 'Unauthorized' });
    }
    return jsonResponse({ ok: true, orders: listOrders() });
  }

  if (params.action === 'listCoupons') {
    if (params.token !== ADMIN_TOKEN) {
      return jsonResponse({ ok: false, error: 'Unauthorized' });
    }
    return jsonResponse({ ok: true, coupons: listCoupons() });
  }

  return jsonResponse({ ok: true, service: COMPANY_NAME + ' orders', version: 'coupons-1' });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.action === 'updateStatus') {
      if (payload.token !== ADMIN_TOKEN) {
        return jsonResponse({ ok: false, error: 'Unauthorized' });
      }
      const updated = updateStatus(payload.orderId, payload.status);
      return jsonResponse({ ok: updated, error: updated ? null : 'Order not found' });
    }

    if (payload.action === 'createCoupon') {
      if (payload.token !== ADMIN_TOKEN) {
        return jsonResponse({ ok: false, error: 'Unauthorized' });
      }
      return jsonResponse(createCoupon(payload));
    }

    if (payload.action === 'toggleCoupon') {
      if (payload.token !== ADMIN_TOKEN) {
        return jsonResponse({ ok: false, error: 'Unauthorized' });
      }
      const updated = toggleCoupon(payload.code, payload.active);
      return jsonResponse({ ok: updated, error: updated ? null : 'Coupon not found' });
    }

    if (payload.action === 'validateCoupon') {
      const quoted = quoteCoupon(payload.code, Number(payload.subtotal) || 0);
      return jsonResponse(quoted);
    }

    if (!payload.customer || !payload.customer.email || !payload.lines || !payload.lines.length) {
      return jsonResponse({ ok: false, error: 'Invalid order payload' });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      applyPricing(payload);
      appendOrder(payload);
      sendCustomerEmail(payload);
      sendAdminEmail(payload);
      return jsonResponse({
        ok: true,
        orderId: payload.orderId,
        total: payload.total,
        discount: payload.discountAmount || 0,
      });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err.message || err) });
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function isActiveFlag(value) {
  const text = String(value).trim().toLowerCase();
  return value === true || text === 'true' || text === 'yes' || text === '1';
}

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function getSheet() {
  return getOrCreateSheet(SHEET_NAME, HEADERS);
}

function getCouponSheet() {
  return getOrCreateSheet(COUPON_SHEET_NAME, COUPON_HEADERS);
}

/** Values such as phone numbers ("+351...") would be parsed as formulas by Sheets. */
function asText(value) {
  const text = value == null ? '' : String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function productLines(lines) {
  return (lines || []).filter(function (line) {
    return line && line.id !== 'delivery' && line.id !== 'discount';
  });
}

function goodsTotal(lines) {
  return roundMoney(productLines(lines).reduce(function (sum, line) {
    return sum + Number(line.lineTotal || 0);
  }, 0));
}

function shippingFor(goods) {
  return goods >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
}

function couponRowToObject(row, index) {
  const expires = row[6];
  return {
    rowIndex: index + 2,
    code: normalizeCode(row[0]),
    type: String(row[1] || 'fixed').toLowerCase(),
    value: Number(row[2]) || 0,
    minSubtotal: Number(row[3]) || 0,
    maxUses: Number(row[4]) || 0,
    usedCount: Number(row[5]) || 0,
    expires: expires instanceof Date ? expires.toISOString() : String(expires || ''),
    expiresDate: expires instanceof Date ? expires : null,
    active: isActiveFlag(row[7]),
    note: String(row[8] || ''),
  };
}

function findCoupon(code) {
  const wanted = normalizeCode(code);
  if (!wanted) return null;

  const sheet = getCouponSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, COUPON_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const coupon = couponRowToObject(values[i], i);
    if (coupon.code === wanted) return coupon;
  }
  return null;
}

function couponError(coupon, goods) {
  if (!coupon || !coupon.active) return 'This discount code is not valid.';
  if (coupon.expiresDate && coupon.expiresDate.getTime() < Date.now()) {
    return 'This discount code has expired.';
  }
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
    return 'This discount code has already been used.';
  }
  if (goods < coupon.minSubtotal) {
    return 'This code requires a subtotal of €' + coupon.minSubtotal.toFixed(2) + '.';
  }
  if (coupon.value <= 0) return 'This discount code is not valid.';
  return '';
}

function discountFor(coupon, goods) {
  if (!coupon) return 0;
  if (coupon.type === 'percent') {
    return roundMoney(Math.min(goods, goods * (coupon.value / 100)));
  }
  return roundMoney(Math.min(goods, coupon.value));
}

function quoteCoupon(code, goods) {
  const coupon = findCoupon(code);
  const error = couponError(coupon, goods);
  if (error) return { ok: false, error: error };

  const discount = discountFor(coupon, goods);
  return {
    ok: true,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    discount: discount,
    label: coupon.type === 'percent' ? coupon.value + '% off' : '€' + coupon.value.toFixed(2) + ' off',
  };
}

function redeemCoupon(code, goods) {
  const quoted = quoteCoupon(code, goods);
  if (!quoted.ok) {
    throw new Error(quoted.error);
  }

  const coupon = findCoupon(code);
  getCouponSheet().getRange(coupon.rowIndex, COUPON_USED_COLUMN).setValue(coupon.usedCount + 1);
  return quoted;
}

function applyPricing(order) {
  const lines = productLines(order.lines);
  if (!lines.length) {
    throw new Error('Invalid order payload');
  }

  const goods = goodsTotal(lines);
  const shipping = shippingFor(goods);
  let discount = 0;
  let couponQuote = null;
  const code = normalizeCode(order.couponCode);

  if (code) {
    couponQuote = redeemCoupon(code, goods);
    discount = couponQuote.discount;
  }

  const total = roundMoney(goods - discount + shipping);
  const currency = (lines[0] && lines[0].currency) || 'EUR';

  if (discount > 0 && couponQuote) {
    lines.push({
      id: 'discount',
      name: 'Coupon ' + couponQuote.code + ' (' + couponQuote.label + ')',
      qty: 1,
      unitPrice: -discount,
      lineTotal: -discount,
      currency: currency,
    });
  }

  lines.push({
    id: 'delivery',
    name: shipping ? 'Delivery' : 'Delivery — Free',
    qty: 1,
    unitPrice: shipping,
    lineTotal: shipping,
    currency: currency,
  });

  order.lines = lines;
  order.subtotal = '€' + goods.toFixed(2);
  order.shippingFee = shipping ? '€' + shipping.toFixed(2) : 'Free';
  order.discountAmount = discount;
  order.couponCode = couponQuote ? couponQuote.code : '';
  order.total = '€' + total.toFixed(2);
  order.orderItemsText = lines.map(function (line) {
    return line.qty + 'x ' + line.name + ' — €' + Number(line.lineTotal).toFixed(2);
  }).join('\n');
}

function createCoupon(payload) {
  const code = normalizeCode(payload.code);
  const type = String(payload.type || 'fixed').toLowerCase();
  const value = Number(payload.value) || 0;

  if (!code || !/^[A-Z0-9_-]{3,24}$/.test(code)) {
    return { ok: false, error: 'Use 3–24 letters, numbers, _ or -.' };
  }
  if (type !== 'percent' && type !== 'fixed') {
    return { ok: false, error: 'Type must be percent or fixed.' };
  }
  if (value <= 0) {
    return { ok: false, error: 'Value must be greater than 0.' };
  }
  if (type === 'percent' && value > 100) {
    return { ok: false, error: 'Percent cannot exceed 100.' };
  }
  if (findCoupon(code)) {
    return { ok: false, error: 'That code already exists.' };
  }

  let expires = payload.expires || '';
  if (expires) {
    const date = new Date(expires);
    if (isNaN(date.getTime())) {
      return { ok: false, error: 'Invalid expiry date.' };
    }
    expires = date;
  }

  getCouponSheet().appendRow([
    code,
    type,
    value,
    Number(payload.minSubtotal) || 0,
    Number(payload.maxUses) || 0,
    0,
    expires,
    true,
    asText(payload.note),
  ]);

  return { ok: true, coupon: findCoupon(code) };
}

function listCoupons() {
  const sheet = getCouponSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet.getRange(2, 1, lastRow - 1, COUPON_HEADERS.length).getValues()
    .map(function (row, index) {
      const coupon = couponRowToObject(row, index);
      delete coupon.expiresDate;
      delete coupon.rowIndex;
      return coupon;
    })
    .reverse();
}

function toggleCoupon(code, active) {
  const coupon = findCoupon(code);
  if (!coupon) return false;
  getCouponSheet().getRange(coupon.rowIndex, COUPON_ACTIVE_COLUMN).setValue(Boolean(active));
  return true;
}

function appendOrder(order) {
  const c = order.customer;
  const notes = [order.couponCode ? 'Coupon: ' + order.couponCode : '', c.notes || '']
    .filter(Boolean)
    .join(' — ');

  getSheet().appendRow([
    new Date(),
    asText(order.orderId),
    asText(c.fullName),
    asText(c.email),
    asText(c.phone),
    asText(c.address),
    asText(c.city),
    asText(c.postalCode),
    asText(c.country),
    asText(order.orderItemsText),
    asText(order.total),
    asText(notes),
    'Pending payment',
  ]);
}

function listOrders() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();

  return values.map(function (row) {
    const timestamp = row[0];
    return {
      timestamp: timestamp instanceof Date ? timestamp.toISOString() : String(timestamp),
      orderId: row[1],
      name: row[2],
      email: row[3],
      phone: row[4],
      address: row[5],
      city: row[6],
      postalCode: row[7],
      country: row[8],
      items: row[9],
      total: row[10],
      notes: row[11],
      status: row[12],
    };
  }).reverse();
}

function updateStatus(orderId, status) {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const ids = sheet.getRange(2, 2, lastRow - 1, 1).getValues();

  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === orderId) {
      sheet.getRange(i + 2, STATUS_COLUMN).setValue(status);
      return true;
    }
  }

  return false;
}

function itemsTable(order) {
  const rows = order.lines.map(function (line) {
    return '<tr>' +
      '<td style="padding:6px 12px 6px 0">' + line.qty + '&times; ' + line.name + '</td>' +
      '<td style="padding:6px 0;text-align:right">€' + Number(line.lineTotal).toFixed(2) + '</td>' +
      '</tr>';
  }).join('');

  return '<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' + rows + '</table>';
}

function sendCustomerEmail(order) {
  const body =
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">' +
    '<p>Hi ' + order.customer.fullName + ',</p>' +
    '<p>We have received your order <strong>' + order.orderId + '</strong>.</p>' +
    itemsTable(order) +
    '<p><strong>Total: ' + order.total + '</strong></p>' +
    '<p>Shipping to: ' + order.shippingAddress + '</p>' +
    '<p>A payment link will be sent to this email address shortly.</p>' +
    '<p>&mdash; ' + COMPANY_NAME + '</p>' +
    '</div>';

  MailApp.sendEmail({
    to: order.customer.email,
    subject: 'Order received — ' + order.orderId,
    htmlBody: body,
    name: COMPANY_NAME,
    replyTo: ADMIN_EMAIL,
  });
}

function sendAdminEmail(order) {
  const c = order.customer;
  const body =
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">' +
    '<p><strong>New order ' + order.orderId + '</strong></p>' +
    '<p>' +
    'Customer: ' + c.fullName + '<br>' +
    'Email: ' + c.email + '<br>' +
    'Phone: ' + c.phone + '<br>' +
    'Address: ' + order.shippingAddress +
    '</p>' +
    itemsTable(order) +
    '<p><strong>Total: ' + order.total + '</strong></p>' +
    '<p>Notes: ' + (c.notes || '—') + '</p>' +
    '</div>';

  MailApp.sendEmail({
    to: ADMIN_EMAIL,
    subject: 'New order ' + order.orderId + ' — ' + c.fullName,
    htmlBody: body,
    name: COMPANY_NAME,
    replyTo: c.email,
  });
}
