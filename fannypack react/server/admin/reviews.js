import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm } from './auth.js';
import { audit } from '../lib/audit.js';
import { HttpError, int, paging } from './util.js';

// Customer reviews: list, hide / publish, delete
export const reviews = Router();

reviews.get('/reviews', requirePerm('products'), async (req, res) => {
  const { page, pageSize, offset } = paging(req);
  const params = [];
  const where = [];
  if (['published', 'hidden'].includes(req.query.status)) {
    params.push(req.query.status);
    where.push(`r.status = $${params.length}`);
  }
  if (req.query.rating && int(req.query.rating)) {
    params.push(int(req.query.rating));
    where.push(`r.rating = $${params.length}`);
  }
  const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [list, count] = await Promise.all([
    query(
      `SELECT r.id, r.rating, r.title, r.body, r.status, r.created_at, r.product_id,
              COALESCE(p.display_name, p.name) AS product, p.slug, u.id AS user_id, u.name AS customer, u.email
       FROM product_reviews r JOIN products p ON p.id = r.product_id JOIN users u ON u.id = r.user_id
       ${W} ORDER BY r.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
      params
    ),
    query(`SELECT count(*)::int AS n FROM product_reviews r ${W}`, params),
  ]);
  res.json({ items: list.rows, total: count.rows[0].n, page, pageSize });
});

reviews.put('/reviews/:id', requirePerm('products'), async (req, res) => {
  const status = req.body?.status;
  if (!['published', 'hidden'].includes(status)) throw new HttpError(400, 'Unknown status.');
  const { rows } = await query(`UPDATE product_reviews SET status = $1, updated_at = now() WHERE id = $2 RETURNING id, status`, [status, int(req.params.id)]);
  if (!rows[0]) throw new HttpError(404, 'Review not found.');
  await audit(req, `review.${status === 'hidden' ? 'hide' : 'publish'}`, 'review', rows[0].id);
  res.json(rows[0]);
});

reviews.delete('/reviews/:id', requirePerm('products'), async (req, res) => {
  const { rows } = await query(`DELETE FROM product_reviews WHERE id = $1 RETURNING id, product_id, rating`, [int(req.params.id)]);
  if (!rows[0]) throw new HttpError(404, 'Review not found.');
  await audit(req, 'review.delete', 'review', rows[0].id, { product: rows[0].product_id, rating: rows[0].rating }, null);
  res.json({ ok: true });
});
