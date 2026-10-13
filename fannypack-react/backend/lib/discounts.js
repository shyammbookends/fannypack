// Cancelled / expired order: its coupon use no longer counts towards the usage limit. Idempotent.
export async function releaseDiscount(db, orderId) {
  const { rows } = await db.query(
    `UPDATE discount_usages SET released_at = now() WHERE order_id = $1 AND released_at IS NULL RETURNING discount_id`,
    [orderId]
  );
  for (const r of rows) {
    await db.query(`UPDATE discounts SET used_count = GREATEST(used_count - 1, 0), updated_at = now() WHERE id = $1`, [r.discount_id]);
  }
}

// Coupon codes. lines: [{ productId, categoryId, lineTotal }]
export async function evaluateDiscount(db, code, { lines, subtotal, userId, lock = false }) {
  const clean = String(code || '').trim();
  if (!clean) return null;
  const { rows } = await db.query(
    `SELECT * FROM discounts WHERE upper(code) = upper($1) ${lock ? 'FOR UPDATE' : ''}`,
    [clean]
  );
  const d = rows[0];
  const fail = (error) => ({ code: clean, amount: 0, error });
  if (!d || !d.active) return fail('This coupon code is not valid.');
  const now = new Date();
  if (d.starts_at && new Date(d.starts_at) > now) return fail('This coupon is not active yet.');
  if (d.ends_at && new Date(d.ends_at) < now) return fail('This coupon has expired.');
  if (d.usage_limit != null && d.used_count >= d.usage_limit) return fail('This coupon has reached its usage limit.');
  if (subtotal < d.min_order) return fail(`Add items worth ₹${d.min_order - subtotal} more to use this coupon (minimum ₹${d.min_order}).`);
  if (d.per_customer_limit != null && userId) {
    const { rows: u } = await db.query(
      `SELECT count(*)::int AS n FROM discount_usages du JOIN orders o ON o.id = du.order_id
       WHERE du.discount_id = $1 AND du.user_id = $2 AND o.status <> 'cancelled' AND du.released_at IS NULL`,
      [d.id, userId]
    );
    if (u[0].n >= d.per_customer_limit) return fail('You have already used this coupon.');
  }

  const ids = (arr) => new Set((arr || []).map(String));
  const eligible = lines.filter((l) => {
    if (d.scope === 'products') return ids(d.product_ids).has(String(l.productId));
    if (d.scope === 'collections') return ids(d.collection_ids).has(String(l.categoryId));
    return true;
  });
  const base = eligible.reduce((s, l) => s + l.lineTotal, 0);
  if (!base) return fail('This coupon does not apply to the items in your cart.');

  let amount = d.type === 'percent' ? Math.floor((base * d.value) / 100) : Math.min(d.value, base);
  if (d.max_discount != null) amount = Math.min(amount, d.max_discount);
  return { id: d.id, code: d.code, amount, description: d.description || null, error: null };
}
