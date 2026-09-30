import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { Router } from 'express';
import { query, tx } from './db.js';
import { checkEmail, checkPhone } from './lib/contactCheck.js';
import { sendPasswordResetEmail } from './lib/customerMail.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'fp_session';
const SESSION_DAYS = 30;
export const MIN_PASSWORD = 8;
const ADMIN_MIN_PASSWORD = 10;
const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    if (fields) this.fields = fields;
  }
}

// ---------- passwords: "scrypt$<salt hex>$<hash hex>" (same format already used in this DB) ----------

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [algo, saltHex, hashHex] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// Store admins share the users table, so their accounts need the stronger admin rule
function passwordProblem(password, { admin = false } = {}) {
  const min = admin ? ADMIN_MIN_PASSWORD : MIN_PASSWORD;
  if (password.length < min) return `Passwords must be at least ${min} characters.`;
  if (password.length > 128) return 'Password is too long.';
  if (/^(.)\1+$/.test(password) || /^(?:12345678|password|qwertyui)/i.test(password)) return 'Please choose a less common password.';
  return null;
}

// ---------- sessions (table "sessions": token_hash, user_id, expires_at) ----------

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setSessionCookie(res, token, maxAgeSec) {
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`
  );
}

async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [sha256(token), userId, String(SESSION_DAYS)]
  );
  setSessionCookie(res, token, SESSION_DAYS * 86400);
  return sha256(token);
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone || null });

// Attach req.user when a valid session cookie is present
export async function loadUser(req, _res, next) {
  const token = readCookie(req, COOKIE);
  req.user = null;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.admin_role, s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'`,
      [sha256(token)]
    );
    req.user = rows[0] || null;
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'Please sign in to continue.');
  next();
}

// ---------- simple in-memory rate limit (one server process) ----------

const hits = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  h.count += 1;
  if (h.count > max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
}
setInterval(() => {
  const now = Date.now();
  for (const [k, h] of hits) if (h.reset < now) hits.delete(k);
}, 10 * 60 * 1000).unref();

// ---------- validation ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cleanPhone = (v) => String(v ?? '').replace(/\D/g, '').slice(-10);

// "Email or mobile number" box -> which column to look up
function parseIdentifier(raw) {
  const v = String(raw ?? '').trim();
  if (v.includes('@')) {
    const email = v.toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email or mobile number.');
    return { column: 'email', value: email };
  }
  const phone = cleanPhone(v);
  if (!/^[6-9]\d{9}$/.test(phone)) throw new HttpError(400, 'Enter a valid email or mobile number.');
  return { column: 'phone', value: phone };
}

function cleanName(v) {
  const name = String(v ?? '').trim().replace(/\s+/g, ' ');
  return name.length >= 2 && name.length <= 60 ? name : null;
}

// ---------- routes ----------

export const auth = Router();

auth.get('/auth/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

// ---------- create account: signs in straight away ----------
auth.post('/auth/signup', async (req, res) => {
  rateLimit(`signup|${req.ip}`, 10, 60 * 60 * 1000);
  const b = req.body || {};
  const fields = {};
  const name = cleanName(b.name);
  if (!name) fields.name = 'Enter your name.';
  const ph = checkPhone(b.phone);
  if (!ph.ok) fields.phone = ph.error;
  const em = await checkEmail(b.email);
  if (!em.ok) fields.email = em.error;
  const password = String(b.password ?? '');
  const pwErr = passwordProblem(password);
  if (pwErr) fields.password = pwErr;
  if (Object.keys(fields).length) throw new HttpError(400, 'Please check your details.', fields);

  const user = await tx(async (db) => {
    const taken = await db.query(`SELECT email, phone FROM users WHERE lower(email) = $1 OR phone = $2`, [em.email, ph.phone]);
    if (taken.rows.some((r) => r.email.toLowerCase() === em.email)) {
      throw new HttpError(409, 'An account already exists with this email. Please sign in.', { email: 'Already registered.' });
    }
    if (taken.rows.some((r) => r.phone === ph.phone)) {
      throw new HttpError(409, 'An account already exists with this mobile number. Please sign in.', { phone: 'Already registered.' });
    }
    const { rows } = await db.query(
      `INSERT INTO users (email, name, password_hash, phone) VALUES ($1,$2,$3,$4) RETURNING id, name, email, phone`,
      [em.email, name, await hashPassword(password), ph.phone]
    );
    return rows[0];
  });
  await startSession(res, user.id);
  res.status(201).json({ user: publicUser(user) });
});

auth.post('/auth/login', async (req, res) => {
  const { column, value } = parseIdentifier(req.body?.identifier);
  rateLimit(`login|${req.ip}`, 30, 15 * 60 * 1000);
  rateLimit(`login-id|${value}`, 12, 15 * 60 * 1000);
  const password = String(req.body?.password ?? '');
  const { rows } = await query(
    `SELECT id, name, email, phone, password_hash, status, failed_logins, locked_until
     FROM users WHERE ${column === 'email' ? 'lower(email)' : 'phone'} = $1`,
    [value]
  );
  const user = rows[0];
  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    throw new HttpError(429, `Too many wrong passwords. Please try again in ${LOCK_MINUTES} minutes or reset your password.`);
  }
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    if (user) {
      await query(
        `UPDATE users SET failed_logins = COALESCE(failed_logins, 0) + 1,
                locked_until = CASE WHEN COALESCE(failed_logins, 0) + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END
         WHERE id = $1`,
        [user.id, MAX_FAILED_LOGINS, String(LOCK_MINUTES)]
      );
    }
    throw new HttpError(401, 'Your email/mobile number or password is incorrect.');
  }
  if (user.status !== 'active') throw new HttpError(403, 'This account has been disabled. Please contact the store.');
  await query(`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1`, [user.id]);
  await startSession(res, user.id);
  res.json({ user: publicUser(user) });
});

auth.post('/auth/logout', async (req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) await query(`DELETE FROM sessions WHERE token_hash = $1`, [sha256(token)]);
  setSessionCookie(res, '', 0);
  res.json({ ok: true });
});

// ---------- forgot password: a one-hour link is emailed ----------
// Always answers the same, so it never reveals which emails have an account.
auth.post('/auth/forgot', async (req, res) => {
  rateLimit(`forgot|${req.ip}`, 5, 60 * 60 * 1000);
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.', { email: 'Enter a valid email address.' });
  rateLimit(`forgot-id|${email}`, 3, 60 * 60 * 1000);
  const { rows } = await query(`SELECT id, name, email FROM users WHERE lower(email) = $1 AND status = 'active'`, [email]);
  if (rows[0]) {
    const token = crypto.randomBytes(32).toString('hex');
    await query(`DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL`, [rows[0].id]);
    await query(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')`, [sha256(token), rows[0].id]);
    const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    sendPasswordResetEmail(rows[0], `${base}/reset-password?token=${token}`).catch((err) => console.error('Reset email failed:', err.message));
  }
  res.json({ ok: true });
});

auth.post('/auth/reset', async (req, res) => {
  rateLimit(`reset|${req.ip}`, 10, 60 * 60 * 1000);
  const token = String(req.body?.token ?? '');
  const password = String(req.body?.password ?? '');
  if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(400, 'This reset link is not valid. Please ask for a new one.');
  const user = await tx(async (db) => {
    const { rows } = await db.query(
      `SELECT r.user_id, u.admin_role FROM password_resets r JOIN users u ON u.id = r.user_id
       WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now() FOR UPDATE OF r`,
      [sha256(token)]
    );
    if (!rows[0]) throw new HttpError(400, 'This reset link has expired or was already used. Please ask for a new one.');
    const pwErr = passwordProblem(password, { admin: Boolean(rows[0].admin_role) });
    if (pwErr) throw new HttpError(400, pwErr, { password: pwErr });
    await db.query(`UPDATE password_resets SET used_at = now() WHERE token_hash = $1`, [sha256(token)]);
    const { rows: u } = await db.query(
      `UPDATE users SET password_hash = $1, failed_logins = 0, locked_until = NULL WHERE id = $2 RETURNING id, name, email, phone`,
      [await hashPassword(password), rows[0].user_id]
    );
    // Sign out everywhere: someone else may know the old password
    await db.query(`DELETE FROM sessions WHERE user_id = $1`, [rows[0].user_id]);
    return u[0];
  });
  await startSession(res, user.id);
  res.json({ user: publicUser(user) });
});

// ---------- your account: profile + password ----------
auth.put('/account/profile', requireAuth, async (req, res) => {
  const fields = {};
  const name = cleanName(req.body?.name);
  if (!name) fields.name = 'Enter your name.';
  const ph = checkPhone(req.body?.phone);
  if (!ph.ok) fields.phone = ph.error;
  if (Object.keys(fields).length) throw new HttpError(400, 'Please check your details.', fields);
  const taken = await query(`SELECT 1 FROM users WHERE phone = $1 AND id <> $2`, [ph.phone, req.user.id]);
  if (taken.rows.length) throw new HttpError(409, 'Another account already uses this mobile number.', { phone: 'Already registered.' });
  const { rows } = await query(`UPDATE users SET name = $1, phone = $2 WHERE id = $3 RETURNING id, name, email, phone`, [name, ph.phone, req.user.id]);
  res.json({ user: publicUser(rows[0]) });
});

auth.post('/account/password', requireAuth, async (req, res) => {
  rateLimit(`change-pw|${req.user.id}`, 10, 60 * 60 * 1000);
  const current = String(req.body?.current ?? '');
  const password = String(req.body?.password ?? '');
  const { rows } = await query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]);
  if (!(await verifyPassword(current, rows[0]?.password_hash))) {
    throw new HttpError(400, 'Your current password is not correct.', { current: 'Not correct.' });
  }
  const pwErr = passwordProblem(password, { admin: Boolean(req.user.admin_role) });
  if (pwErr) throw new HttpError(400, pwErr, { password: pwErr });
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [await hashPassword(password), req.user.id]);
  // keep this device signed in, sign out every other one
  await query(`DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2`, [req.user.id, req.user.token_hash]);
  res.json({ ok: true });
});

export async function deleteExpiredSessions() {
  const { rowCount } = await query(`DELETE FROM sessions WHERE expires_at < now()`);
  await query(`DELETE FROM password_resets WHERE expires_at < now() - interval '1 day'`);
  return rowCount;
}
