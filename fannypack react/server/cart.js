import { Router } from 'express';
import { query, tx } from './db.js';
import { HttpError, requireAuth } from './auth.js';

// Signed-in carts live in "cart_items" (user_id, product_id, option, qty).
// The website works with variant ids, so we translate both ways here.

async function readCart(db, userId) {
  const { rows } = await db.query(
    `SELECT v.id AS "variantId", ci.qty
     FROM cart_items ci
     JOIN product_variants v ON v.product_id = ci.product_id AND v.option = ci.option
     WHERE ci.user_id = $1
     ORDER BY ci.updated_at, v.id`,
    [userId]
  );
  return rows;
}

async function variantKey(db, variantId) {
  const { rows } = await db.query(`SELECT product_id, option FROM product_variants WHERE id = $1`, [variantId]);
  if (!rows[0]) throw new HttpError(400, 'This product is no longer available.');
  return rows[0];
}

const toInt = (v) => Number.parseInt(v, 10);

export const cart = Router();
cart.use('/cart', requireAuth);

cart.get('/cart', async (req, res) => {
  res.json({ items: await readCart({ query }, req.user.id) });
});

// Set the quantity of one item (qty 0 removes it)
cart.put('/cart/items', async (req, res) => {
  const variantId = toInt(req.body?.variantId);
  const qty = Math.min(99, Math.max(0, toInt(req.body?.qty) || 0));
  if (!variantId) throw new HttpError(400, 'Invalid product.');
  const { product_id, option } = await variantKey({ query }, variantId);
  if (qty === 0) {
    await query(`DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2 AND option = $3`, [req.user.id, product_id, option]);
  } else {
    await query(
      `INSERT INTO cart_items (user_id, product_id, option, qty) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, product_id, option) DO UPDATE SET qty = EXCLUDED.qty, updated_at = now()`,
      [req.user.id, product_id, option, qty]
    );
  }
  res.json({ items: await readCart({ query }, req.user.id) });
});

// After signing in: add the items from the browser (guest) cart to the saved cart
cart.post('/cart/merge', async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
  const merged = await tx(async (db) => {
    for (const it of items) {
      const variantId = toInt(it?.variantId);
      const qty = Math.min(99, Math.max(1, toInt(it?.qty) || 1));
      if (!variantId) continue;
      const { rows } = await db.query(`SELECT product_id, option FROM product_variants WHERE id = $1`, [variantId]);
      if (!rows[0]) continue;
      await db.query(
        `INSERT INTO cart_items (user_id, product_id, option, qty) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, product_id, option)
         DO UPDATE SET qty = LEAST(99, cart_items.qty + EXCLUDED.qty), updated_at = now()`,
        [req.user.id, rows[0].product_id, rows[0].option, qty]
      );
    }
    return readCart(db, req.user.id);
  });
  res.json({ items: merged });
});

cart.delete('/cart', async (req, res) => {
  await query(`DELETE FROM cart_items WHERE user_id = $1`, [req.user.id]);
  res.json({ items: [] });
});
