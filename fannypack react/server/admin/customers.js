import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm } from './auth.js';
import { audit } from '../lib/audit.js';
import { bool, HttpError, int, paging, str } from './util.js';

export const customers = Router();

const SPENT = `COALESCE((SELECT sum(o.total) FROM orders o WHERE o.user_id = u.id AND o.payment_status IN ('paid','cod') AND o.status <> 'cancelled'), 0)::int`;
const ORDERS = `(SELECT count(*) FROM orders o WHERE o.user_id = u.id AND o.status <> 'pending_payment')::int`;

customers.get('/customers', requirePerm('customers'), async (req, res) => {
  const { page, pageSize, offset } = paging(req);
  const where = ['u.admin_role IS NULL'];
  const params = [];
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    where.push(`(u.name ILIKE $1 OR u.email ILIKE $1 OR u.phone ILIKE $1)`);
  }
  if (req.query.status === 'blocked') where.push(`u.status = 'blocked'`);
  const sorts = { spent: 'spent DESC', orders: 'orders DESC', recent: 'u.created_at DESC', last_order: 'last_order DESC NULLS LAST' };
  const W = `WHERE ${where.join(' AND ')}`;
  const [list, count] = await Promise.all([
    query(
      `SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at, ${ORDERS} AS orders, ${SPENT} AS spent,
              (SELECT max(o.created_at) FROM orders o WHERE o.user_id = u.id AND o.status <> 'pending_payment') AS last_order
       FROM users u ${W} ORDER BY ${sorts[req.query.sort] || 'u.created_at DESC'} LIMIT ${pageSize} OFFSET ${offset}`,
      params
    ),
    query(`SELECT count(*)::int AS n FROM users u ${W}`, params),
  ]);
  res.json({ items: list.rows, total: count.rows[0].n, page, pageSize });
});

customers.get('/customers/:id', requirePerm('customers'), async (req, res) => {
  const id = int(req.params.id);
  // never select password_hash / 2FA secrets
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.status, u.admin_note, u.created_at, u.last_login_at, ${ORDERS} AS orders, ${SPENT} AS spent
     FROM users u WHERE u.id = $1 AND u.admin_role IS NULL`,
    [id]
  );
  if (!rows[0]) throw new HttpError(404, 'Customer not found.');
  const [orders, addresses, payments, refunds, shipments, cart, timeline] = await Promise.all([
    query(
      `SELECT number, total, status, payment_status, payment_method, shipment_status, courier_name, awb_code, created_at
       FROM orders WHERE user_id = $1 AND status <> 'pending_payment' ORDER BY created_at DESC LIMIT 100`,
      [id]
    ),
    query(
      `SELECT DISTINCT ON (lower(address_line), pin) name, phone, address_line, city, state, pin, max(created_at) OVER (PARTITION BY lower(address_line), pin) AS last_used
       FROM orders WHERE user_id = $1 ORDER BY lower(address_line), pin, created_at DESC`,
      [id]
    ),
    query(
      `SELECT p.provider, p.provider_payment_id, p.amount, p.status, p.method, p.created_at, o.number
       FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.user_id = $1 ORDER BY p.created_at DESC LIMIT 50`,
      [id]
    ),
    query(
      `SELECT r.amount, r.status, r.reason, r.created_at, o.number FROM refunds r JOIN orders o ON o.id = r.order_id
       WHERE o.user_id = $1 ORDER BY r.created_at DESC`,
      [id]
    ),
    query(
      `SELECT number, courier_name, awb_code, shipment_status, expected_delivery, tracking_url FROM orders
       WHERE user_id = $1 AND (awb_code IS NOT NULL OR shiprocket_order_id IS NOT NULL) ORDER BY created_at DESC`,
      [id]
    ),
    query(
      `SELECT ci.qty, ci.option, COALESCE(p.display_name, p.name) AS name, ci.updated_at
       FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.user_id = $1`,
      [id]
    ),
    query(
      `SELECT h.status, h.note, h.created_at, o.number FROM order_status_history h JOIN orders o ON o.id = h.order_id
       WHERE o.user_id = $1 ORDER BY h.created_at DESC LIMIT 60`,
      [id]
    ),
  ]);
  res.json({
    customer: rows[0],
    orders: orders.rows,
    addresses: addresses.rows,
    payments: payments.rows,
    refunds: refunds.rows,
    shipments: shipments.rows,
    cart: cart.rows,
    timeline: [{ status: 'registered', note: 'Account created', created_at: rows[0].created_at }, ...timeline.rows].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    ),
  });
});

customers.put('/customers/:id', requirePerm('customers'), async (req, res) => {
  const id = int(req.params.id);
  const { rows } = await query(`SELECT status, admin_note FROM users WHERE id = $1 AND admin_role IS NULL`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Customer not found.');
  const status = req.body?.status === 'blocked' ? 'blocked' : req.body?.status === 'active' ? 'active' : rows[0].status;
  const note = req.body?.admin_note !== undefined ? str(req.body.admin_note, 2000) : rows[0].admin_note;
  await query(`UPDATE users SET status = $1, admin_note = $2 WHERE id = $3`, [status, note, id]);
  // Blocking signs the customer out everywhere
  if (status === 'blocked' && rows[0].status !== 'blocked') await query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
  await audit(req, 'customer.update', 'customer', id, rows[0], { status, admin_note: note });
  res.json({ ok: true });
});

// ================= Discounts =================
export const discounts = Router();

function cleanDiscount(b) {
  const fields = {};
  const code = str(b.code, 40)?.toUpperCase().replace(/\s+/g, '');
  if (!code || !/^[A-Z0-9_-]{3,40}$/.test(code)) fields.code = 'Use 3-40 letters, numbers, - or _.';
  const type = b.type === 'fixed' ? 'fixed' : 'percent';
  const value = int(b.value);
  if (!value || value <= 0) fields.value = 'Enter the discount amount.';
  if (type === 'percent' && value > 100) fields.value = 'A percentage cannot be more than 100.';
  const scope = ['all', 'products', 'collections'].includes(b.scope) ? b.scope : 'all';
  const productIds = Array.isArray(b.product_ids) ? b.product_ids.map(String).slice(0, 200) : [];
  const collectionIds = Array.isArray(b.collection_ids) ? b.collection_ids.map(String).slice(0, 50) : [];
  if (scope === 'products' && !productIds.length) fields.product_ids = 'Choose at least one product.';
  if (scope === 'collections' && !collectionIds.length) fields.collection_ids = 'Choose at least one collection.';
  const starts = b.starts_at ? new Date(b.starts_at) : null;
  const ends = b.ends_at ? new Date(b.ends_at) : null;
  if (starts && isNaN(starts)) fields.starts_at = 'Invalid date.';
  if (ends && isNaN(ends)) fields.ends_at = 'Invalid date.';
  if (starts && ends && ends <= starts) fields.ends_at = 'End must be after the start.';
  if (Object.keys(fields).length) throw new HttpError(400, 'Please fix the highlighted fields.', fields);
  const pos = (v) => (int(v) > 0 ? int(v) : null);
  return {
    code, description: str(b.description, 200) || null, type, value, scope,
    product_ids: productIds, collection_ids: collectionIds,
    min_order: Math.max(0, int(b.min_order) || 0), max_discount: pos(b.max_discount),
    starts_at: starts, ends_at: ends, usage_limit: pos(b.usage_limit), per_customer_limit: pos(b.per_customer_limit),
    active: b.active !== false && bool(b.active ?? true),
  };
}

discounts.get('/discounts', requirePerm('discounts'), async (_req, res) => {
  const { rows } = await query(
    `SELECT d.*, COALESCE((SELECT sum(amount) FROM discount_usages u JOIN orders o ON o.id = u.order_id
                           WHERE u.discount_id = d.id AND o.status <> 'cancelled'), 0)::int AS total_discounted
     FROM discounts d ORDER BY d.active DESC, d.created_at DESC`
  );
  res.json(rows);
});

const DISCOUNT_COLS = ['code', 'description', 'type', 'value', 'scope', 'product_ids', 'collection_ids', 'min_order', 'max_discount', 'starts_at', 'ends_at', 'usage_limit', 'per_customer_limit', 'active'];
const discountVals = (d) => DISCOUNT_COLS.map((k) => (['product_ids', 'collection_ids'].includes(k) ? JSON.stringify(d[k]) : d[k]));

discounts.post('/discounts', requirePerm('discounts'), async (req, res) => {
  const d = cleanDiscount(req.body || {});
  try {
    const { rows } = await query(
      `INSERT INTO discounts (${DISCOUNT_COLS.join(',')}) VALUES (${DISCOUNT_COLS.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      discountVals(d)
    );
    await audit(req, 'discount.create', 'discount', rows[0].id, null, d);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'That code already exists.', { code: 'Already exists.' });
    throw err;
  }
});

discounts.put('/discounts/:id', requirePerm('discounts'), async (req, res) => {
  const d = cleanDiscount(req.body || {});
  const { rows: b } = await query(`SELECT * FROM discounts WHERE id = $1`, [int(req.params.id)]);
  if (!b[0]) throw new HttpError(404, 'Discount not found.');
  try {
    const { rows } = await query(
      `UPDATE discounts SET ${DISCOUNT_COLS.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now()
       WHERE id = $${DISCOUNT_COLS.length + 1} RETURNING *`,
      [...discountVals(d), int(req.params.id)]
    );
    await audit(req, 'discount.update', 'discount', req.params.id, { code: b[0].code, value: b[0].value, active: b[0].active }, { code: d.code, value: d.value, active: d.active });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'That code already exists.', { code: 'Already exists.' });
    throw err;
  }
});

discounts.delete('/discounts/:id', requirePerm('discounts'), async (req, res) => {
  const { rows } = await query(`SELECT count(*)::int AS n FROM discount_usages WHERE discount_id = $1`, [int(req.params.id)]);
  if (rows[0].n) {
    await query(`UPDATE discounts SET active = false, updated_at = now() WHERE id = $1`, [int(req.params.id)]);
    await audit(req, 'discount.deactivate', 'discount', req.params.id);
    return res.json({ ok: true, deactivated: true });
  }
  await query(`DELETE FROM discounts WHERE id = $1`, [int(req.params.id)]);
  await audit(req, 'discount.delete', 'discount', req.params.id);
  res.json({ ok: true });
});
