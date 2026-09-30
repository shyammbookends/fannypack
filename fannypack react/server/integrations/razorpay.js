import crypto from 'node:crypto';
import { getIntegration } from './store.js';

const API = 'https://api.razorpay.com/v1';

// Credentials: the admin panel (encrypted in the DB) wins; .env is the fallback.
export async function razorpayCreds() {
  const i = await getIntegration('razorpay');
  if (i.config.key_id && i.secrets.key_secret) {
    return {
      source: 'admin',
      enabled: i.config.enabled !== false,
      keyId: i.config.key_id,
      keySecret: i.secrets.key_secret,
      webhookSecret: i.secrets.webhook_secret || process.env.RAZORPAY_WEBHOOK_SECRET || '',
    };
  }
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    return {
      source: 'env',
      enabled: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      keySecret: process.env.RAZORPAY_KEY_SECRET,
      webhookSecret: i.secrets.webhook_secret || process.env.RAZORPAY_WEBHOOK_SECRET || '',
    };
  }
  return null;
}

export async function razorpayEnabled() {
  const c = await razorpayCreds();
  return Boolean(c && c.enabled);
}

export const razorpayEnvironment = (keyId) => (String(keyId).startsWith('rzp_live_') ? 'live' : 'test');

async function call(creds, method, path, body) {
  const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw Object.assign(new Error(`Could not reach Razorpay (${err.name === 'TimeoutError' ? 'timeout' : err.message})`), { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.description || `Razorpay error ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status === 401 ? 400 : 502, provider: 'razorpay', httpStatus: res.status });
  }
  return data;
}

async function requireCreds() {
  const c = await razorpayCreds();
  if (!c || !c.enabled) throw Object.assign(new Error('Razorpay is not connected.'), { status: 400 });
  return c;
}

// Real API call used by "Test connection": lists at most one order
export async function testRazorpay(keyId, keySecret) {
  await call({ keyId, keySecret }, 'GET', '/orders?count=1');
  return { ok: true, environment: razorpayEnvironment(keyId) };
}

export async function createRazorpayOrder({ amountPaise, receipt, notes }) {
  const c = await requireCreds();
  const order = await call(c, 'POST', '/orders', { amount: amountPaise, currency: 'INR', receipt, notes });
  return { ...order, keyId: c.keyId };
}

export async function fetchRazorpayPayment(paymentId) {
  return call(await requireCreds(), 'GET', `/payments/${encodeURIComponent(paymentId)}`);
}

export async function createRazorpayRefund(paymentId, amountPaise, notes) {
  return call(await requireCreds(), 'POST', `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, notes });
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Checkout signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)
export async function verifyPaymentSignature(orderId, paymentId, signature) {
  const c = await razorpayCreds();
  if (!c || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', c.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

// Webhook signature = HMAC_SHA256(raw body, webhook secret)
export function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  if (!webhookSecret || !signature) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}
