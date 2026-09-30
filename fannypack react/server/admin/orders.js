import { Router } from 'express';
import { query, tx } from '../db.js';
import { requirePerm } from './auth.js';
import { audit } from '../lib/audit.js';
import { restockOrder } from '../lib/inventory.js';
import { addHistory, trackingSteps } from '../lib/orderHistory.js';
import { refundOrder } from '../lib/payments.js';
import { createShipment, syncShipment } from '../lib/fulfilment.js';
import { notify } from '../lib/notify.js';
import { releaseDiscount } from '../lib/discounts.js';
import { sendOrderEmail } from '../lib/customerMail.js';
import { cancelShiprocketOrder, shiprocketConnected, trackingUrl } from '../integrations/shiprocket.js';
import { dateRange, HttpError, paging, str } from './util.js';

export const adminOrders = Router();

// Filter tabs -> SQL
const FILTERS = {
  all: `o.status <> 'pending_payment'`,
  pending: `o.status IN ('placed','confirmed')`,
  awaiting_payment: `o.status = 'pending_payment'`,
  paid: `o.payment_status = 'paid'`,
  processing: `o.status = 'processing'`,
  shipped: `o.status = 'shipped' AND COALESCE(o.shipment_status,'') <> 'out_for_delivery'`,
  out_for_delivery: `o.shipment_status = 'out_for_delivery'`,
  delivered: `o.status = 'delivered'`,
  cancelled: `o.status = 'cancelled'`,
  refunded: `o.payment_status = 'refunded' OR EXISTS (SELECT 1 FROM refunds r WHERE r.order_id = o.id AND r.status <> 'failed')`,
  failed: `o.payment_status = 'failed'`,
};

adminOrders.get('/orders', requirePerm('orders'), async (req, res) => {
  const { page, pageSize, offset } = paging(req);
  const where = [FILTERS[req.query.filter] || FILTERS.all];
  const params = [];
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    const n = params.length;
    where.push(`(o.number ILIKE $${n} OR o.name ILIKE $${n} OR o.email ILIKE $${n} OR o.phone ILIKE $${n} OR o.awb_code ILIKE $${n})`);
  }
  if (req.query.range) {
    const r = dateRange(req);
    params.push(r.from, r.to);
    where.push(`o.created_at >= $${params.length - 1} AND o.created_at < $${params.length}`);
  }
  if (req.query.customer) {
    params.push(Number(req.query.customer));
    where.push(`o.user_id = $${params.length}`);
  }
  const W = `WHERE ${where.map((w) => `(${w})`).join(' AND ')}`;
  const [list, count, counts] = await Promise.all([
    query(
      `SELECT o.id, o.number, o.name, o.email, o.phone, o.total, o.status, o.payment_status, o.payment_method,
              o.fulfilment_status, o.shipment_status, o.courier_name, o.awb_code, o.created_at,
              (SELECT sum(qty)::int FROM order_items i WHERE i.order_id = o.id) AS items
       FROM orders o ${W} ORDER BY o.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
      params
    ),
    query(`SELECT count(*)::int AS n FROM orders o ${W}`, params),
    query(`SELECT ${Object.entries(FILTERS).map(([k, sql]) => `count(*) FILTER (WHERE ${sql})::int AS ${k}`).join(', ')} FROM orders o`),
  ]);
  res.json({ items: list.rows, total: count.rows[0].n, page, pageSize, counts: counts.rows[0] });
});

async function orderByNumber(number) {
  const { rows } = await query(`SELECT * FROM orders WHERE number = $1`, [number]);
  if (!rows[0]) throw new HttpError(404, 'Order not found.');
  return rows[0];
}

adminOrders.get('/orders/:number', requirePerm('orders'), async (req, res) => {
  const o = await orderByNumber(req.params.number);
  const [items, history, payments, refunds, events, customer, webhooks] = await Promise.all([
    query(
      `SELECT i.*, v.id AS variant_id, v.sku, p.site_images->>0 AS image, p.slug
       FROM order_items i
       LEFT JOIN product_variants v ON v.id = COALESCE(i.variant_id,
         (SELECT x.id FROM product_variants x WHERE x.product_id = i.product_id AND x.option IS NOT DISTINCT FROM i.option LIMIT 1))
       LEFT JOIN products p ON p.id = i.product_id
       WHERE i.order_id = $1 ORDER BY i.id`,
      [o.id]
    ),
    query(`SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at, id`, [o.id]),
    query(`SELECT id, provider, provider_payment_id, provider_order_id, amount, status, method, error, created_at FROM payments WHERE order_id = $1 ORDER BY created_at`, [o.id]),
    query(`SELECT id, provider, provider_refund_id, amount, status, reason, admin_email, created_at FROM refunds WHERE order_id = $1 ORDER BY created_at`, [o.id]),
    query(`SELECT * FROM shipment_events WHERE order_id = $1 ORDER BY COALESCE(event_time, created_at) DESC LIMIT 100`, [o.id]),
    o.user_id
      ? query(
          `SELECT u.id, u.name, u.email, u.phone, u.created_at,
                  (SELECT count(*)::int FROM orders x WHERE x.user_id = u.id AND x.status <> 'pending_payment') AS orders,
                  (SELECT COALESCE(sum(total),0)::int FROM orders x WHERE x.user_id = u.id AND x.payment_status IN ('paid','cod') AND x.status <> 'cancelled') AS spent
           FROM users u WHERE u.id = $1`,
          [o.user_id]
        )
      : { rows: [] },
    o.razorpay_order_id
      ? query(`SELECT id, event_type, processing_status, received_at FROM webhook_events WHERE provider = 'razorpay' AND payload::text LIKE $1 ORDER BY received_at DESC LIMIT 10`, [`%${o.razorpay_order_id}%`])
      : { rows: [] },
  ]);
  const { payment_token_hash, ...order } = o;
  res.json({
    order,
    items: items.rows,
    history: history.rows,
    payments: payments.rows,
    refunds: refunds.rows,
    shipmentEvents: events.rows,
    customer: customer.rows[0] || null,
    webhooks: webhooks.rows,
    tracking: trackingSteps(o),
  });
});

// Manual status changes (when not using Shiprocket, or to correct something)
const NEXT = {
  placed: ['confirmed', 'processing', 'shipped'],
  confirmed: ['processing', 'shipped'],
  processing: ['shipped', 'delivered'],
  shipped: ['delivered'],
};
adminOrders.post('/orders/:number/status', requirePerm('orders'), async (req, res) => {
  const status = String(req.body?.status || '');
  const note = str(req.body?.note, 300);
  const o = await tx(async (db) => {
    const { rows } = await db.query(`SELECT * FROM orders WHERE number = $1 FOR UPDATE`, [req.params.number]);
    const o = rows[0];
    if (!o) throw new HttpError(404, 'Order not found.');
    if (!(NEXT[o.status] || []).includes(status)) throw new HttpError(400, `Cannot change an order from "${o.status}" to "${status}".`);
    const ship = status === 'shipped' ? 'shipped' : status === 'delivered' ? 'delivered' : o.shipment_status;
    await db.query(
      `UPDATE orders SET status = $1, shipment_status = $2,
              fulfilment_status = CASE WHEN $1 = 'delivered' THEN 'fulfilled' ELSE fulfilment_status END, updated_at = now()
       WHERE id = $3`,
      [status, ship, o.id]
    );
    await addHistory(db, o.id, status, { note, source: 'admin', adminEmail: req.admin.email });
    if (status === 'delivered') await notify({ type: 'delivered', title: `Delivered: ${o.number}`, link: `/admin/orders/${o.number}`, severity: 'good' }, db);
    if (status === 'shipped' || status === 'delivered') db.afterCommit(() => sendOrderEmail(o.id, status));
    return o;
  });
  await audit(req, 'order.status', 'order', o.number, { status: o.status }, { status, note });
  res.json({ ok: true });
});

// Cancel (optionally put stock back). Paid online orders should be refunded too.
adminOrders.post('/orders/:number/cancel', requirePerm('orders'), async (req, res) => {
  const reason = str(req.body?.reason, 300) || 'Cancelled by store';
  const restock = req.body?.restock !== false;
  const o = await tx(async (db) => {
    const { rows } = await db.query(`SELECT * FROM orders WHERE number = $1 FOR UPDATE`, [req.params.number]);
    const o = rows[0];
    if (!o) throw new HttpError(404, 'Order not found.');
    if (o.status === 'cancelled') throw new HttpError(400, 'Order is already cancelled.');
    if (['shipped', 'delivered'].includes(o.status)) throw new HttpError(400, 'Shipped orders cannot be cancelled here. Handle it as a return / refund.');
    if (restock && !o.stock_released) await restockOrder(db, o.id, { source: 'cancel', reason: `Cancelled ${o.number}`, admin: req.admin });
    await releaseDiscount(db, o.id);
    await db.query(
      `UPDATE orders SET status = 'cancelled', cancel_reason = $2, cancelled_at = now(),
              payment_status = CASE WHEN payment_status IN ('pending','cod') THEN 'failed' ELSE payment_status END, updated_at = now()
       WHERE id = $1`,
      [o.id, reason]
    );
    await addHistory(db, o.id, 'cancelled', { note: reason, source: 'admin', adminEmail: req.admin.email });
    await notify({ type: 'order_cancelled', title: `Order cancelled: ${o.number}`, body: reason, link: `/admin/orders/${o.number}`, severity: 'warning' }, db);
    // Unpaid online orders never reached the customer as "placed", so they get no email
    if (o.status !== 'pending_payment' && req.body?.notifyCustomer !== false) db.afterCommit(() => sendOrderEmail(o.id, 'cancelled', { reason }));
    return o;
  });
  // Also cancel it in Shiprocket if a shipment was already created there
  let shiprocketCancel = null;
  if (o.shiprocket_order_id && (await shiprocketConnected())) {
    try {
      await cancelShiprocketOrder(o.shiprocket_order_id);
      shiprocketCancel = 'cancelled';
      await query(`UPDATE orders SET shipment_status = 'cancelled', updated_at = now() WHERE id = $1`, [o.id]);
    } catch (err) {
      shiprocketCancel = `failed: ${err.message}`;
      await query(`UPDATE orders SET fulfilment_error = $1 WHERE id = $2`, [`Shiprocket cancel: ${err.message}`, o.id]);
    }
  }
  await audit(req, 'order.cancel', 'order', o.number, { status: o.status }, { status: 'cancelled', reason, restock, shiprocketCancel });
  res.json({ ok: true, refundNeeded: o.payment_status === 'paid', shiprocketCancel });
});

adminOrders.post('/orders/:number/refund', requirePerm('payments'), async (req, res) => {
  const r = await refundOrder(req.params.number, {
    amount: req.body?.amount ? Number(req.body.amount) : null,
    reason: str(req.body?.reason, 300),
    restock: req.body?.restock === true,
    admin: req.admin,
  });
  await audit(req, 'order.refund', 'order', req.params.number, null, r);
  res.json(r);
});

// COD cash collected
adminOrders.post('/orders/:number/mark-paid', requirePerm('payments'), async (req, res) => {
  const o = await orderByNumber(req.params.number);
  if (o.payment_method !== 'cod' || o.payment_status !== 'cod') throw new HttpError(400, 'Only Cash on Delivery orders can be marked as paid here.');
  await tx(async (db) => {
    await db.query(`UPDATE orders SET payment_status = 'paid', updated_at = now() WHERE id = $1`, [o.id]);
    await db.query(
      `INSERT INTO payments (order_id, provider, provider_payment_id, amount, status, method) VALUES ($1,'cod',$2,$3,'captured','cash')
       ON CONFLICT DO NOTHING`,
      [o.id, `cod-${o.number}`, o.total]
    );
    await addHistory(db, o.id, 'cod_collected', { note: str(req.body?.note, 200) || 'Cash collected', source: 'admin', adminEmail: req.admin.email });
  });
  await audit(req, 'order.cod_collected', 'order', o.number, { payment_status: 'cod' }, { payment_status: 'paid' });
  res.json({ ok: true });
});

adminOrders.post('/orders/:number/note', requirePerm('orders'), async (req, res) => {
  const o = await orderByNumber(req.params.number);
  const note = str(req.body?.note, 1000) || null;
  await query(`UPDATE orders SET admin_note = $1, updated_at = now() WHERE id = $2`, [note, o.id]);
  await audit(req, 'order.note', 'order', o.number, { note: o.admin_note }, { note });
  res.json({ ok: true });
});

// ---------- shipping ----------
adminOrders.post('/orders/:number/shipment', requirePerm('shipping'), async (req, res) => {
  const o = await orderByNumber(req.params.number);
  const updated = await createShipment(o.id, { admin: req.admin });
  await audit(req, 'shipment.create', 'order', o.number, null, { shiprocket_order_id: updated.shiprocket_order_id, awb: updated.awb_code });
  res.json({ ok: true, order: updated });
});

adminOrders.post('/orders/:number/shipment/sync', requirePerm('shipping'), async (req, res) => {
  const o = await orderByNumber(req.params.number);
  const updated = await syncShipment(o.id);
  res.json({ ok: true, shipmentStatus: updated.shipment_status });
});

// Record a shipment handled outside Shiprocket (own courier / hand delivery)
adminOrders.post('/orders/:number/shipment/manual', requirePerm('shipping'), async (req, res) => {
  const courier = str(req.body?.courier, 80);
  const awb = str(req.body?.awb, 60);
  const url = str(req.body?.tracking_url, 500);
  if (!courier) throw new HttpError(400, 'Enter the courier name.', { courier: 'Required.' });
  if (url && !/^https?:\/\//.test(url)) throw new HttpError(400, 'Tracking link must start with http(s)://', { tracking_url: 'Invalid link.' });
  const o = await tx(async (db) => {
    const { rows } = await db.query(`SELECT * FROM orders WHERE number = $1 FOR UPDATE`, [req.params.number]);
    const o = rows[0];
    if (!o) throw new HttpError(404, 'Order not found.');
    if (o.status === 'cancelled') throw new HttpError(400, 'Order is cancelled.');
    await db.query(
      `UPDATE orders SET courier_name = $1, awb_code = COALESCE($2, awb_code), tracking_url = COALESCE($3, tracking_url),
              status = CASE WHEN status IN ('placed','confirmed','processing') THEN 'shipped' ELSE status END,
              shipment_status = 'shipped', fulfilment_status = 'manual', updated_at = now()
       WHERE id = $4`,
      [courier, awb, url || (awb && /shiprocket/i.test(courier) ? trackingUrl(awb) : null), o.id]
    );
    await addHistory(db, o.id, 'shipped', { note: `${courier}${awb ? ` · AWB ${awb}` : ''}`, source: 'admin', adminEmail: req.admin.email });
    if (!['shipped', 'delivered'].includes(o.status)) db.afterCommit(() => sendOrderEmail(o.id, 'shipped'));
    return o;
  });
  await audit(req, 'shipment.manual', 'order', o.number, null, { courier, awb });
  res.json({ ok: true });
});

// Delivery dashboard
adminOrders.get('/shipping/overview', requirePerm('shipping'), async (req, res) => {
  const { page, pageSize, offset } = paging(req);
  const tab = String(req.query.tab || 'active');
  const tabs = {
    active: `COALESCE(o.shipment_status,'') NOT IN ('delivered','rto_delivered','cancelled','lost') AND o.status NOT IN ('cancelled','delivered','pending_payment') AND (o.shiprocket_order_id IS NOT NULL OR o.awb_code IS NOT NULL OR o.status IN ('placed','confirmed','processing','shipped'))`,
    delayed: `o.shipment_status IN ('delayed','lost') OR (o.expected_delivery < current_date AND o.status = 'shipped')`,
    delivered: `o.status = 'delivered'`,
    rto: `o.shipment_status IN ('rto','rto_delivered')`,
    errors: `o.fulfilment_status = 'error' OR o.fulfilment_error IS NOT NULL`,
  };
  const W = `WHERE ${tabs[tab] || tabs.active}`;
  const [cards, list, count] = await Promise.all([
    query(
      `SELECT count(*) FILTER (WHERE o.shiprocket_order_id IS NOT NULL OR o.awb_code IS NOT NULL)::int AS total,
              count(*) FILTER (WHERE o.status IN ('placed','confirmed','processing') AND o.awb_code IS NULL)::int AS processing,
              count(*) FILTER (WHERE o.status = 'shipped' AND COALESCE(o.shipment_status,'') NOT IN ('out_for_delivery','rto','delayed'))::int AS shipped,
              count(*) FILTER (WHERE o.shipment_status = 'out_for_delivery')::int AS out_for_delivery,
              count(*) FILTER (WHERE o.status = 'delivered')::int AS delivered,
              count(*) FILTER (WHERE o.shipment_status IN ('delayed','lost') OR (o.expected_delivery < current_date AND o.status = 'shipped'))::int AS delayed,
              count(*) FILTER (WHERE o.status = 'cancelled' AND (o.shiprocket_order_id IS NOT NULL OR o.awb_code IS NOT NULL))::int AS cancelled,
              count(*) FILTER (WHERE o.shipment_status IN ('rto','rto_delivered'))::int AS rto
       FROM orders o WHERE o.status <> 'pending_payment'`
    ),
    query(
      `SELECT o.number, o.name, o.city, o.courier_name, o.awb_code, o.tracking_url, o.status, o.shipment_status, o.pickup_status,
              o.expected_delivery, o.fulfilment_status, o.fulfilment_error, o.shipping_synced_at, o.created_at, o.payment_method
       FROM orders o ${W} ORDER BY o.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`
    ),
    query(`SELECT count(*)::int AS n FROM orders o ${W}`),
  ]);
  res.json({ cards: cards.rows[0], items: list.rows, total: count.rows[0].n, page, pageSize });
});
