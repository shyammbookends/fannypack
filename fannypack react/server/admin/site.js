import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm } from './auth.js';
import { audit, diff } from '../lib/audit.js';
import { getSetting, setSetting, DEFAULTS } from '../lib/settings.js';
import { getDraftContent, getPublishedContent, publishContent, saveDraftContent, DEFAULT_CONTENT } from '../lib/content.js';
import { mask } from '../lib/crypto.js';
import { getIntegration, removeIntegration, saveIntegration } from '../integrations/store.js';
import { razorpayCreds, razorpayEnvironment, testRazorpay } from '../integrations/razorpay.js';
import { shiprocketLogin } from '../integrations/shiprocket.js';
import { retryWebhookEvent } from '../webhooks.js';
import { notify } from '../lib/notify.js';
import { bool, HttpError, int, paging, str } from './util.js';

export const site = Router();

// ================= Content (CMS) =================
// jsonb does not keep key order, so compare with sorted keys
const stable = (v) =>
  Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  : JSON.stringify(v);

site.get('/content', requirePerm('content'), async (_req, res) => {
  const [draft, published] = await Promise.all([getDraftContent(), getPublishedContent()]);
  res.json({ draft, published, unpublished: stable(draft) !== stable(published), defaults: DEFAULT_CONTENT });
});

site.put('/content', requirePerm('content'), async (req, res) => {
  const body = req.body?.content;
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Nothing to save.');
  if (JSON.stringify(body).length > 200_000) throw new HttpError(413, 'Content is too large.');
  const saved = await saveDraftContent(body);
  await audit(req, 'content.save_draft', 'content', 'site', null, { sections: Object.keys(body) });
  res.json({ draft: saved });
});

site.post('/content/publish', requirePerm('content'), async (req, res) => {
  const before = await getPublishedContent();
  const after = await publishContent();
  const ch = diff(before, after);
  await audit(req, 'content.publish', 'content', 'site', ch.before, ch.after);
  res.json({ published: after });
});

site.post('/content/discard', requirePerm('content'), async (req, res) => {
  await saveDraftContent(await getPublishedContent());
  await audit(req, 'content.discard_draft', 'content', 'site');
  res.json({ ok: true });
});

// ================= Settings =================
const SETTING_KEYS = ['store', 'shipping', 'delivery', 'notifications', 'seo'];

site.get('/settings', requirePerm('settings'), async (_req, res) => {
  const out = {};
  for (const k of SETTING_KEYS) out[k] = await getSetting(k);
  res.json(out);
});

function cleanSetting(key, v) {
  const d = DEFAULTS[key];
  const out = {};
  for (const [k, def] of Object.entries(d)) {
    const x = v?.[k];
    if (x === undefined) out[k] = def;
    else if (typeof def === 'boolean') out[k] = bool(x);
    else if (typeof def === 'number') out[k] = Math.max(0, Number(x) || 0);
    else if (Array.isArray(def)) out[k] = (Array.isArray(x) ? x : String(x).split(/[\s,]+/)).map((s) => String(s).trim()).filter(Boolean).slice(0, 5000);
    else out[k] = str(x, 1000) ?? '';
  }
  if (key === 'delivery') {
    for (const f of ['allowed_pincodes', 'blocked_pincodes']) {
      const bad = out[f].find((p) => !/^\d{3,6}\*?$/.test(p));
      if (bad) throw new HttpError(400, `"${bad}" is not a valid PIN code (use 6 digits, or a prefix like 3800*).`, { [f]: 'Invalid PIN code.' });
    }
  }
  if (key === 'store') {
    out.gstin = out.gstin.toUpperCase().replace(/\s/g, '');
    out.fssai = out.fssai.replace(/\s/g, '');
    if (out.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(out.gstin)) {
      throw new HttpError(400, 'GSTIN must be 15 characters, like 24ABCDE1234F1Z5.', { gstin: 'Invalid GSTIN.' });
    }
    if (out.fssai && !/^\d{14}$/.test(out.fssai)) throw new HttpError(400, 'FSSAI licence number must be 14 digits.', { fssai: 'Invalid FSSAI number.' });
    for (const f of ['contact_email', 'grievance_email']) {
      if (out[f] && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out[f])) throw new HttpError(400, 'Enter a valid email address.', { [f]: 'Invalid email.' });
    }
  }
  if (key === 'notifications' && out.admin_email &&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out.admin_email)) {
    throw new HttpError(400, 'Enter a valid email address.', { admin_email: 'Invalid email.' });
  }
  return out;
}

site.put('/settings/:key', requirePerm('settings'), async (req, res) => {
  const key = req.params.key;
  if (!SETTING_KEYS.includes(key)) throw new HttpError(404, 'Unknown settings section.');
  const before = await getSetting(key);
  const value = cleanSetting(key, req.body || {});
  const after = await setSetting(key, value);
  const ch = diff(before, after);
  if (Object.keys(ch.after).length) await audit(req, `settings.${key}`, 'settings', key, ch.before, ch.after);
  res.json(after);
});

// ================= Integrations =================
const PUBLIC_URL = () => (process.env.PUBLIC_URL || '').replace(/\/$/, '');

async function webhookStats(provider) {
  const { rows } = await query(
    `SELECT
       (SELECT row_to_json(x) FROM (SELECT event_type, processing_status, received_at, error_message FROM webhook_events
          WHERE provider = $1 ORDER BY received_at DESC LIMIT 1) x) AS last,
       count(*) FILTER (WHERE processing_status = 'failed')::int AS failed,
       count(*) FILTER (WHERE processing_status = 'rejected')::int AS rejected,
       count(*)::int AS total
     FROM webhook_events WHERE provider = $1`,
    [provider]
  );
  return rows[0];
}

site.get('/integrations', requirePerm('integrations'), async (_req, res) => {
  const [rp, sr, rpHooks, srHooks] = await Promise.all([getIntegration('razorpay'), getIntegration('shiprocket'), webhookStats('razorpay'), webhookStats('shiprocket')]);
  const creds = await razorpayCreds();
  res.json({
    razorpay: {
      status: rp.config.key_id ? rp.status : creds?.source === 'env' ? 'connected' : 'disconnected',
      source: creds?.source || null,
      enabled: rp.config.enabled !== false,
      environment: creds ? razorpayEnvironment(creds.keyId) : null,
      keyId: creds?.keyId ? mask(creds.keyId, 6) : null,
      keySecret: creds?.keySecret ? '••••••••••••' : null,
      webhookSecretSet: Boolean(creds?.webhookSecret),
      lastError: rp.last_error,
      lastCheckedAt: rp.last_checked_at,
      unreadable: rp.unreadable,
      webhook: { url: `${PUBLIC_URL()}/api/webhooks/razorpay`, ...rpHooks, events: ['payment.captured', 'payment.failed', 'order.paid', 'refund.created', 'refund.processed', 'refund.failed'] },
    },
    shiprocket: {
      status: sr.status,
      email: sr.config.email ? mask(sr.config.email, 10) : null,
      passwordSet: Boolean(sr.secrets.password),
      tokenSet: Boolean(sr.secrets.token),
      tokenExpires: sr.secrets.token_expires || null,
      pickupLocation: sr.config.pickup_location || '',
      autoCreate: sr.config.auto_create !== false,
      autoCreateCod: Boolean(sr.config.auto_create_cod),
      autoAwb: sr.config.auto_awb !== false,
      autoPickup: sr.config.auto_pickup !== false,
      defaults: {
        weight_g: sr.config.default_weight_g || 500,
        length_cm: sr.config.default_length_cm || 20,
        width_cm: sr.config.default_width_cm || 15,
        height_cm: sr.config.default_height_cm || 10,
      },
      lastError: sr.last_error,
      lastCheckedAt: sr.last_checked_at,
      unreadable: sr.unreadable,
      webhook: {
        url: `${PUBLIC_URL()}/api/webhooks/shipping-updates`,
        tokenSet: Boolean(sr.secrets.webhook_token),
        ...srHooks,
      },
    },
  });
});

// Save + test Razorpay (Key Secret is write-only: blank keeps the saved one)
site.put('/integrations/razorpay', requirePerm('integrations'), async (req, res) => {
  const cur = await getIntegration('razorpay');
  const keyId = str(req.body?.keyId, 60) || cur.config.key_id;
  const keySecret = str(req.body?.keySecret, 100) || cur.secrets.key_secret;
  const webhookSecret = req.body?.webhookSecret !== undefined && req.body.webhookSecret !== '' ? str(req.body.webhookSecret, 200) : cur.secrets.webhook_secret;
  if (!keyId || !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) throw new HttpError(400, 'Key ID should look like rzp_test_... or rzp_live_...', { keyId: 'Invalid Key ID.' });
  if (!keySecret) throw new HttpError(400, 'Enter the Key Secret.', { keySecret: 'Required.' });
  try {
    await testRazorpay(keyId, keySecret);
  } catch (err) {
    await saveIntegration('razorpay', { status: 'error', last_error: err.message, checked: true });
    await audit(req, 'integration.razorpay_failed', 'integration', 'razorpay', null, { error: err.message });
    throw new HttpError(400, `Razorpay connection failed: ${err.message}`);
  }
  await saveIntegration('razorpay', {
    config: { ...cur.config, key_id: keyId, enabled: req.body?.enabled !== false },
    secrets: { ...cur.secrets, key_secret: keySecret, webhook_secret: webhookSecret || undefined },
    status: 'connected',
    last_error: null,
    checked: true,
  });
  await audit(req, 'integration.razorpay_saved', 'integration', 'razorpay', null, { keyId: mask(keyId, 6), environment: razorpayEnvironment(keyId), webhookSecret: webhookSecret ? 'set' : 'not set' });
  res.json({ ok: true, message: `Connected successfully (${razorpayEnvironment(keyId)} mode).` });
});

site.post('/integrations/razorpay/test', requirePerm('integrations'), async (req, res) => {
  const creds = await razorpayCreds();
  if (!creds) throw new HttpError(400, 'Razorpay is not connected.');
  try {
    const r = await testRazorpay(creds.keyId, creds.keySecret);
    if (creds.source === 'admin') await saveIntegration('razorpay', { status: 'connected', last_error: null, checked: true });
    res.json({ ok: true, message: `Connected successfully (${r.environment} mode).` });
  } catch (err) {
    if (creds.source === 'admin') await saveIntegration('razorpay', { status: 'error', last_error: err.message, checked: true });
    await notify({ type: 'integration_failure', title: 'Razorpay connection failed', body: err.message, link: '/admin/integrations', severity: 'critical' });
    throw new HttpError(400, `Razorpay connection failed: ${err.message}`);
  }
});

site.post('/integrations/razorpay/enabled', requirePerm('integrations'), async (req, res) => {
  const cur = await getIntegration('razorpay');
  if (!cur.config.key_id) throw new HttpError(400, 'Connect Razorpay first.');
  const enabled = bool(req.body?.enabled);
  await saveIntegration('razorpay', { config: { ...cur.config, enabled } });
  await audit(req, 'integration.razorpay_enabled', 'integration', 'razorpay', { enabled: cur.config.enabled !== false }, { enabled });
  res.json({ ok: true });
});

site.delete('/integrations/razorpay', requirePerm('integrations'), async (req, res) => {
  await removeIntegration('razorpay');
  await audit(req, 'integration.razorpay_disconnected', 'integration', 'razorpay');
  res.json({ ok: true });
});

// Shiprocket: API user email + password (+ pickup location / automation flags)
site.put('/integrations/shiprocket', requirePerm('integrations'), async (req, res) => {
  const cur = await getIntegration('shiprocket');
  const b = req.body || {};
  const email = str(b.email, 120) || cur.config.email;
  const password = str(b.password, 200) || cur.secrets.password;
  if (!email) throw new HttpError(400, 'Enter the Shiprocket API user email.', { email: 'Required.' });
  if (!password) throw new HttpError(400, 'Enter the API user password.', { password: 'Required.' });
  const config = {
    ...cur.config,
    email,
    pickup_location: str(b.pickupLocation, 100) ?? cur.config.pickup_location ?? '',
    auto_create: b.autoCreate !== undefined ? bool(b.autoCreate) : cur.config.auto_create !== false,
    auto_create_cod: b.autoCreateCod !== undefined ? bool(b.autoCreateCod) : Boolean(cur.config.auto_create_cod),
    auto_awb: b.autoAwb !== undefined ? bool(b.autoAwb) : cur.config.auto_awb !== false,
    auto_pickup: b.autoPickup !== undefined ? bool(b.autoPickup) : cur.config.auto_pickup !== false,
    default_weight_g: int(b.defaults?.weight_g) || cur.config.default_weight_g || 500,
    default_length_cm: int(b.defaults?.length_cm) || cur.config.default_length_cm || 20,
    default_width_cm: int(b.defaults?.width_cm) || cur.config.default_width_cm || 15,
    default_height_cm: int(b.defaults?.height_cm) || cur.config.default_height_cm || 10,
  };
  const credsChanged = email !== cur.config.email || password !== cur.secrets.password || !cur.secrets.token;
  let secrets = { ...cur.secrets, password };
  if (credsChanged) {
    try {
      const t = await shiprocketLogin(email, password);
      secrets = { ...secrets, token: t.token, token_expires: t.expiresAt };
    } catch (err) {
      // wrong credentials are not saved; only the failure is recorded
      await saveIntegration('shiprocket', { status: cur.config.email ? 'error' : 'disconnected', last_error: err.message, checked: true });
      await audit(req, 'integration.shiprocket_failed', 'integration', 'shiprocket', null, { error: err.message });
      throw new HttpError(400, `Shiprocket connection failed: ${err.message}`);
    }
  }
  await saveIntegration('shiprocket', { config, secrets, status: 'connected', last_error: null, checked: credsChanged });
  await audit(req, 'integration.shiprocket_saved', 'integration', 'shiprocket', null, { email: mask(email, 10), pickup_location: config.pickup_location, auto_create: config.auto_create });
  res.json({ ok: true, message: credsChanged ? 'Connected successfully.' : 'Settings saved.' });
});

site.post('/integrations/shiprocket/test', requirePerm('integrations'), async (req, res) => {
  const cur = await getIntegration('shiprocket');
  if (!cur.config.email || !cur.secrets.password) throw new HttpError(400, 'Shiprocket is not connected.');
  try {
    const t = await shiprocketLogin(cur.config.email, cur.secrets.password);
    await saveIntegration('shiprocket', { secrets: { ...cur.secrets, token: t.token, token_expires: t.expiresAt }, status: 'connected', last_error: null, checked: true });
    res.json({ ok: true, message: 'Connected successfully. Token refreshed.' });
  } catch (err) {
    await saveIntegration('shiprocket', { status: 'error', last_error: err.message, checked: true });
    await notify({ type: 'integration_failure', title: 'Shiprocket connection failed', body: err.message, link: '/admin/integrations', severity: 'critical' });
    throw new HttpError(400, `Shiprocket connection failed: ${err.message}`);
  }
});

// Token for Shiprocket to send in the x-api-key header of its webhook calls
site.post('/integrations/shiprocket/webhook-token', requirePerm('integrations'), async (req, res) => {
  const cur = await getIntegration('shiprocket');
  const { randomToken } = await import('../lib/crypto.js');
  const token = randomToken(20);
  await saveIntegration('shiprocket', { secrets: { ...cur.secrets, webhook_token: token } });
  await audit(req, 'integration.shiprocket_webhook_token', 'integration', 'shiprocket');
  // shown once so it can be pasted into Shiprocket
  res.json({ token });
});

site.delete('/integrations/shiprocket', requirePerm('integrations'), async (req, res) => {
  await removeIntegration('shiprocket');
  await audit(req, 'integration.shiprocket_disconnected', 'integration', 'shiprocket');
  res.json({ ok: true });
});

// Webhook event log
site.get('/webhooks', requirePerm('integrations'), async (req, res) => {
  const { page, pageSize, offset } = paging(req);
  const params = [];
  const where = [];
  if (['razorpay', 'shiprocket'].includes(req.query.provider)) {
    params.push(req.query.provider);
    where.push(`provider = $${params.length}`);
  }
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`processing_status = $${params.length}`);
  }
  const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [list, count] = await Promise.all([
    query(`SELECT id, provider, event_id, event_type, processing_status, error_message, attempts, received_at, processed_at FROM webhook_events ${W} ORDER BY received_at DESC LIMIT ${pageSize} OFFSET ${offset}`, params),
    query(`SELECT count(*)::int AS n FROM webhook_events ${W}`, params),
  ]);
  res.json({ items: list.rows, total: count.rows[0].n, page, pageSize });
});

site.get('/webhooks/:id', requirePerm('integrations'), async (req, res) => {
  const { rows } = await query(`SELECT * FROM webhook_events WHERE id = $1`, [int(req.params.id)]);
  if (!rows[0]) throw new HttpError(404, 'Event not found.');
  res.json(rows[0]);
});

site.post('/webhooks/:id/retry', requirePerm('integrations'), async (req, res) => {
  const status = await retryWebhookEvent(int(req.params.id));
  await audit(req, 'webhook.retry', 'webhook', req.params.id, null, { status });
  res.json({ ok: true, status });
});
