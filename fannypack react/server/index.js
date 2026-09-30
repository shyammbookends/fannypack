import 'dotenv/config';
import path from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import compression from 'compression';
import { pool } from './db.js';
import { catalog } from './catalog.js';
import { auth, loadUser, deleteExpiredSessions } from './auth.js';
import { account } from './account.js';
import { cart } from './cart.js';
import { orders, errorHandler, releaseExpiredOrders } from './orders.js';
import { webhooks } from './webhooks.js';
import { admin } from './admin/index.js';
import { deleteExpiredAdminSessions } from './admin/auth.js';
import { UPLOAD_DIR } from './admin/uploads.js';
import { razorpayCreds } from './integrations/razorpay.js';
import { shiprocketConnected } from './integrations/shiprocket.js';
import { syncActiveShipments } from './lib/fulfilment.js';
import { mailEnabled } from './lib/mailer.js';
import { loadTemplate, robots, sendPage, sitemap } from './seo.js';

const isProd = process.env.NODE_ENV === 'production';
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
app.use(compression());

// ---------- security headers ----------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://api.razorpay.com")');
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' https://checkout.razorpay.com https://ajax.googleapis.com https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob:",
        "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com blob: data:",
        'frame-src https://api.razorpay.com https://checkout.razorpay.com https://www.youtube.com',
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'self'",
      ].join('; ')
    );
  }
  next();
});

// ---------- request log (production: API calls that fail or are slow) ----------
app.use('/api', (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (!isProd || res.statusCode >= 500 || ms > 3000) {
      if (isProd || req.method !== 'GET') console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${ms}ms`);
    }
  });
  next();
});

// ---------- health check (no session lookup) ----------
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// ---------- webhooks first (they need the raw body) ----------
app.use('/api', webhooks);

app.use(express.json({ limit: '300kb' }));

// ---------- admin (own auth, own cookie) ----------
app.use('/api/admin', admin);

// ---------- storefront API ----------
app.use('/api', loadUser);
app.use('/api', catalog);
app.use('/api', auth);
app.use('/api', account);
app.use('/api', cart);
app.use('/api', orders);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

// ---------- uploaded media ----------
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true, fallthrough: false }));

// ---------- SEO files ----------
app.get('/robots.txt', robots);
app.get('/sitemap.xml', sitemap);

// ---------- built website (production) ----------
const dist = path.resolve('dist');
if (existsSync(path.join(dist, 'index.html'))) {
  loadTemplate(path.join(dist, 'index.html'));
  app.use(express.static(dist, { maxAge: '1h', index: false, setHeaders: (res, p) => /[\\/]assets[\\/]/.test(p) && res.setHeader('Cache-Control', 'public, max-age=31536000, immutable') }));
  // Admin panel: plain app shell, never indexed
  app.get(/^\/admin(\/.*)?$/, (_req, res) => {
    res.set({ 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' }).sendFile(path.join(dist, 'index.html'));
  });
  // Storefront pages: per-page title / description / share tags, 404 for unknown URLs
  app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res, next) => sendPage(req, res).catch(next));
}
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5000;
const server = app.listen(PORT, async () => {
  try {
    await pool.query('SELECT 1');
    console.log(`API ready on http://localhost:${PORT}  (database connected)`);
  } catch (err) {
    console.error(`API on port ${PORT}, but the database is not reachable: ${err.message}`);
  }
  try {
    const rp = await razorpayCreds();
    console.log(rp ? `Razorpay: ${rp.enabled ? 'enabled' : 'disabled'} (${rp.source})` : 'Razorpay: not connected (only Cash on Delivery will be offered)');
    console.log(`Shiprocket: ${(await shiprocketConnected()) ? 'connected' : 'not connected'}`);
    console.log(`Email: ${mailEnabled() ? `SMTP ready (${process.env.SMTP_USER || process.env.SMTP_HOST})` : 'NOT SET UP - add SMTP_* in .env (order emails and password reset links are printed here instead)'}`);
    if (!isProd) console.log('Mode: development (set NODE_ENV=production on the live server for secure cookies and security headers)');
  } catch (err) {
    console.error('Integration check failed:', err.message);
  }
});

// ---------- background jobs ----------
const timers = [];
const every = (ms, name, fn) =>
  timers.push(setInterval(() => fn().catch((err) => console.error(`${name} failed:`, err.message)), ms));

// release stock from unpaid online orders older than 30 minutes
every(5 * 60 * 1000, 'Release job', async () => {
  const n = await releaseExpiredOrders();
  if (n) console.log(`Released stock from ${n} unpaid order(s).`);
});
// refresh shipment tracking from Shiprocket (first run shortly after start)
const syncTracking = async () => {
  const n = await syncActiveShipments();
  if (n) console.log(`Synced tracking for ${n} shipment(s).`);
};
setTimeout(() => syncTracking().catch((err) => console.error('Tracking sync failed:', err.message)), 60 * 1000).unref();
every(30 * 60 * 1000, 'Tracking sync', syncTracking);
// clear expired sign-in sessions and reset links
const cleanSessions = async () => {
  await deleteExpiredSessions();
  await deleteExpiredAdminSessions();
};
cleanSessions().catch(() => {});
every(24 * 60 * 60 * 1000, 'Session cleanup', cleanSessions);

// ---------- crash safety + graceful shutdown ----------
process.on('unhandledRejection', (err) => console.error('Unhandled promise rejection:', err));

let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received: finishing open requests…`);
  timers.forEach(clearInterval);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  // don't hang forever on keep-alive connections
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
