import { Router } from 'express';
import { query } from '../db.js';
import { ALL_PERMISSIONS, clearRoleCache, requirePerm } from './auth.js';
import { hashPassword } from '../auth.js';
import { audit } from '../lib/audit.js';
import { randomToken } from '../lib/crypto.js';
import { HttpError, int, paging, str } from './util.js';

export const adminUsers = Router();

adminUsers.get('/admin-users', requirePerm('admin_users'), async (_req, res) => {
  const [users, roles] = await Promise.all([
    query(
      `SELECT u.id, u.name, u.email, u.admin_role AS role, u.status, u.totp_enabled, u.last_login_at, u.created_at, u.locked_until,
              (SELECT max(last_seen_at) FROM admin_sessions s WHERE s.user_id = u.id) AS last_seen
       FROM users u WHERE u.admin_role IS NOT NULL ORDER BY u.created_at`
    ),
    query(`SELECT key, name, permissions, is_system FROM admin_roles ORDER BY is_system DESC, name`),
  ]);
  res.json({ users: users.rows, roles: roles.rows, permissions: ALL_PERMISSIONS });
});

async function validRole(role) {
  return (await query(`SELECT 1 FROM admin_roles WHERE key = $1`, [role])).rows.length > 0;
}

// Only a Super Admin may create or change Super Admins
function guardSuper(req, role) {
  if (role === 'super_admin' && req.admin.role !== 'super_admin') throw new HttpError(403, 'Only a Super Admin can do that.');
}

// Create an admin. Existing customer accounts (same email) are promoted.
adminUsers.post('/admin-users', requirePerm('admin_users'), async (req, res) => {
  const email = str(req.body?.email, 120)?.toLowerCase();
  const name = str(req.body?.name, 80);
  const role = String(req.body?.role || '');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'Enter a valid email.', { email: 'Invalid email.' });
  if (!name) throw new HttpError(400, 'Enter a name.', { name: 'Required.' });
  if (!(await validRole(role))) throw new HttpError(400, 'Choose a role.', { role: 'Required.' });
  guardSuper(req, role);
  const tempPassword = `${randomToken(6)}-${randomToken(3)}`;
  const { rows } = await query(`SELECT id, admin_role FROM users WHERE lower(email) = $1`, [email]);
  let id;
  if (rows[0]) {
    if (rows[0].admin_role) throw new HttpError(409, 'This person is already an admin.');
    id = rows[0].id;
    await query(`UPDATE users SET admin_role = $1, is_admin = true, status = 'active' WHERE id = $2`, [role, id]);
  } else {
    const r = await query(
      `INSERT INTO users (email, name, password_hash, admin_role, is_admin) VALUES ($1,$2,$3,$4,true) RETURNING id`,
      [email, name, await hashPassword(tempPassword), role]
    );
    id = r.rows[0].id;
  }
  await audit(req, 'admin_user.create', 'admin_user', id, null, { email, role });
  // The temporary password is shown once to the creating admin (existing accounts keep their password)
  res.status(201).json({ id, tempPassword: rows[0] ? null : tempPassword });
});

adminUsers.put('/admin-users/:id', requirePerm('admin_users'), async (req, res) => {
  const id = int(req.params.id);
  const { rows } = await query(`SELECT id, email, admin_role, status FROM users WHERE id = $1 AND admin_role IS NOT NULL`, [id]);
  const u = rows[0];
  if (!u) throw new HttpError(404, 'Admin not found.');
  const role = req.body?.role ?? u.admin_role;
  const status = ['active', 'blocked'].includes(req.body?.status) ? req.body.status : u.status;
  if (!(await validRole(role))) throw new HttpError(400, 'Unknown role.');
  guardSuper(req, role);
  guardSuper(req, u.admin_role);
  if (id === req.admin.id && (role !== u.admin_role || status !== 'active')) throw new HttpError(400, 'You cannot change your own role or disable yourself.');
  if (u.admin_role === 'super_admin' && (role !== 'super_admin' || status !== 'active')) {
    const { rows: s } = await query(`SELECT count(*)::int AS n FROM users WHERE admin_role = 'super_admin' AND status = 'active'`);
    if (s[0].n <= 1) throw new HttpError(400, 'There must always be at least one active Super Admin.');
  }
  await query(`UPDATE users SET admin_role = $1, status = $2 WHERE id = $3`, [role, status, id]);
  if (status !== 'active' || role !== u.admin_role) await query(`DELETE FROM admin_sessions WHERE user_id = $1`, [id]);
  await audit(req, 'admin_user.update', 'admin_user', id, { role: u.admin_role, status: u.status }, { role, status });
  res.json({ ok: true });
});

// Remove admin access (the underlying account stays, as a customer)
adminUsers.delete('/admin-users/:id', requirePerm('admin_users'), async (req, res) => {
  const id = int(req.params.id);
  if (id === req.admin.id) throw new HttpError(400, 'You cannot remove your own admin access.');
  const { rows } = await query(`SELECT admin_role FROM users WHERE id = $1 AND admin_role IS NOT NULL`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Admin not found.');
  guardSuper(req, rows[0].admin_role);
  if (rows[0].admin_role === 'super_admin') {
    const { rows: s } = await query(`SELECT count(*)::int AS n FROM users WHERE admin_role = 'super_admin' AND status = 'active'`);
    if (s[0].n <= 1) throw new HttpError(400, 'There must always be at least one active Super Admin.');
  }
  await query(`UPDATE users SET admin_role = NULL, is_admin = false, totp_enabled = false, totp_secret_enc = NULL WHERE id = $1`, [id]);
  await query(`DELETE FROM admin_sessions WHERE user_id = $1`, [id]);
  await audit(req, 'admin_user.remove', 'admin_user', id, { role: rows[0].admin_role }, null);
  res.json({ ok: true });
});

// Super Admin can set a new temporary password for another admin (e.g. no email set up)
adminUsers.post('/admin-users/:id/reset-password', requirePerm('admin_users'), async (req, res) => {
  if (req.admin.role !== 'super_admin') throw new HttpError(403, 'Only a Super Admin can reset passwords.');
  const id = int(req.params.id);
  const { rows } = await query(`SELECT id FROM users WHERE id = $1 AND admin_role IS NOT NULL`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Admin not found.');
  const tempPassword = `${randomToken(6)}-${randomToken(3)}`;
  await query(`UPDATE users SET password_hash = $1, failed_logins = 0, locked_until = NULL WHERE id = $2`, [await hashPassword(tempPassword), id]);
  await query(`DELETE FROM admin_sessions WHERE user_id = $1`, [id]);
  await audit(req, 'admin_user.reset_password', 'admin_user', id);
  res.json({ tempPassword });
});

// Roles & permissions (Super Admin role is fixed)
adminUsers.put('/admin-roles/:key', requirePerm('admin_users'), async (req, res) => {
  if (req.admin.role !== 'super_admin') throw new HttpError(403, 'Only a Super Admin can change role permissions.');
  const { rows } = await query(`SELECT * FROM admin_roles WHERE key = $1`, [req.params.key]);
  if (!rows[0]) throw new HttpError(404, 'Role not found.');
  if (rows[0].is_system) throw new HttpError(400, 'The Super Admin role always has every permission.');
  const perms = (Array.isArray(req.body?.permissions) ? req.body.permissions : []).filter((p) => ALL_PERMISSIONS.includes(p));
  const name = str(req.body?.name, 60) || rows[0].name;
  await query(`UPDATE admin_roles SET permissions = $1, name = $2, updated_at = now() WHERE key = $3`, [JSON.stringify(perms), name, req.params.key]);
  clearRoleCache();
  await audit(req, 'admin_role.update', 'admin_role', req.params.key, { permissions: rows[0].permissions }, { permissions: perms });
  res.json({ ok: true });
});

// ================= Audit logs =================
adminUsers.get('/audit-logs', requirePerm('audit_logs'), async (req, res) => {
  const { page, pageSize, offset } = paging(req, { def: 50 });
  const where = [];
  const params = [];
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    where.push(`(action ILIKE $${params.length} OR admin_email ILIKE $${params.length} OR entity_id ILIKE $${params.length})`);
  }
  if (req.query.entity) {
    params.push(req.query.entity);
    where.push(`entity = $${params.length}`);
  }
  const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [list, count] = await Promise.all([
    query(`SELECT * FROM audit_logs ${W} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`, params),
    query(`SELECT count(*)::int AS n FROM audit_logs ${W}`, params),
  ]);
  res.json({ items: list.rows, total: count.rows[0].n, page, pageSize });
});
