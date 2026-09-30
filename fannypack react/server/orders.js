import crypto from 'node:crypto';
import { Router } from 'express';
import { query, tx } from './db.js';
import { requireAuth } from './auth.js';
import { saveAddress } from './account.js';
import { createRazorpayOrder, razorpayEnabled, verifyPaymentSignature } from './integrations/razorpay.js';
import { cancelShiprocketOrder, shiprocketConfig, shiprocketConnected } from './integrations/shiprocket.js';
import { getSetting } from './lib/settings.js';
import { checkServiceable } from './lib/delivery.js';
import { evaluateDiscount, releaseDiscount } from './lib/discounts.js';
import { changeStock, restockOrder } from './lib/inventory.js';
import { addHistory, trackingSteps } from './lib/orderHistory.js';
import { notify } from './lib/notify.js';
import { markOrderPaid, recordPaymentFailure, refundOrder } from './lib/payments.js';
import { autoCreateShipment } from './lib/fulfilment.js';
import { sendOrderEmail } from './lib/customerMail.js';
import { normalizeState, stateCode, STATE_NAMES } from './lib/states.js';
import { MAX_SHOWN_STOCK } from './catalog.js';

const PENDING_PAYMENT_TTL_MIN = 30;
// A shopper can cancel until the parcel has been handed to the courier
const CUSTOMER_CANCELLABLE = ['placed', 'confirmed', 'processing'];
const SHIPPED_STATES = ['picked_up', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'rto', 'rto_delivered'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- validation ----------

function cleanItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'Your cart is empty.');
  if (items.length > 20) throw new HttpError(400, 'Too many different items in one order.');
  const merged = new Map();
  for (const it of items) {
    const variantId = Number(it?.variantId);
    const qty = Number(it?.qty);
    if (!Number.isInteger(variantId) || variantId <= 0) throw new HttpError(400, 'Invalid product in cart.');
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new HttpError(400, 'Quantity must be between 1 and 99.');
    merged.set(variantId, Math.min(99, (merged.get(variantId) || 0) + qty));
  }
  return [...merged].map(([variantId, qty]) => ({ variantId, qty }));
}

function cleanCustomer(c = {}) {
  const s = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
  const out = {
    name: s(c.name),
    email: s(c.email).toLowerCase(),
    phone: String(c.phone ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''),
    address_line: s(c.address_line),
    city: s(c.city),
    state: normalizeState(c.state) || s(c.state),
    pin: s(c.pin),
  };
  const errors = {};
  if (out.name.length < 2 || out.name.length > 80) errors.name = 'Enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out.email)) errors.email = 'Enter a valid email.';
  if (!/^[6-9]\d{9}$/.test(out.phone)) errors.phone = 'Enter a valid 10-digit mobile number.';
  if (out.address_line.length < 5 || out.address_line.length > 250) errors.address_line = 'Enter your full address.';
  if (out.city.length < 2 || out.city.length > 60) errors.city = 'Enter your city.';
  if (!STATE_NAMES.includes(out.state)) errors.state = 'Choose your state.';
  if (!/^[1-9]\d{5}$/.test(out.pin)) errors.pin = 'Enter a 6-digit PIN code.';
  if (Object.keys(errors).length) {
    const err = new HttpError(400, 'Please check your details.');
    err.fields = errors;
    throw err;
  }
  return out;
}

// ---------- pricing ----------

function deliveryFor(subtotal, rule) {
  const fee = Number(rule?.fee) || 0;
  const freeAbove = Number(rule?.free_above) || 0;
  if (!fee || subtotal <= 0) return 0;
  if (freeAbove && subtotal >= freeAbove) return 0;
  return fee;
}

// Price the items from the database (never trust prices from the browser).
// With lock=true the variant rows are locked for the rest of the transaction.
async function quote(db, items, { code = null, userId = null, lock = false } = {}) {
  const ids = items.map((i) => i.variantId);
  const { rows } = await db.query(
    `SELECT v.id, v.product_id, v.option, v.price, v.stock, v.compare_at_price, v.image AS variant_image, p.slug, p.category_id, p.tax_rate, p.hsn,
            COALESCE(p.display_name, p.name) AS name, p.site_images AS images
     FROM product_variants v JOIN products p ON p.id = v.product_id
     WHERE v.id = ANY($1::int[]) AND p.active AND p.status = 'active'
     ${lock ? 'FOR UPDATE OF v' : ''}`,
    [ids]
  );
  const store = await getSetting('store');
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lines = items.map(({ variantId, qty }) => {
    const v = byId.get(variantId);
    if (!v) return { variantId, qty, error: 'This product is no longer available.' };
    const line = {
      variantId,
      productId: v.product_id,
      categoryId: v.category_id,
      slug: v.slug,
      name: v.name,
      option: v.option,
      // small thumbnails look best with the cut-out product shot, if there is one
      image: v.variant_image || v.images?.find((i) => /\.png$/i.test(i)) || v.images?.[0] || null,
      unitPrice: v.price,
      compareAt: v.compare_at_price || null,
      qty,
      lineTotal: v.price * qty,
      taxRate: Number(v.tax_rate) || Number(store.default_tax_rate) || 0,
      hsn: v.hsn || null,
      stock: Math.min(Math.max(v.stock, 0), MAX_SHOWN_STOCK),
    };
    if (v.stock < qty) line.error = v.stock > 0 ? `Only ${v.stock} left in stock.` : 'Out of stock.';
    return line;
  });
  const ok = lines.filter((l) => !l.error);
  const subtotal = ok.reduce((s, l) => s + l.lineTotal, 0);

  let discount = null;
  if (code) discount = await evaluateDiscount(db, code, { lines: ok, subtotal, userId, lock });
  const discountAmount = discount && !discount.error ? discount.amount : 0;
  const afterDiscount = subtotal - discountAmount;
  const delivery = deliveryFor(afterDiscount, await getSetting('shipping'));
  // Tax on the discounted amount. Prices include tax by default (tax is the part inside the price);
  // with "prices include tax" switched off it is added on top.
  const inclusive = store.tax_inclusive !== false;
  const ratio = subtotal ? afterDiscount / subtotal : 0;
  const tax = Math.round(
    ok.reduce((s, l) => s + (inclusive ? (l.lineTotal * l.taxRate) / (100 + l.taxRate) : (l.lineTotal * l.taxRate) / 100), 0) * ratio
  );
  return {
    lines, subtotal, discount, discountAmount, delivery, tax, taxInclusive: inclusive,
    total: afterDiscount + delivery + (inclusive ? 0 : tax),
  };
}

// Order number like FP-250930-7K3Q5 (checked for clashes)
async function newOrderNumber(db) {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  for (let i = 0; i < 10; i += 1) {
    const number = `FP-${ymd}-${crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 5)}`;
    const { rows } = await db.query(`SELECT 1 FROM orders WHERE number = $1`, [number]);
    if (!rows.length) return number;
  }
  throw new HttpError(503, 'Could not create an order number. Please try again.');
}

// An order can be opened by its owner (signed in) or with the secret token from checkout
async function findOrderWithToken(db, number, token, { lock = false, user = null } = {}) {
  const { rows } = await db.query(`SELECT * FROM orders WHERE number = $1 ${lock ? 'FOR UPDATE' : ''}`, [number]);
  const order = rows[0];
  const owner = order && user && order.user_id === user.id;
  const tokenOk = order && token && order.payment_token_hash === sha256(String(token));
  if (!owner && !tokenOk) throw new HttpError(404, 'Order not found.');
  return order;
}

const isShipped = (o) => ['shipped', 'delivered'].includes(o.status) || SHIPPED_STATES.includes(o.shipment_status || '');
const canCustomerCancel = (o) => CUSTOMER_CANCELLABLE.includes(o.status) && !isShipped(o);

function publicOrder(order, items, events = []) {
  return {
    number: order.number,
    status: order.status,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    name: order.name,
    email: order.email,
    phone: order.phone,
    address: { line: order.address_line, city: order.city, state: order.state, pin: order.pin },
    subtotal: order.subtotal,
    discount: order.discount_amount || 0,
    discountCode: order.discount_code || null,
    tax: order.tax_amount || 0,
    delivery: order.delivery,
    total: order.total,
    createdAt: order.created_at,
    cancelReason: order.cancel_reason || null,
    canCancel: canCustomerCancel(order),
    tracking: {
      steps: trackingSteps(order),
      shipmentStatus: order.shipment_status,
      courier: order.courier_name,
      awb: order.awb_code,
      url: order.tracking_url,
      expectedDelivery: order.expected_delivery,
      events: events.map((e) => ({ status: e.status, location: e.location, description: e.description, time: e.event_time || e.created_at })),
    },
    items: items.map((i) => ({
      productId: i.product_id, slug: i.slug || null, name: i.name, option: i.option,
      unitPrice: i.unit_price, qty: i.qty, lineTotal: i.line_total,
    })),
  };
}

const ITEMS_SQL = `SELECT i.*, p.slug FROM order_items i LEFT JOIN products p ON p.id = i.product_id WHERE i.order_id = $1 ORDER BY i.id`;

// ---------- routes ----------

export const orders = Router();

orders.get('/config', async (_req, res) => {
  const [store, delivery, shipping] = await Promise.all([getSetting('store'), getSetting('delivery'), getSetting('shipping')]);
  const allowedStates = delivery.gujarat_only ? ['Gujarat'] : (delivery.allowed_states || []).map(normalizeState).filter(Boolean);
  res.json({
    razorpay: await razorpayEnabled(),
    cod: store.cod_enabled !== false,
    storeOpen: store.store_open !== false,
    closedMessage: store.store_open === false ? store.closed_message : null,
    orderNote: store.order_notes || null,
    taxInclusive: store.tax_inclusive !== false,
    deliveryNote: delivery.gujarat_only ? 'We currently deliver within Gujarat only.' : allowedStates.length ? `We currently deliver to: ${allowedStates.join(', ')}.` : null,
    states: allowedStates.length ? allowedStates : STATE_NAMES,
    shipping: { fee: Number(shipping.fee) || 0, freeAbove: Number(shipping.free_above) || 0 },
  });
});

// Live price check for the cart / checkout pages (optionally with a coupon)
orders.post('/checkout/quote', async (req, res) => {
  const items = cleanItems(req.body?.items);
  const code = req.body?.code ? String(req.body.code).slice(0, 40) : null;
  res.json(await quote({ query }, items, { code, userId: req.user?.id }));
});

// Can we deliver here? (checked again when the order is placed)
orders.post('/checkout/serviceability', async (req, res) => {
  res.json(await checkServiceable({ state: req.body?.state, pin: String(req.body?.pin ?? '') }));
});

// Place an order (COD or online). Stock is reserved inside the transaction.
orders.post('/orders', requireAuth, async (req, res) => {
  const store = await getSetting('store');
  if (store.store_open === false) throw new HttpError(403, store.closed_message || 'The store is closed right now.');

  const items = cleanItems(req.body?.items);
  const customer = cleanCustomer(req.body?.customer);
  const fromCart = req.body?.fromCart === true;
  const code = req.body?.code ? String(req.body.code).slice(0, 40) : null;
  const method = req.body?.paymentMethod === 'online' ? 'online' : 'cod';
  if (method === 'online' && !(await razorpayEnabled())) {
    throw new HttpError(400, 'Online payment is not available right now. Please choose Cash on Delivery.');
  }
  if (method === 'cod' && store.cod_enabled === false) throw new HttpError(400, 'Cash on Delivery is not available right now. Please pay online.');

  const svc = await checkServiceable({ state: customer.state, pin: customer.pin });
  if (!svc.ok) {
    const err = new HttpError(400, svc.message);
    err.fields = { pin: svc.message };
    throw err;
  }

  const token = crypto.randomBytes(24).toString('hex');
  const placed = await tx(async (db) => {
    const q = await quote(db, items, { code, userId: req.user.id, lock: true });
    const bad = q.lines.find((l) => l.error);
    if (bad) {
      const err = new HttpError(409, `${bad.name || 'An item'}${bad.option ? ` (${bad.option})` : ''}: ${bad.error}`);
      err.quote = q;
      throw err;
    }
    if (q.discount?.error) {
      const err = new HttpError(400, q.discount.error);
      err.quote = q;
      throw err;
    }
    const { rows } = await db.query(
      `INSERT INTO orders (number, email, name, phone, address_line, city, state, pin,
                           payment_method, status, payment_status, subtotal, delivery, total, payment_token_hash, user_id,
                           discount_amount, discount_code, tax_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        await newOrderNumber(db), customer.email, customer.name, customer.phone, customer.address_line,
        customer.city, customer.state, customer.pin, method,
        method === 'cod' ? 'placed' : 'pending_payment',
        method === 'cod' ? 'cod' : 'pending',
        q.subtotal, q.delivery, q.total, sha256(token), req.user.id,
        q.discountAmount, q.discountAmount ? q.discount.code : null, q.tax,
      ]
    );
    const order = rows[0];
    for (const l of q.lines) {
      await db.query(
        `INSERT INTO order_items (order_id, product_id, variant_id, option, name, unit_price, qty, line_total, tax_rate, hsn)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [order.id, l.productId, l.variantId, l.option, l.name, l.unitPrice, l.qty, l.lineTotal, l.taxRate, l.hsn]
      );
      await changeStock(db, { variantId: l.variantId, delta: -l.qty, source: 'order', reason: `Order ${order.number}`, orderId: order.id });
    }
    if (q.discountAmount) {
      await db.query(`INSERT INTO discount_usages (discount_id, order_id, user_id, amount) VALUES ($1,$2,$3,$4)`, [q.discount.id, order.id, req.user.id, q.discountAmount]);
      await db.query(`UPDATE discounts SET used_count = used_count + 1, updated_at = now() WHERE id = $1`, [q.discount.id]);
    }
    await addHistory(db, order.id, method === 'cod' ? 'placed' : 'pending_payment', {
      note: method === 'cod' ? 'Cash on Delivery order placed' : 'Waiting for online payment',
      source: 'customer',
    });
    // Bought from the cart: take those items out of the saved cart
    if (fromCart) {
      await db.query(
        `DELETE FROM cart_items ci USING product_variants v
         WHERE ci.user_id = $1 AND v.id = ANY($2::int[]) AND ci.product_id = v.product_id AND ci.option = v.option`,
        [req.user.id, q.lines.map((l) => l.variantId)]
      );
    }
    // Remember the address for next time
    // (a savepoint, so a problem saving it can never cancel the order itself)
    if (req.body?.saveAddress !== false) {
      await db.query('SAVEPOINT save_address');
      try {
        await saveAddress(db, req.user.id, customer, { makeDefault: req.body?.saveAddress === 'default' });
      } catch {
        await db.query('ROLLBACK TO SAVEPOINT save_address');
      }
    }
    if (method === 'cod') {
      await notify({ type: 'new_order', title: `New order ${order.number} (COD)`, body: `₹${order.total} from ${order.name}`, link: `/admin/orders/${order.number}`, severity: 'good', email: true }, db);
    }
    return order;
  });

  const response = { number: placed.number, token, total: placed.total, paymentMethod: method };

  if (method === 'online') {
    try {
      const rp = await createRazorpayOrder({ amountPaise: placed.total * 100, receipt: placed.number, notes: { order_number: placed.number } });
      await query(`UPDATE orders SET razorpay_order_id = $1, updated_at = now() WHERE id = $2`, [rp.id, placed.id]);
      response.razorpay = {
        keyId: rp.keyId,
        orderId: rp.id,
        amount: rp.amount,
        currency: rp.currency,
        prefill: { name: customer.name, email: customer.email, contact: customer.phone },
      };
    } catch (err) {
      // Could not start the payment: give the stock (and coupon) back and cancel the order
      await tx(async (db) => {
        await restockOrder(db, placed.id, { source: 'release', reason: 'Payment could not start' });
        await releaseDiscount(db, placed.id);
        await db.query(`UPDATE orders SET status = 'cancelled', payment_status = 'failed', cancelled_at = now(), updated_at = now() WHERE id = $1`, [placed.id]);
        await addHistory(db, placed.id, 'cancelled', { note: `Payment could not start: ${err.message}` });
      });
      await notify({ type: 'integration_failure', title: 'Razorpay order creation failed', body: err.message, link: '/admin/integrations', severity: 'critical' });
      throw new HttpError(502, 'Online payment could not be started right now. Please try again or choose Cash on Delivery.');
    }
  } else {
    sendOrderEmail(placed.id, 'confirmed');
    const cfg = await shiprocketConfig().catch(() => ({}));
    if (cfg.auto_create_cod) autoCreateShipment(placed.id).catch(() => {});
  }

  res.status(201).json(response);
});

// Razorpay success callback from the browser: verify the signature server-side, then mark paid
orders.post('/orders/:number/verify', async (req, res) => {
  const { token, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  const order = await findOrderWithToken({ query }, req.params.number, token, { user: req.user });
  if (order.payment_method !== 'online' || order.razorpay_order_id !== razorpay_order_id) {
    throw new HttpError(400, 'Payment does not match this order.');
  }
  if (!(await verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature))) {
    throw new HttpError(400, 'Payment verification failed.');
  }
  const result = await markOrderPaid({ orderId: order.id, paymentId: razorpay_payment_id, amountPaise: order.total * 100, source: 'customer' });
  if (result.expired) {
    throw new HttpError(409, 'Your payment arrived after the order had expired, so it is being refunded automatically. Please place the order again.');
  }
  res.json({ number: order.number, paymentStatus: 'paid', status: result.order.status });
});

// Payment window closed / failed: release the reserved stock
orders.post('/orders/:number/cancel', async (req, res) => {
  const order = await findOrderWithToken({ query }, req.params.number, req.body?.token, { user: req.user });
  if (req.body?.error && order.razorpay_order_id) {
    await recordPaymentFailure({ razorpayOrderId: order.razorpay_order_id, paymentId: req.body?.paymentId ? String(req.body.paymentId).slice(0, 60) : null, error: String(req.body.error).slice(0, 300), source: 'customer' });
  }
  await tx(async (db) => {
    const { rows } = await db.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [order.id]);
    const o = rows[0];
    if (o.status === 'pending_payment' && o.payment_status !== 'paid' && !o.stock_released) {
      await restockOrder(db, o.id, { source: 'release', reason: 'Payment window closed' });
      await releaseDiscount(db, o.id);
      await db.query(`UPDATE orders SET status = 'cancelled', payment_status = 'failed', cancelled_at = now(), updated_at = now() WHERE id = $1`, [o.id]);
      await addHistory(db, o.id, 'cancelled', { note: 'Payment not completed', source: 'customer' });
    }
  });
  res.json({ ok: true });
});

async function orderEvents(orderId) {
  const { rows } = await query(`SELECT * FROM shipment_events WHERE order_id = $1 ORDER BY COALESCE(event_time, created_at) DESC LIMIT 50`, [orderId]);
  return rows;
}

// Order confirmation / tracking page
orders.get('/orders/:number', async (req, res) => {
  const order = await findOrderWithToken({ query }, req.params.number, req.query.token, { user: req.user });
  const { rows } = await query(ITEMS_SQL, [order.id]);
  res.json(publicOrder(order, rows, await orderEvents(order.id)));
});

// Tax invoice (GST): line tax split into CGST+SGST (same state) or IGST (other state)
orders.get('/orders/:number/invoice', async (req, res) => {
  const order = await findOrderWithToken({ query }, req.params.number, req.query.token, { user: req.user });
  if (order.status === 'pending_payment' || (order.status === 'cancelled' && order.payment_status !== 'refunded' && order.payment_status !== 'paid')) {
    throw new HttpError(400, 'An invoice is available once the order is confirmed.');
  }
  const [{ rows: items }, store] = await Promise.all([query(ITEMS_SQL, [order.id]), getSetting('store')]);
  const inclusive = store.tax_inclusive !== false;
  const ratio = order.subtotal ? (order.subtotal - (order.discount_amount || 0)) / order.subtotal : 1;
  const sellerState = store.gstin ? store.gstin.slice(0, 2) : stateCode('Gujarat');
  const intraState = stateCode(order.state) === sellerState;
  const round2 = (n) => Math.round(n * 100) / 100;
  const lines = items.map((i) => {
    const rate = Number(i.tax_rate) || 0;
    const gross = i.line_total * ratio; // after the order discount
    const taxable = inclusive ? gross / (1 + rate / 100) : gross;
    const taxAmt = inclusive ? gross - taxable : (gross * rate) / 100;
    return {
      name: i.name, option: i.option, hsn: i.hsn, qty: i.qty, unitPrice: i.unit_price, lineTotal: i.line_total,
      taxRate: rate, taxable: round2(taxable), tax: round2(taxAmt),
      cgst: intraState ? round2(taxAmt / 2) : 0, sgst: intraState ? round2(taxAmt / 2) : 0, igst: intraState ? 0 : round2(taxAmt),
    };
  });
  res.json({
    number: order.number,
    date: order.created_at,
    status: order.status,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    buyer: { name: order.name, email: order.email, phone: order.phone, address: order.address_line, city: order.city, state: order.state, pin: order.pin },
    seller: {
      name: store.legal_name || store.name, brand: store.name, address: store.address, gstin: store.gstin, fssai: store.fssai,
      email: store.contact_email, phone: store.phone,
    },
    intraState,
    taxInclusive: inclusive,
    lines,
    subtotal: order.subtotal,
    discount: order.discount_amount || 0,
    discountCode: order.discount_code,
    delivery: order.delivery,
    tax: order.tax_amount || 0,
    total: order.total,
  });
});

// Customer cancels their own order (before it ships). Paid online orders are refunded automatically.
orders.post('/account/orders/:number/cancel', requireAuth, async (req, res) => {
  const reason = String(req.body?.reason ?? '').trim().slice(0, 300) || 'Cancelled by customer';
  const { rows } = await query(`SELECT * FROM orders WHERE number = $1 AND user_id = $2`, [req.params.number, req.user.id]);
  const current = rows[0];
  if (!current) throw new HttpError(404, 'Order not found.');
  if (!canCustomerCancel(current)) {
    throw new HttpError(400, current.status === 'cancelled' ? 'This order is already cancelled.' : 'This order has already been shipped, so it can no longer be cancelled. Please contact us for a return.');
  }
  // Shipment already booked with the courier: cancel it there first
  if (current.shiprocket_order_id && (await shiprocketConnected())) {
    try {
      await cancelShiprocketOrder(current.shiprocket_order_id);
    } catch (err) {
      await notify({ type: 'shipment_error', title: `Customer could not cancel ${current.number}`, body: `Shiprocket cancel failed: ${err.message}`, link: `/admin/orders/${current.number}`, severity: 'warning' });
      throw new HttpError(409, 'Your order is already being packed and could not be cancelled online. Please contact us and we will help.');
    }
  }
  const order = await tx(async (db) => {
    const { rows: r } = await db.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [current.id]);
    const o = r[0];
    if (!canCustomerCancel(o)) throw new HttpError(400, 'This order can no longer be cancelled.');
    if (!o.stock_released) await restockOrder(db, o.id, { source: 'cancel', reason: `Cancelled by customer ${o.number}` });
    await releaseDiscount(db, o.id);
    await db.query(
      `UPDATE orders SET status = 'cancelled', cancel_reason = $2, cancelled_at = now(),
              shipment_status = CASE WHEN shiprocket_order_id IS NOT NULL THEN 'cancelled' ELSE shipment_status END,
              payment_status = CASE WHEN payment_status IN ('pending','cod') THEN 'failed' ELSE payment_status END,
              updated_at = now()
       WHERE id = $1`,
      [o.id, reason]
    );
    await addHistory(db, o.id, 'cancelled', { note: reason, source: 'customer' });
    await notify({ type: 'order_cancelled', title: `Cancelled by customer: ${o.number}`, body: reason, link: `/admin/orders/${o.number}`, severity: 'warning', email: true }, db);
    return o;
  });

  let refund = null;
  if (order.payment_method === 'online' && order.payment_status === 'paid') {
    try {
      refund = await refundOrder(order.number, { reason: 'Cancelled by customer', source: 'customer' });
    } catch (err) {
      await notify({ type: 'payment_attention', title: `Refund needed: ${order.number}`, body: `Customer cancelled a paid order; automatic refund failed: ${err.message}`, link: `/admin/orders/${order.number}`, severity: 'critical', email: true });
      refund = { pending: true };
    }
  }
  sendOrderEmail(order.id, 'cancelled', { reason });
  res.json({ ok: true, refund });
});

// "Your Orders"
orders.get('/account/orders', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT o.*, COALESCE((
        SELECT json_agg(json_build_object('product_id', i.product_id, 'slug', p.slug, 'name', i.name, 'option', i.option,
                                          'unit_price', i.unit_price, 'qty', i.qty, 'line_total', i.line_total) ORDER BY i.id)
        FROM order_items i LEFT JOIN products p ON p.id = i.product_id WHERE i.order_id = o.id), '[]'::json) AS items
     FROM orders o
     WHERE o.user_id = $1 AND NOT (o.status = 'cancelled' AND o.payment_status = 'failed' AND o.payment_method = 'online')
     ORDER BY o.created_at DESC
     LIMIT 100`,
    [req.user.id]
  );
  res.json(rows.map((o) => publicOrder(o, o.items)));
});

// Prefill checkout: the default saved address, else the address from the last order
orders.get('/account/last-address', requireAuth, async (req, res) => {
  const saved = await query(
    `SELECT name, phone, address_line, city, state, pin FROM customer_addresses WHERE user_id = $1 ORDER BY is_default DESC, updated_at DESC LIMIT 1`,
    [req.user.id]
  );
  if (saved.rows[0]) return res.json({ address: { ...saved.rows[0], email: req.user.email } });
  const { rows } = await query(
    `SELECT name, phone, email, address_line, city, state, pin FROM orders
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [req.user.id]
  );
  res.json({ address: rows[0] || null });
});

// Give back stock held by online orders that were never paid
export async function releaseExpiredOrders() {
  const { rows } = await query(
    `SELECT id FROM orders
     WHERE status = 'pending_payment' AND payment_status = 'pending' AND NOT stock_released
       AND created_at < now() - ($1 || ' minutes')::interval`,
    [String(PENDING_PAYMENT_TTL_MIN)]
  );
  for (const { id } of rows) {
    await tx(async (db) => {
      const { rows: r } = await db.query(`SELECT stock_released, payment_status FROM orders WHERE id = $1 FOR UPDATE`, [id]);
      if (r[0] && !r[0].stock_released && r[0].payment_status === 'pending') {
        await restockOrder(db, id, { source: 'release', reason: 'Unpaid order expired' });
        await releaseDiscount(db, id);
        await db.query(`UPDATE orders SET status = 'cancelled', payment_status = 'failed', cancelled_at = now(), updated_at = now() WHERE id = $1`, [id]);
        await addHistory(db, id, 'cancelled', { note: `Not paid within ${PENDING_PAYMENT_TTL_MIN} minutes` });
      }
    });
  }
  return rows.length;
}

export function errorHandler(err, _req, res, _next) {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  if (res.headersSent) return;
  res.status(status).json({
    error: status >= 500 && !err.status ? 'Something went wrong. Please try again.' : err.message,
    ...(err.fields ? { fields: err.fields } : {}),
    ...(err.quote ? { quote: err.quote } : {}),
    ...(err.retryAfter ? { retryAfter: err.retryAfter } : {}),
    // our own error codes only (never database error codes)
    ...(err.status && typeof err.code === 'string' && /^[a-z_]+$/.test(err.code) ? { code: err.code } : {}),
  });
}
