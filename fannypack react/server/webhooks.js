import crypto from 'node:crypto';
import express, { Router } from 'express';
import { query, tx } from './db.js';
import { razorpayCreds, verifyWebhookSignature } from './integrations/razorpay.js';
import { getIntegration } from './integrations/store.js';
import { markOrderPaid, recordPaymentFailure } from './lib/payments.js';
import { applyTracking } from './lib/fulfilment.js';
import { addHistory } from './lib/orderHistory.js';
import { notify } from './lib/notify.js';

// Webhooks need the exact raw body for signature checks, so each route gets its own raw parser
// (mounted before express.json in index.js).
export const webhooks = Router();
const rawBody = express.raw({ type: '*/*', limit: '1mb' });

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

// Store the event once (provider + event id is unique). Returns the row, or null for a finished duplicate.
async function storeEvent(provider, eventId, type, payload, signature) {
  const ins = await query(
    `INSERT INTO webhook_events (provider, event_id, event_type, payload, signature)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (provider, event_id) DO NOTHING RETURNING *`,
    [provider, eventId, type, JSON.stringify(payload), signature ? String(signature).slice(0, 200) : null]
  );
  if (ins.rows[0]) return ins.rows[0];
  const { rows } = await query(`SELECT * FROM webhook_events WHERE provider = $1 AND event_id = $2`, [provider, eventId]);
  // already processed / ignored -> duplicate delivery, nothing to do
  return ['processed', 'ignored'].includes(rows[0]?.processing_status) ? null : rows[0];
}

async function finish(id, status, error = null) {
  await query(
    `UPDATE webhook_events SET processing_status = $1, error_message = $2, processed_at = now(), attempts = attempts + 1 WHERE id = $3`,
    [status, error, id]
  );
}

async function rejected(provider, type, payload, reason) {
  await query(
    `INSERT INTO webhook_events (provider, event_id, event_type, payload, processing_status, error_message, processed_at)
     VALUES ($1, $2, $3, $4, 'rejected', $5, now())`,
    [provider, `rejected-${crypto.randomUUID()}`, type, JSON.stringify(payload ?? null), reason]
  );
  await notify({ type: 'webhook_failure', title: `${provider} webhook rejected`, body: reason, link: '/admin/integrations', severity: 'critical' });
}

// ---------------- Razorpay ----------------

// Handle one stored Razorpay event (also used by "Retry" in the admin)
export async function processRazorpayEvent(event) {
  const p = event.payload?.payload || {};
  const payment = p.payment?.entity;
  const refund = p.refund?.entity;
  switch (event.event_type) {
    case 'payment.captured':
    case 'order.paid': {
      const rpOrderId = payment?.order_id || p.order?.entity?.id;
      if (!rpOrderId || !payment?.id) return 'ignored';
      const r = await markOrderPaid({ razorpayOrderId: rpOrderId, paymentId: payment.id, amountPaise: payment.amount, method: payment.method, raw: payment, source: 'webhook' });
      return r.order ? 'processed' : 'ignored';
    }
    case 'payment.failed': {
      if (!payment?.order_id) return 'ignored';
      await recordPaymentFailure({ razorpayOrderId: payment.order_id, paymentId: payment.id, error: payment.error_description || payment.error_reason, raw: payment, source: 'webhook' });
      return 'processed';
    }
    case 'refund.created':
    case 'refund.processed':
    case 'refund.failed': {
      if (!refund?.id) return 'ignored';
      const status = event.event_type === 'refund.failed' ? 'failed' : event.event_type === 'refund.processed' ? 'processed' : 'pending';
      return tx(async (db) => {
        const { rows } = await db.query(
          `SELECT o.* FROM orders o WHERE o.razorpay_payment_id = $1
           UNION SELECT o.* FROM orders o JOIN payments pm ON pm.order_id = o.id WHERE pm.provider_payment_id = $1 LIMIT 1`,
          [refund.payment_id]
        );
        const order = rows[0];
        await db.query(
          `INSERT INTO refunds (order_id, provider, provider_refund_id, payment_id, amount, status, raw)
           VALUES ($1, 'razorpay', $2, $3, $4, $5, $6)
           ON CONFLICT (provider, provider_refund_id) DO UPDATE SET status = EXCLUDED.status, raw = EXCLUDED.raw, updated_at = now()`,
          [order?.id ?? null, refund.id, refund.payment_id, Math.round(refund.amount / 100), status, JSON.stringify(refund)]
        );
        if (order) {
          const { rows: t } = await db.query(`SELECT COALESCE(sum(amount),0)::int AS s FROM refunds WHERE order_id = $1 AND status <> 'failed'`, [order.id]);
          if (t[0].s >= order.total && order.payment_status !== 'refunded') {
            await db.query(`UPDATE orders SET payment_status = 'refunded', updated_at = now() WHERE id = $1`, [order.id]);
          }
          await addHistory(db, order.id, `refund_${status}`, { note: `₹${Math.round(refund.amount / 100)} (${refund.id})`, source: 'webhook' });
        }
        return 'processed';
      });
    }
    default:
      return 'ignored';
  }
}

webhooks.post('/webhooks/razorpay', rawBody, async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  let payload = null;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    await rejected('razorpay', null, null, 'Body is not valid JSON');
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  const creds = await razorpayCreds();
  const signature = req.get('x-razorpay-signature');
  if (!creds?.webhookSecret) {
    await rejected('razorpay', payload?.event, payload, 'Webhook secret is not configured in Admin -> Integrations -> Razorpay');
    return res.status(503).json({ error: 'Webhook not configured' });
  }
  if (!verifyWebhookSignature(raw, signature, creds.webhookSecret)) {
    await rejected('razorpay', payload?.event, payload, 'Invalid signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }
  const eventId = req.get('x-razorpay-event-id') || crypto.createHash('sha256').update(raw).digest('hex');
  const ev = await storeEvent('razorpay', eventId, payload.event, payload, signature);
  if (!ev) return res.json({ ok: true, duplicate: true });
  try {
    await finish(ev.id, await processRazorpayEvent(ev));
    res.json({ ok: true });
  } catch (err) {
    await finish(ev.id, 'failed', err.message);
    await notify({ type: 'webhook_failure', title: `Razorpay webhook failed (${payload.event})`, body: err.message, link: '/admin/integrations', severity: 'critical' });
    res.status(500).json({ error: 'Processing failed' }); // Razorpay will retry
  }
});

// ---------------- Shiprocket ----------------

export async function processShiprocketEvent(event) {
  const b = event.payload || {};
  const awb = b.awb ? String(b.awb) : null;
  const { rows } = await query(
    `SELECT id FROM orders WHERE ($1::text IS NOT NULL AND awb_code = $1) OR number = $2 OR shiprocket_order_id = $3 LIMIT 1`,
    [awb, String(b.order_id || ''), String(b.sr_order_id || b.order_id || '')]
  );
  if (!rows[0]) return 'ignored';
  await applyTracking(rows[0].id, {
    statusText: b.current_status || b.shipment_status,
    activities: (b.scans || []).map((s) => ({ date: s.date, status: s.status || s['sr-status-label'], activity: s.activity, location: s.location, 'sr-status': s['sr-status'], 'sr-status-label': s['sr-status-label'] })),
    etd: b.etd || null,
    awb,
    courier: b.courier_name || null,
    source: 'webhook',
  });
  return 'processed';
}

// Shiprocket does not allow the words "shiprocket"/"sr"/"kr" in webhook URLs, so the
// endpoint to register is /api/webhooks/shipping-updates. /api/webhooks/shiprocket also works.
async function shiprocketWebhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  let payload = null;
  try {
    payload = JSON.parse(raw.toString('utf8') || '{}');
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  const i = await getIntegration('shiprocket');
  const token = req.get('x-api-key');
  if (!i.secrets.webhook_token || !safeEqual(token, i.secrets.webhook_token)) {
    await rejected('shiprocket', payload?.current_status, payload, 'Missing or wrong x-api-key token');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const eventId = crypto
    .createHash('sha256')
    .update(`${payload.awb}|${payload.current_status_id ?? payload.current_status}|${payload.current_timestamp ?? ''}`)
    .digest('hex');
  const ev = await storeEvent('shiprocket', eventId, payload.current_status || payload.shipment_status || 'update', payload, null);
  if (!ev) return res.json({ ok: true, duplicate: true });
  try {
    await finish(ev.id, await processShiprocketEvent(ev));
  } catch (err) {
    await finish(ev.id, 'failed', err.message);
    await notify({ type: 'webhook_failure', title: 'Shipping webhook failed', body: err.message, link: '/admin/integrations', severity: 'critical' });
  }
  // Always answer 200 so Shiprocket keeps the webhook active; failures are retried from the admin
  res.json({ ok: true });
}
webhooks.post('/webhooks/shipping-updates', rawBody, shiprocketWebhook);
webhooks.post('/webhooks/shiprocket', rawBody, shiprocketWebhook);

// Retry a stored event (Admin -> Integrations -> Webhooks)
export async function retryWebhookEvent(id) {
  const { rows } = await query(`SELECT * FROM webhook_events WHERE id = $1`, [id]);
  const ev = rows[0];
  if (!ev) throw Object.assign(new Error('Event not found.'), { status: 404 });
  if (ev.processing_status === 'rejected') throw Object.assign(new Error('Rejected events (bad signature) cannot be retried.'), { status: 400 });
  try {
    const status = ev.provider === 'razorpay' ? await processRazorpayEvent(ev) : await processShiprocketEvent(ev);
    await finish(ev.id, status);
    return status;
  } catch (err) {
    await finish(ev.id, 'failed', err.message);
    throw Object.assign(new Error(err.message), { status: 502 });
  }
}
