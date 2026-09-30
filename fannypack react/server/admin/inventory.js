import { Router } from 'express';
import { query, tx } from '../db.js';
import { requirePerm } from './auth.js';
import { audit } from '../lib/audit.js';
import { changeStock } from '../lib/inventory.js';
import { HttpError, int, paging, str } from './util.js';

export const inventory = Router();

// "stock" in product_variants is what can still be sold (available).
// Reserved = units held by online orders that are waiting for payment.
const RESERVED_SQL = `
  COALESCE((SELECT sum(oi.qty)::int FROM order_items oi JOIN orders o ON o.id = oi.order_id
            WHERE (oi.variant_id = v.id OR (oi.variant_id IS NULL AND oi.product_id = v.product_id AND oi.option = v.option))
              AND o.status = 'pending_payment' AND NOT o.stock_released), 0)`;

inventory.get('/inventory', requirePerm('inventory'), async (req, res) => {
  const { page, pageSize, offset } = paging(req, { def: 50, max: 200 });
  const where = [`p.status <> 'archived'`];
  const params = [];
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    where.push(`(COALESCE(p.display_name,p.name) ILIKE $${params.length} OR v.sku ILIKE $${params.length} OR v.option ILIKE $${params.length})`);
  }
  if (req.query.filter === 'low') where.push(`v.track_inventory AND v.stock > 0 AND v.stock <= v.low_stock_threshold`);
  if (req.query.filter === 'out') where.push(`v.track_inventory AND v.stock = 0`);
  if (req.query.collection) {
    params.push(req.query.collection);
    where.push(`p.category_id = $${params.length}`);
  }
  const W = `WHERE ${where.join(' AND ')}`;
  const [list, count, sums] = await Promise.all([
    query(
      `SELECT v.id, v.product_id, v.option, v.sku, v.stock AS available, ${RESERVED_SQL} AS reserved,
              v.low_stock_threshold, v.track_inventory, v.price, COALESCE(p.display_name, p.name) AS product,
              p.site_images->>0 AS image, p.status
       FROM product_variants v JOIN products p ON p.id = v.product_id
       ${W} ORDER BY (v.track_inventory AND v.stock <= v.low_stock_threshold) DESC, COALESCE(p.display_name, p.name), v.sort
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    ),
    query(`SELECT count(*)::int AS n FROM product_variants v JOIN products p ON p.id = v.product_id ${W}`, params),
    query(
      `SELECT count(*) FILTER (WHERE v.track_inventory AND v.stock > 0 AND v.stock <= v.low_stock_threshold)::int AS low,
              count(*) FILTER (WHERE v.track_inventory AND v.stock = 0)::int AS out,
              COALESCE(sum(v.stock),0)::int AS units,
              COALESCE(sum(v.stock * COALESCE(v.cost_price, 0)),0)::int AS cost_value,
              COALESCE(sum(v.stock * v.price),0)::int AS retail_value
       FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.status <> 'archived'`
    ),
  ]);
  res.json({
    items: list.rows.map((r) => ({ ...r, on_hand: r.available + r.reserved })),
    total: count.rows[0].n,
    page,
    pageSize,
    summary: sums.rows[0],
  });
});

// One adjustment: mode "add" | "remove" | "set"
inventory.post('/inventory/adjust', requirePerm('inventory'), async (req, res) => {
  const variantId = int(req.body?.variantId);
  const qty = int(req.body?.qty);
  const mode = req.body?.mode;
  const reason = str(req.body?.reason, 200);
  if (!variantId || qty == null || qty < 0) throw new HttpError(400, 'Enter a valid quantity.');
  if (!['add', 'remove', 'set'].includes(mode)) throw new HttpError(400, 'Choose add, remove or set.');
  if (!reason) throw new HttpError(400, 'Please give a reason (e.g. new stock received, damaged, stock count).', { reason: 'Required.' });
  const v = await tx((db) =>
    changeStock(db, {
      variantId,
      delta: mode === 'add' ? qty : mode === 'remove' ? -qty : null,
      set: mode === 'set' ? qty : null,
      source: 'admin',
      reason,
      admin: req.admin,
    })
  );
  await audit(req, 'inventory.adjust', 'variant', variantId, null, { mode, qty, reason, stock: v.stock });
  res.json({ variantId, stock: v.stock });
});

// Bulk: [{ variantId, stock }] -> set each to the given number
inventory.post('/inventory/bulk', requirePerm('inventory'), async (req, res) => {
  const rows = Array.isArray(req.body?.items) ? req.body.items.slice(0, 500) : [];
  const reason = str(req.body?.reason, 200) || 'Bulk stock update';
  if (!rows.length) throw new HttpError(400, 'Nothing to update.');
  const changed = await tx(async (db) => {
    let n = 0;
    for (const r of rows) {
      const variantId = int(r.variantId);
      const stock = int(r.stock);
      if (!variantId || stock == null || stock < 0) throw new HttpError(400, 'Every row needs a stock number of 0 or more.');
      await changeStock(db, { variantId, set: stock, source: 'admin', reason, admin: req.admin });
      n += 1;
    }
    return n;
  });
  await audit(req, 'inventory.bulk', 'variant', null, null, { count: changed, reason });
  res.json({ updated: changed });
});

inventory.put('/inventory/:variantId/settings', requirePerm('inventory'), async (req, res) => {
  const threshold = int(req.body?.low_stock_threshold);
  const r = await query(
    `UPDATE product_variants SET low_stock_threshold = COALESCE($1, low_stock_threshold),
            track_inventory = COALESCE($2, track_inventory), updated_at = now() WHERE id = $3 RETURNING id`,
    [threshold != null && threshold >= 0 ? threshold : null, typeof req.body?.track_inventory === 'boolean' ? req.body.track_inventory : null, int(req.params.variantId)]
  );
  if (!r.rowCount) throw new HttpError(404, 'Variant not found.');
  await audit(req, 'inventory.settings', 'variant', req.params.variantId, null, req.body);
  res.json({ ok: true });
});

inventory.get('/inventory/history', requirePerm('inventory'), async (req, res) => {
  const { page, pageSize, offset } = paging(req, { def: 50 });
  const params = [];
  let W = '';
  if (req.query.variantId) {
    params.push(int(req.query.variantId));
    W = `WHERE t.variant_id = $1`;
  }
  const [list, count] = await Promise.all([
    query(
      `SELECT t.*, COALESCE(p.display_name, p.name, t.product_id) AS product, o.number AS order_number
       FROM inventory_transactions t
       LEFT JOIN products p ON p.id = t.product_id
       LEFT JOIN orders o ON o.id = t.order_id
       ${W} ORDER BY t.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
      params
    ),
    query(`SELECT count(*)::int AS n FROM inventory_transactions t ${W}`, params),
  ]);
  res.json({ items: list.rows, total: count.rows[0].n, page, pageSize });
});
