import { Router } from 'express';
import QRCode from 'qrcode';
import { query } from '../db.js';
import { hashPassword, verifyPassword } from '../auth.js';
import { decrypt, encrypt, randomToken, sha256 } from '../lib/crypto.js';
import { newTotpSecret, otpauthUrl, verifyTotp } from '../lib/totp.js';
import { audit } from '../lib/audit.js';
import { sendMail } from '../lib/mailer.js';

// ======================================================================
// Admin authentication & authorization (server-side, never trusts the UI)
// - separate HttpOnly cookie "fp_admin", only sent to /api/admin
// - sessions in admin_sessions (hashed tokens), 12h or 30d with "remember me"
// - account lockout after 5 wrong passwords, IP rate limit
// - optional TOTP 2FA
// - CSRF: state-changing requests must carry X-FP-Admin: 1 and a same-origin Origin
// ======================================================================

const COOKIE = 'fp_admin';
const SHORT_HOURS = 12;
const REMEMBER_DAYS = 30;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
export const ALL_PERMISSIONS = [
  'dashboard', 'orders', 'products', 'collections', 'inventory', 'customers', 'discounts', 'content',
  'payments', 'shipping', 'analytics', 'reports', 'integrations', 'settings', 'admin_users', 'audit_logs',
];

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const isProd = () => process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setCookie(res, token, maxAgeSec) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${isProd() ? '; Secure' : ''}`
  );
}

// ---------- rate limiting ----------
const hits = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) return void hits.set(key, { count: 1, reset: now + windowMs });
  h.count += 1;
  if (h.count > max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
}
setInterval(() => {
  const now = Date.now();
  for (const [k, h] of hits) if (h.reset < now) hits.delete(k);
}, 10 * 60 * 1000).unref();

// ---------- roles ----------
let roleCache = { at: 0, roles: new Map() };
export async function rolePermissions(role) {
  if (Date.now() - roleCache.at > 30_000) {
    const { rows } = await query(`SELECT key, permissions FROM admin_roles`);
    roleCache = { at: Date.now(), roles: new Map(rows.map((r) => [r.key, r.permissions || []])) };
  }
  const perms = roleCache.roles.get(role) || [];
  return perms.includes('*') ? [...ALL_PERMISSIONS] : perms;
}
export const clearRoleCache = () => (roleCache.at = 0);

// ---------- middleware ----------

// CSRF: browsers cannot add custom headers to cross-site form posts, and fetch() from
// another origin would need CORS (not enabled). The Origin check is a second layer.
export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-fp-admin') !== '1') throw new HttpError(403, 'Missing admin request header.');
  const origin = req.get('origin');
  if (origin) {
    const host = req.get('x-forwarded-host') || req.get('host');
    try {
      if (new URL(origin).host !== host) throw new Error();
    } catch {
      throw new HttpError(403, 'Cross-site request blocked.');
    }
  }
  next();
}

// Loads req.admin from the admin session cookie (does not require it)
export async function loadAdmin(req, _res, next) {
  req.admin = null;
  const token = readCookie(req, COOKIE);
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const { rows } = await query(
      `SELECT s.token_hash, s.mfa_passed, s.last_seen_at, u.id, u.email, u.name, u.admin_role, u.status, u.totp_enabled
       FROM admin_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [sha256(token)]
    );
    const r = rows[0];
    if (r && r.admin_role && r.status === 'active') {
      req.admin = {
        id: r.id, email: r.email, name: r.name, role: r.admin_role, totpEnabled: r.totp_enabled,
        mfaPassed: r.mfa_passed, sessionHash: r.token_hash, permissions: await rolePermissions(r.admin_role),
      };
      if (Date.now() - new Date(r.last_seen_at).getTime() > 60_000) {
        query(`UPDATE admin_sessions SET last_seen_at = now() WHERE token_hash = $1`, [r.token_hash]).catch(() => {});
      }
    }
  }
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.admin) throw new HttpError(401, 'Please sign in to the admin panel.');
  if (!req.admin.mfaPassed) throw new HttpError(401, 'Two-factor verification required.', { mfaRequired: true });
  next();
}

export const requirePerm = (perm) => (req, _res, next) => {
  if (!req.admin?.permissions.includes(perm)) throw new HttpError(403, 'You do not have permission to do this.');
  next();
};

async function startSession(req, res, userId, { remember, mfaPassed }) {
  const token = randomToken();
  const ttlSec = remember ? REMEMBER_DAYS * 86400 : SHORT_HOURS * 3600;
  await query(
    `INSERT INTO admin_sessions (token_hash, user_id, expires_at, ip, user_agent, mfa_passed)
     VALUES ($1, $2, now() + ($3 || ' seconds')::interval, $4, $5, $6)`,
    [sha256(token), userId, String(ttlSec), req.ip, req.get('user-agent')?.slice(0, 300) || null, mfaPassed]
  );
  setCookie(res, token, ttlSec);
}

const me = (a) => ({ id: a.id, email: a.email, name: a.name, role: a.role, permissions: a.permissions, totpEnabled: a.totpEnabled });

// ---------- routes (mounted at /api/admin) ----------
export const adminAuth = Router();

adminAuth.post('/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  rateLimit(`admin-login|${req.ip}`, 20, 15 * 60 * 1000);
  if (!email || !password) throw new HttpError(400, 'Enter your email and password.');

  const { rows } = await query(
    `SELECT id, email, name, password_hash, admin_role, status, failed_logins, locked_until, totp_enabled
     FROM users WHERE lower(email) = $1`,
    [email]
  );
  const u = rows[0];
  if (u?.locked_until && new Date(u.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(u.locked_until) - Date.now()) / 60000);
    throw new HttpError(423, `Too many failed attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.`);
  }
  const ok = u && u.admin_role && u.status === 'active' && (await verifyPassword(password, u.password_hash));
  if (!ok) {
    if (u?.admin_role) {
      const fails = u.failed_logins + 1;
      await query(
        `UPDATE users SET
           failed_logins = CASE WHEN $1::int >= $2::int THEN 0 ELSE $1::int END,
           locked_until  = CASE WHEN $1::int >= $2::int THEN now() + ($3 || ' minutes')::interval ELSE locked_until END
         WHERE id = $4`,
        [fails, MAX_FAILED, String(LOCK_MINUTES), u.id]
      );
      await audit({ ip: req.ip, headers: req.headers, admin: { id: u.id, email: u.email } }, 'admin.login_failed', 'admin', u.id);
      if (fails >= MAX_FAILED) throw new HttpError(423, `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.`);
    }
    throw new HttpError(401, 'Incorrect email or password.');
  }
  await query(`UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`, [u.id]);
  await startSession(req, res, u.id, { remember: req.body?.remember === true, mfaPassed: !u.totp_enabled });
  await audit({ ip: req.ip, headers: req.headers, admin: { id: u.id, email: u.email } }, 'admin.login', 'admin', u.id);
  res.json({ mfaRequired: Boolean(u.totp_enabled) });
});

// Second step when 2FA is on
adminAuth.post('/auth/mfa', async (req, res) => {
  if (!req.admin) throw new HttpError(401, 'Please sign in again.');
  rateLimit(`admin-mfa|${req.admin.id}`, 10, 15 * 60 * 1000);
  const { rows } = await query(`SELECT totp_secret_enc, totp_last_step FROM users WHERE id = $1`, [req.admin.id]);
  const secret = decrypt(rows[0]?.totp_secret_enc)?.secret;
  const step = verifyTotp(secret, req.body?.code, rows[0]?.totp_last_step);
  if (!step) throw new HttpError(401, 'That code is not correct (each code can be used once).');
  await query(`UPDATE users SET totp_last_step = $1 WHERE id = $2`, [step, req.admin.id]);
  await query(`UPDATE admin_sessions SET mfa_passed = true WHERE token_hash = $1`, [req.admin.sessionHash]);
  res.json({ ok: true });
});

adminAuth.post('/auth/logout', async (req, res) => {
  if (req.admin) {
    await query(`DELETE FROM admin_sessions WHERE token_hash = $1`, [req.admin.sessionHash]);
    await audit(req, 'admin.logout', 'admin', req.admin.id);
  }
  setCookie(res, '', 0);
  res.json({ ok: true });
});

adminAuth.get('/auth/me', (req, res) => {
  if (!req.admin) return res.json({ admin: null });
  if (!req.admin.mfaPassed) return res.json({ admin: null, mfaRequired: true });
  res.json({ admin: me(req.admin) });
});

// Forgot password: always answers the same (does not reveal which emails are admins)
adminAuth.post('/auth/forgot', async (req, res) => {
  rateLimit(`admin-forgot|${req.ip}`, 5, 60 * 60 * 1000);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const { rows } = await query(`SELECT id, email, name FROM users WHERE lower(email) = $1 AND admin_role IS NOT NULL AND status = 'active'`, [email]);
  if (rows[0]) {
    const token = randomToken();
    await query(`INSERT INTO admin_password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')`, [sha256(token), rows[0].id]);
    const link = `${(process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')}/admin/reset?token=${token}`;
    await sendMail({
      to: rows[0].email,
      subject: 'Reset your FANNYPACK admin password',
      text: `Hi ${rows[0].name},\n\nUse this link within 1 hour to set a new admin password:\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
    });
  }
  res.json({ ok: true });
});

adminAuth.post('/auth/reset', async (req, res) => {
  rateLimit(`admin-reset|${req.ip}`, 10, 60 * 60 * 1000);
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  if (password.length < 10) throw new HttpError(400, 'Use at least 10 characters for an admin password.');
  const { rows } = await query(
    `SELECT user_id FROM admin_password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [sha256(token)]
  );
  if (!rows[0]) throw new HttpError(400, 'This reset link is invalid or has expired.');
  await query(`UPDATE users SET password_hash = $1, failed_logins = 0, locked_until = NULL WHERE id = $2`, [await hashPassword(password), rows[0].user_id]);
  await query(`UPDATE admin_password_resets SET used_at = now() WHERE token_hash = $1`, [sha256(token)]);
  await query(`DELETE FROM admin_sessions WHERE user_id = $1`, [rows[0].user_id]);
  await audit({ ip: req.ip, headers: req.headers, admin: { id: rows[0].user_id } }, 'admin.password_reset', 'admin', rows[0].user_id);
  res.json({ ok: true });
});

// ---------- signed-in admin: own password + 2FA ----------
export const adminAccount = Router();

adminAccount.post('/account/password', async (req, res) => {
  const { current, next } = req.body || {};
  if (String(next || '').length < 10) throw new HttpError(400, 'Use at least 10 characters for an admin password.');
  const { rows } = await query(`SELECT password_hash FROM users WHERE id = $1`, [req.admin.id]);
  if (!(await verifyPassword(String(current || ''), rows[0].password_hash))) throw new HttpError(400, 'Current password is not correct.');
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [await hashPassword(String(next)), req.admin.id]);
  // sign out every other admin session of this user
  await query(`DELETE FROM admin_sessions WHERE user_id = $1 AND token_hash <> $2`, [req.admin.id, req.admin.sessionHash]);
  await audit(req, 'admin.password_changed', 'admin', req.admin.id);
  res.json({ ok: true });
});

adminAccount.post('/account/2fa/setup', async (req, res) => {
  const secret = newTotpSecret();
  await query(`UPDATE users SET totp_secret_enc = $1 WHERE id = $2 AND NOT totp_enabled`, [encrypt({ secret }), req.admin.id]);
  const url = otpauthUrl(secret, req.admin.email);
  res.json({ secret, otpauth: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) });
});

adminAccount.post('/account/2fa/enable', async (req, res) => {
  const { rows } = await query(`SELECT totp_secret_enc FROM users WHERE id = $1`, [req.admin.id]);
  const secret = decrypt(rows[0]?.totp_secret_enc)?.secret;
  if (!verifyTotp(secret, req.body?.code)) throw new HttpError(400, 'That code is not correct. Check the time on your phone and try again.');
  await query(`UPDATE users SET totp_enabled = true WHERE id = $1`, [req.admin.id]);
  await audit(req, 'admin.2fa_enabled', 'admin', req.admin.id);
  res.json({ ok: true });
});

adminAccount.post('/account/2fa/disable', async (req, res) => {
  const { rows } = await query(`SELECT password_hash, totp_secret_enc FROM users WHERE id = $1`, [req.admin.id]);
  if (!(await verifyPassword(String(req.body?.password || ''), rows[0].password_hash))) throw new HttpError(400, 'Password is not correct.');
  if (!verifyTotp(decrypt(rows[0].totp_secret_enc)?.secret, req.body?.code)) throw new HttpError(400, 'That code is not correct.');
  await query(`UPDATE users SET totp_enabled = false, totp_secret_enc = NULL WHERE id = $1`, [req.admin.id]);
  await audit(req, 'admin.2fa_disabled', 'admin', req.admin.id);
  res.json({ ok: true });
});

adminAccount.get('/account/sessions', async (req, res) => {
  const { rows } = await query(
    `SELECT token_hash = $2 AS current, created_at, last_seen_at, expires_at, ip, user_agent
     FROM admin_sessions WHERE user_id = $1 AND expires_at > now() ORDER BY last_seen_at DESC`,
    [req.admin.id, req.admin.sessionHash]
  );
  res.json(rows);
});

adminAccount.post('/account/sessions/revoke-others', async (req, res) => {
  await query(`DELETE FROM admin_sessions WHERE user_id = $1 AND token_hash <> $2`, [req.admin.id, req.admin.sessionHash]);
  await audit(req, 'admin.sessions_revoked', 'admin', req.admin.id);
  res.json({ ok: true });
});

export async function deleteExpiredAdminSessions() {
  await query(`DELETE FROM admin_sessions WHERE expires_at < now()`);
  await query(`DELETE FROM admin_password_resets WHERE expires_at < now() - interval '1 day'`);
}
