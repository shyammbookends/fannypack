import { notify } from './notify.js';
import { getSetting } from './settings.js';
import { sendBackInStockEmails } from './customerMail.js';

// Every stock change goes through here so it is locked, checked and logged.
// db must be a transaction client.
export async function changeStock(db, { variantId, delta = null, set = null, reason = null, source, orderId = null, admin = null }) {
  const { rows } = await db.query(
    `SELECT v.id, v.product_id, v.option, v.stock, v.low_stock_threshold, v.track_inventory,
            COALESCE(p.display_name, p.name) AS name
     FROM product_variants v JOIN products p ON p.id = v.product_id
     WHERE v.id = $1 FOR UPDATE OF v`,
    [variantId]
  );
  const v = rows[0];
  if (!v) throw Object.assign(new Error('Variant not found.'), { status: 404 });
  const next = set != null ? set : v.stock + delta;
  if (!Number.isInteger(next) || next < 0) {
    throw Object.assign(new Error(`${v.name}${v.option ? ` (${v.option})` : ''}: not enough stock.`), { status: 409 });
  }
  if (next === v.stock) return v;
  await db.query(`UPDATE product_variants SET stock = $1, updated_at = now() WHERE id = $2`, [next, variantId]);
  // Back in stock: email the "notify me" list once this transaction has committed
  if (v.stock <= 0 && next > 0) db.afterCommit?.(() => sendBackInStockEmails(variantId));
  await db.query(
    `INSERT INTO inventory_transactions (variant_id, product_id, option, previous, new, change, reason, source, order_id, admin_id, admin_email)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [variantId, v.product_id, v.option, v.stock, next, next - v.stock, reason, source, orderId, admin?.id ?? null, admin?.email ?? null]
  );
  // Low-stock alert when crossing the threshold on the way down
  if (v.track_inventory && next < v.stock && next <= v.low_stock_threshold && v.stock > v.low_stock_threshold) {
    const n = await getSetting('notifications').catch(() => ({}));
    if (n?.low_stock_alerts !== false) {
      await notify(
        {
          type: next === 0 ? 'out_of_stock' : 'low_stock',
          title: next === 0 ? `Out of stock: ${v.name}${v.option ? ` (${v.option})` : ''}` : `Low stock: ${v.name}${v.option ? ` (${v.option})` : ''}`,
          body: `${next} left`,
          link: '/admin/inventory',
          severity: next === 0 ? 'critical' : 'warning',
        },
        db
      );
    }
  }
  return { ...v, stock: next };
}

// Put back the stock of every item of an order (cancel / unpaid / refund)
export async function restockOrder(db, orderId, { source, reason, admin = null }) {
  // Lines saved with their variant id restock that exact variant, even if it was renamed since.
  // Older lines fall back to matching product + option name.
  const { rows } = await db.query(
    `SELECT COALESCE(oi.variant_id, v.id) AS variant_id, oi.qty, oi.name, oi.option FROM order_items oi
     LEFT JOIN product_variants v ON oi.variant_id IS NULL AND v.product_id = oi.product_id AND v.option IS NOT DISTINCT FROM oi.option
     WHERE oi.order_id = $1`,
    [orderId]
  );
  const { rows: existing } = await db.query(`SELECT id FROM product_variants WHERE id = ANY($1::int[])`, [rows.map((r) => r.variant_id).filter(Boolean)]);
  const alive = new Set(existing.map((r) => r.id));
  const missing = rows.filter((r) => !alive.has(r.variant_id));
  if (missing.length) {
    // The variant was deleted since the order: tell the admin instead of silently skipping it
    await notify({
      type: 'low_stock',
      title: 'Stock not returned for a deleted product option',
      body: missing.map((r) => `${r.name}${r.option ? ` (${r.option})` : ''} × ${r.qty}`).join(', '),
      link: '/admin/inventory',
      severity: 'warning',
    }, db);
  }
  for (const r of rows) {
    if (alive.has(r.variant_id)) await changeStock(db, { variantId: r.variant_id, delta: r.qty, source, reason, orderId, admin });
  }
  await db.query(`UPDATE orders SET stock_released = true, updated_at = now() WHERE id = $1`, [orderId]);
}
