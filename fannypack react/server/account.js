import { Router } from 'express';
import { query, tx } from './db.js';
import { HttpError, rateLimit, requireAuth } from './auth.js';
import { checkPhone } from './lib/contactCheck.js';

// Signed-in extras: address book and wishlist. Public: reviews and back-in-stock alerts.
export const account = Router();

// ---------- address book ----------

export function cleanAddress(a = {}) {
  const s = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
  const out = {
    name: s(a.name),
    phone: String(a.phone ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''),
    address_line: s(a.address_line),
    city: s(a.city),
    state: s(a.state),
    pin: s(a.pin),
  };
  const errors = {};
  if (out.name.length < 2 || out.name.length > 80) errors.name = 'Enter the full name.';
  if (!checkPhone(out.phone).ok) errors.phone = 'Enter a valid 10-digit mobile number.';
  if (out.address_line.length < 5 || out.address_line.length > 250) errors.address_line = 'Enter the full address.';
  if (out.city.length < 2 || out.city.length > 60) errors.city = 'Enter the city.';
  if (out.state.length < 2 || out.state.length > 60) errors.state = 'Choose the state.';
  if (!/^[1-9]\d{5}$/.test(out.pin)) errors.pin = 'Enter a 6-digit PIN code.';
  if (Object.keys(errors).length) throw new HttpError(400, 'Please check the address.', errors);
  return out;
}

const ADDRESS_COLS = 'id, name, phone, address_line, city, state, pin, is_default';

account.get('/account/addresses', requireAuth, async (req, res) => {
  const { rows } = await query(`SELECT ${ADDRESS_COLS} FROM customer_addresses WHERE user_id = $1 ORDER BY is_default DESC, updated_at DESC`, [req.user.id]);
  res.json(rows);
});

// Save a new address (also used by checkout's "save this address")
export async function saveAddress(db, userId, addr, { makeDefault = false } = {}) {
  const { rows: same } = await db.query(
    `SELECT id FROM customer_addresses WHERE user_id = $1 AND lower(address_line) = lower($2) AND pin = $3 AND lower(name) = lower($4)`,
    [userId, addr.address_line, addr.pin, addr.name]
  );
  const { rows: count } = await db.query(`SELECT count(*)::int AS n FROM customer_addresses WHERE user_id = $1`, [userId]);
  const isDefault = makeDefault || count[0].n === 0;
  if (isDefault) await db.query(`UPDATE customer_addresses SET is_default = false WHERE user_id = $1`, [userId]);
  if (same[0]) {
    const { rows } = await db.query(
      `UPDATE customer_addresses SET name = $1, phone = $2, city = $3, state = $4, is_default = is_default OR $5, updated_at = now()
       WHERE id = $6 RETURNING ${ADDRESS_COLS}`,
      [addr.name, addr.phone, addr.city, addr.state, isDefault, same[0].id]
    );
    return rows[0];
  }
  if (count[0].n >= 20) throw new HttpError(400, 'You can save up to 20 addresses. Please delete one first.');
  const { rows } = await db.query(
    `INSERT INTO customer_addresses (user_id, name, phone, address_line, city, state, pin, is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${ADDRESS_COLS}`,
    [userId, addr.name, addr.phone, addr.address_line, addr.city, addr.state, addr.pin, isDefault]
  );
  return rows[0];
}

account.post('/account/addresses', requireAuth, async (req, res) => {
  const addr = cleanAddress(req.body);
  res.status(201).json(await tx((db) => saveAddress(db, req.user.id, addr, { makeDefault: req.body?.is_default === true })));
});

account.put('/account/addresses/:id', requireAuth, async (req, res) => {
  const addr = cleanAddress(req.body);
  const saved = await tx(async (db) => {
    const { rows } = await db.query(`SELECT id FROM customer_addresses WHERE id = $1 AND user_id = $2 FOR UPDATE`, [Number(req.params.id) || 0, req.user.id]);
    if (!rows[0]) throw new HttpError(404, 'Address not found.');
    if (req.body?.is_default === true) await db.query(`UPDATE customer_addresses SET is_default = false WHERE user_id = $1`, [req.user.id]);
    const { rows: up } = await db.query(
      `UPDATE customer_addresses SET name = $1, phone = $2, address_line = $3, city = $4, state = $5, pin = $6,
              is_default = is_default OR $7, updated_at = now()
       WHERE id = $8 RETURNING ${ADDRESS_COLS}`,
      [addr.name, addr.phone, addr.address_line, addr.city, addr.state, addr.pin, req.body?.is_default === true, rows[0].id]
    );
    return up[0];
  });
  res.json(saved);
});

account.delete('/account/addresses/:id', requireAuth, async (req, res) => {
  await tx(async (db) => {
    const { rows } = await db.query(`DELETE FROM customer_addresses WHERE id = $1 AND user_id = $2 RETURNING is_default`, [Number(req.params.id) || 0, req.user.id]);
    if (!rows[0]) throw new HttpError(404, 'Address not found.');
    // keep one default address
    if (rows[0].is_default) {
      await db.query(
        `UPDATE customer_addresses SET is_default = true WHERE id = (SELECT id FROM customer_addresses WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1)`,
        [req.user.id]
      );
    }
  });
  res.json({ ok: true });
});

// ---------- wishlist (product ids) ----------

const wishlistIds = async (userId) =>
  (await query(`SELECT product_id FROM wishlist_items WHERE user_id = $1 ORDER BY created_at DESC`, [userId])).rows.map((r) => r.product_id);

account.get('/wishlist', requireAuth, async (req, res) => {
  res.json({ items: await wishlistIds(req.user.id) });
});

account.put('/wishlist/:productId', requireAuth, async (req, res) => {
  const { rows } = await query(`SELECT id FROM products WHERE id = $1 AND active AND status = 'active'`, [String(req.params.productId)]);
  if (!rows[0]) throw new HttpError(404, 'Product not found.');
  await query(`INSERT INTO wishlist_items (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.user.id, rows[0].id]);
  res.json({ items: await wishlistIds(req.user.id) });
});

account.delete('/wishlist/:productId', requireAuth, async (req, res) => {
  await query(`DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2`, [req.user.id, String(req.params.productId)]);
  res.json({ items: await wishlistIds(req.user.id) });
});

// Guest wishlist from the browser, merged in on sign-in
account.post('/wishlist/merge', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.items) ? req.body.items.map(String).slice(0, 100) : [];
  if (ids.length) {
    await query(
      `INSERT INTO wishlist_items (user_id, product_id)
       SELECT $1, p.id FROM products p WHERE p.id = ANY($2::text[]) AND p.active AND p.status = 'active'
       ON CONFLICT DO NOTHING`,
      [req.user.id, ids]
    );
  }
  res.json({ items: await wishlistIds(req.user.id) });
});

// ---------- reviews ----------

async function productBySlug(slug) {
  const { rows } = await query(`SELECT id FROM products WHERE slug = $1 AND active AND status = 'active'`, [String(slug)]);
  if (!rows[0]) throw new HttpError(404, 'Product not found');
  return rows[0];
}

// Customers can review a product once it has been delivered to them
async function hasReceived(userId, productId) {
  const { rows } = await query(
    `SELECT 1 FROM orders o JOIN order_items i ON i.order_id = o.id
     WHERE o.user_id = $1 AND i.product_id = $2 AND o.status = 'delivered' LIMIT 1`,
    [userId, productId]
  );
  return rows.length > 0;
}

account.get('/products/:slug/reviews', async (req, res) => {
  const p = await productBySlug(req.params.slug);
  const [list, stats] = await Promise.all([
    query(
      `SELECT r.id, r.rating, r.title, r.body, r.created_at, r.user_id,
              split_part(u.name, ' ', 1) || COALESCE(' ' || left(nullif(split_part(u.name, ' ', 2), ''), 1) || '.', '') AS author
       FROM product_reviews r JOIN users u ON u.id = r.user_id
       WHERE r.product_id = $1 AND r.status = 'published' ORDER BY r.created_at DESC LIMIT 50`,
      [p.id]
    ),
    query(
      `SELECT count(*)::int AS count, COALESCE(round(avg(rating)::numeric, 1), 0)::float AS average,
              json_build_object('5', count(*) FILTER (WHERE rating = 5), '4', count(*) FILTER (WHERE rating = 4),
                                '3', count(*) FILTER (WHERE rating = 3), '2', count(*) FILTER (WHERE rating = 2),
                                '1', count(*) FILTER (WHERE rating = 1)) AS breakdown
       FROM product_reviews WHERE product_id = $1 AND status = 'published'`,
      [p.id]
    ),
  ]);
  let mine = null;
  let canReview = false;
  if (req.user) {
    const { rows } = await query(`SELECT id, rating, title, body, status FROM product_reviews WHERE product_id = $1 AND user_id = $2`, [p.id, req.user.id]);
    mine = rows[0] || null;
    canReview = await hasReceived(req.user.id, p.id);
  }
  res.json({
    ...stats.rows[0],
    items: list.rows.map(({ user_id, ...r }) => ({ ...r, mine: req.user?.id === user_id })),
    mine,
    canReview,
  });
});

account.post('/products/:slug/reviews', requireAuth, async (req, res) => {
  rateLimit(`review|${req.user.id}`, 20, 60 * 60 * 1000);
  const p = await productBySlug(req.params.slug);
  if (!(await hasReceived(req.user.id, p.id))) throw new HttpError(403, 'You can review this product once your order has been delivered.');
  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Choose a rating from 1 to 5 stars.', { rating: 'Required.' });
  const title = String(req.body?.title ?? '').trim().slice(0, 120) || null;
  const body = String(req.body?.body ?? '').trim().slice(0, 2000) || null;
  await query(
    `INSERT INTO product_reviews (product_id, user_id, rating, title, body) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (product_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, title = EXCLUDED.title, body = EXCLUDED.body, updated_at = now()`,
    [p.id, req.user.id, rating, title, body]
  );
  res.status(201).json({ ok: true });
});

account.delete('/products/:slug/reviews/mine', requireAuth, async (req, res) => {
  const p = await productBySlug(req.params.slug);
  await query(`DELETE FROM product_reviews WHERE product_id = $1 AND user_id = $2`, [p.id, req.user.id]);
  res.json({ ok: true });
});

// ---------- "notify me when back in stock" ----------

account.post('/stock-alerts', async (req, res) => {
  rateLimit(`stock-alert|${req.ip}`, 20, 60 * 60 * 1000);
  const variantId = Number(req.body?.variantId);
  const email = String(req.body?.email ?? req.user?.email ?? '').trim().toLowerCase();
  if (!Number.isInteger(variantId) || variantId <= 0) throw new HttpError(400, 'Choose an option first.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'Enter a valid email address.', { email: 'Invalid email.' });
  const { rows } = await query(
    `SELECT v.stock FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = $1 AND p.active AND p.status = 'active'`,
    [variantId]
  );
  if (!rows[0]) throw new HttpError(404, 'Product not found');
  if (rows[0].stock > 0) throw new HttpError(400, 'Good news - this is in stock right now.');
  await query(
    `INSERT INTO stock_alerts (variant_id, email) VALUES ($1, $2)
     ON CONFLICT (variant_id, lower(email)) WHERE notified_at IS NULL DO NOTHING`,
    [variantId, email]
  );
  res.status(201).json({ ok: true });
});
