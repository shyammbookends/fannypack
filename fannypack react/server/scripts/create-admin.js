// Create an admin, or promote / reset an existing account.
//
//   npm run admin:create -- owner@example.com "Owner Name"               -> Super Admin, new temp password
//   npm run admin:create -- ops@example.com "Ops" order_manager          -> other role
//   npm run admin:create -- owner@example.com --reset                    -> new temp password for an existing admin
//
// The temporary password is printed once; sign in at /admin and change it under Account.
import 'dotenv/config';
import crypto from 'node:crypto';
import { pool } from '../db.js';
import { hashPassword } from '../auth.js';

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const [email, name, role = 'super_admin'] = args.filter((a) => a !== '--reset');

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.log('Usage: npm run admin:create -- <email> "<name>" [role] [--reset]');
  console.log('Roles: super_admin, admin, manager, content_manager, order_manager');
  process.exit(1);
}

const temp = `${crypto.randomBytes(6).toString('hex')}-${crypto.randomBytes(3).toString('hex')}`;
try {
  const { rows: roles } = await pool.query(`SELECT key FROM admin_roles`);
  if (!roles.some((r) => r.key === role)) throw new Error(`Unknown role "${role}". Run "npm run db:migrate" first?`);
  const { rows } = await pool.query(`SELECT id, admin_role FROM users WHERE lower(email) = lower($1)`, [email]);
  if (rows[0]) {
    if (reset || !rows[0].admin_role) {
      await pool.query(
        `UPDATE users SET admin_role = COALESCE(admin_role, $1), is_admin = true, status = 'active',
                password_hash = CASE WHEN $3 THEN $2 ELSE password_hash END, failed_logins = 0, locked_until = NULL
         WHERE id = $4`,
        [role, await hashPassword(temp), reset, rows[0].id]
      );
    }
    if (reset) await pool.query(`DELETE FROM admin_sessions WHERE user_id = $1`, [rows[0].id]);
    console.log(`${email} is an admin (${rows[0].admin_role || role}).`);
    console.log(reset ? `Temporary password: ${temp}` : 'Password unchanged (add --reset to set a new temporary password).');
  } else {
    if (!name) throw new Error('Give a name for the new admin.');
    await pool.query(
      `INSERT INTO users (email, name, password_hash, admin_role, is_admin) VALUES ($1, $2, $3, $4, true)`,
      [email.toLowerCase(), name, await hashPassword(temp), role]
    );
    console.log(`Created admin ${email} (${role}).`);
    console.log(`Temporary password: ${temp}`);
  }
  console.log('Sign in at /admin and change the password under Account.');
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
