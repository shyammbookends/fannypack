// The Express app: security headers, API routes, uploads and (when built) the website.
// Started by index.js on a normal server, or used as-is by the Vercel function in ../api/index.js.
import { backendPath } from './env.js';
import path from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import compression from 'compression';
import { pool } from './db.js';
import { catalog } from './catalog.js';
import { auth, loadUser, rateLimit } from './auth.js';
import { account } from './account.js';
import { contact } from './contact.js';
import { cart } from './cart.js';
import { orders, errorHandler } from './orders.js';
import { webhooks } from './webhooks.js';
import { admin } from './admin/index.js';
import { UPLOAD_DIR } from './admin/uploads.js';
import { loadTemplate, robots, sendPage, sitemap } from './seo.js';
import { preferWebp } from './lib/webp.js';

const isProd = process.env.NODE_ENV === 'production';
const app = express();
app.disable('x-powered-by');
// TRUST_PROXY: number of proxies in front ("1", "2"), "true", or IP ranges. Env values are strings and
// Express reads a string as an IP list, so a hop count has to be turned into a number.
const trustProxy = (v) => (!v ? 'loopback' : /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v);
app.set('trust proxy', trustProxy(process.env.TRUST_PROXY?.trim()));
app.use(compression());

// ---------- security headers ----------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://api.razorpay.com")');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups'); // Razorpay opens its own window
  // HTTPS: browsers must never fall back to plain http for this site
  if (isProd || req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Content-Security-Policy on every response (not only when NODE_ENV=production): only our own
  // scripts plus Razorpay's checkout may run. (The dev server on :5173 is Vite, not this file.)
  {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' https://checkout.razorpay.com",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob:",
        "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com blob: data:",
        'frame-src https://api.razorpay.com https://checkout.razorpay.com https://www.youtube.com',
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'self'",
        "form-action 'self'",
        ...(req.secure ? ['upgrade-insecure-requests'] : []),
      ].join('; ')
    );
  }
  next();
});

// ---------- API protection: request flood limit + cross-site request check ----------
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' || req.path.startsWith('/webhooks/')) return next();
  try {
    rateLimit(`api-write|${req.ip}`, 300, 60 * 1000);
  } catch {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  // Browsers send Origin on cross-site requests: a page on another site must never act for a signed-in shopper
  const origin = req.get('origin');
  if (origin) {
    let ok = false;
    try {
      const host = new URL(origin).host;
      const allowed = [req.get('x-forwarded-host'), req.get('host'), process.env.PUBLIC_URL && new URL(process.env.PUBLIC_URL).host].filter(Boolean);
      ok = allowed.includes(host);
    } catch {
      ok = false;
    }
    if (!ok) return res.status(403).json({ error: 'Cross-site request blocked.' });
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
// public catalogue first: it never needs to know who is signed in (saves a session lookup per request)
app.use('/api', catalog);
app.use('/api', loadUser);
app.use('/api', auth);
app.use('/api', account);
app.use('/api', contact);
app.use('/api', cart);
app.use('/api', orders);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

// ---------- uploaded media ----------
// (upload names carry a random suffix, so they can be cached for a long time)
app.use('/uploads', preferWebp(UPLOAD_DIR, 'public, max-age=2592000, immutable'));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true, fallthrough: false }));

// ---------- SEO files ----------
app.get('/robots.txt', robots);
app.get('/sitemap.xml', sitemap);

// ---------- built website (production) ----------
// The built website (frontend/dist). Not needed when the frontend is hosted elsewhere (e.g. Firebase Hosting).
const dist = backendPath(process.env.FRONTEND_DIST, '../frontend/dist');
if (existsSync(path.join(dist, 'index.html'))) {
  loadTemplate(path.join(dist, 'index.html'));
  app.use(preferWebp(dist));
  app.use(express.static(dist, {
    index: false,
    setHeaders: (res, p) => {
      // hashed build files never change; photos change rarely (new photos get new names)
      if (/[\\/]assets[\\/]/.test(p)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else if (/[\\/]img[\\/]/.test(p)) res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      else res.setHeader('Cache-Control', 'public, max-age=3600');
    },
  }));
  // Admin panel: plain app shell, never indexed
  app.get(/^\/admin(\/.*)?$/, (_req, res) => {
    res.set({ 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' }).sendFile(path.join(dist, 'index.html'));
  });
  // Storefront pages: per-page title / description / share tags, 404 for unknown URLs
  app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res, next) => sendPage(req, res).catch(next));
}
app.use(errorHandler);

export default app;
