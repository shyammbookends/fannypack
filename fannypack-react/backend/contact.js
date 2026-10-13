import { Router } from 'express';
import { query } from './db.js';
import { HttpError, rateLimit } from './auth.js';
import { isEmail } from './lib/validate.js';
import { notify } from './lib/notify.js';

// Contact page form. Saved for Admin -> Messages, and the admin gets a bell + email alert.
export const contact = Router();

export const TOPICS = { order: 'An order', product: 'A product', wholesale: 'Wholesale / bulk', collab: 'Collaboration', other: 'Something else' };

const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

contact.post('/contact', async (req, res) => {
  rateLimit(`contact|${req.ip}`, 5, 60 * 60 * 1000);
  const b = req.body || {};
  // Honeypot: a hidden field real people never fill in. Bots do - pretend it worked.
  if (b.website) return res.status(201).json({ ok: true });

  const name = clean(b.name, 80);
  const email = clean(b.email, 254).toLowerCase();
  const phone = clean(b.phone, 20).replace(/[^\d+ ]/g, '');
  const topic = Object.hasOwn(TOPICS, b.topic) ? b.topic : 'other';
  const orderNumber = clean(b.orderNumber, 40).toUpperCase().replace(/[^A-Z0-9-]/g, '') || null;
  const message = String(b.message ?? '').trim().slice(0, 3000);

  const fields = {};
  if (name.length < 2) fields.name = 'Please enter your name.';
  if (!isEmail(email)) fields.email = 'Please enter a valid email so we can reply.';
  if (phone && phone.replace(/\D/g, '').length < 10) fields.phone = 'Please enter a 10-digit mobile number (or leave it empty).';
  if (message.length < 10) fields.message = 'Please write a little more (at least 10 characters).';
  if (Object.keys(fields).length) throw new HttpError(400, 'Please check the highlighted fields.', fields);
  rateLimit(`contact-email|${email}`, 3, 60 * 60 * 1000);

  const { rows } = await query(
    `INSERT INTO contact_messages (name, email, phone, topic, order_number, message, user_id, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [name, email, phone || null, topic, orderNumber, message, req.user?.id ?? null, req.ip]
  );
  await notify({
    type: 'contact_message',
    title: `New message from ${name} (${TOPICS[topic]})`,
    body: `${email}${phone ? ` · ${phone}` : ''}${orderNumber ? ` · Order ${orderNumber}` : ''}\n\n${message.slice(0, 500)}`,
    link: '/admin/messages',
    severity: 'info',
    email: true,
  });
  res.status(201).json({ ok: true, id: rows[0].id });
});
