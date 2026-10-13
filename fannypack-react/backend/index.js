// Starts the API on a normal server (your PC, a VPS, Render, Cloud Run) and runs the background jobs.
import './env.js';
import { pool } from './db.js';
import app from './app.js';
import { deleteExpiredSessions } from './auth.js';
import { releaseExpiredOrders } from './orders.js';
import { deleteExpiredAdminSessions } from './admin/auth.js';
import { razorpayCreds } from './integrations/razorpay.js';
import { shiprocketConnected } from './integrations/shiprocket.js';
import { syncActiveShipments } from './lib/fulfilment.js';
import { mailEnabled } from './lib/mailer.js';

const isProd = process.env.NODE_ENV === 'production';

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
    const live = process.env.PUBLIC_URL && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(process.env.PUBLIC_URL);
    if (!isProd && live) {
      console.warn('\n*** SECURITY WARNING: PUBLIC_URL is a live address but NODE_ENV is not "production". ***');
      console.warn('*** Add NODE_ENV=production to .env on the live server (secure cookies, HTTPS headers). ***\n');
    } else if (!isProd) {
      console.log('Mode: development (set NODE_ENV=production on the live server)');
    }
    if (isProd && !process.env.PUBLIC_URL) console.error('*** PUBLIC_URL is not set: password-reset and order emails cannot build links. Set it in .env. ***');
    if (isProd && !/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY || '')) console.error('*** ENCRYPTION_KEY is missing or invalid: integration secrets and backups cannot be encrypted. ***');
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
