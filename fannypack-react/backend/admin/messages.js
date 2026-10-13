import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm } from './auth.js';
import { audit } from '../lib/audit.js';
import { HttpError, int, paging } from './util.js';

// Admin -> Messages: what customers sent from the Contact page
export const messages = Router();

messages.get('/messages', requirePerm('customers'), async (req, res) => {
  const { page, pageSize, offset } = paging(req);
  const params = [];
  let where = '';
  if (['new', 'read', 'replied', 'spam'].includes(req.query.status)) {
    params.push(req.query.status);
    where = `WHERE status = $1`;
  }
  const [list, count, counts] = await Promise.all([
    query(`SELECT * FROM contact_messages ${where} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`, params),
    query(`SELECT count(*)::int AS n FROM contact_messages ${where}`, params),
    query(`SELECT status, count(*)::int AS n FROM contact_messages GROUP BY status`),
  ]);
  res.json({ items: list.rows, total: count.rows[0].n, page, pageSize, counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])) });
});

messages.put('/messages/:id', requirePerm('customers'), async (req, res) => {
  const status = String(req.body?.status || '');
  if (!['new', 'read', 'replied', 'spam'].includes(status)) throw new HttpError(400, 'Unknown status.');
  const { rows } = await query(`UPDATE contact_messages SET status = $1, updated_at = now() WHERE id = $2 RETURNING id, status`, [status, int(req.params.id)]);
  if (!rows[0]) throw new HttpError(404, 'Message not found.');
  await audit(req, `message.${status}`, 'message', rows[0].id);
  res.json(rows[0]);
});

messages.delete('/messages/:id', requirePerm('customers'), async (req, res) => {
  const { rows } = await query(`DELETE FROM contact_messages WHERE id = $1 RETURNING id`, [int(req.params.id)]);
  if (!rows[0]) throw new HttpError(404, 'Message not found.');
  await audit(req, 'message.delete', 'message', rows[0].id);
  res.json({ ok: true });
});
