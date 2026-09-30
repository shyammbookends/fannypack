// Applies server/migrations/*.sql in name order, each in its own transaction.
// Applied files are recorded in "schema_migrations" so a file runs only once
// (its seed UPDATEs never overwrite changes made later in the admin).
// Usage: npm run db:migrate
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { pool } from './db.js';

const dir = new URL('./migrations/', import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

const client = await pool.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await client.query(`SELECT name FROM schema_migrations`)).rows.map((r) => r.name));
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(new URL(file, dir), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
      await client.query('COMMIT');
      applied += 1;
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`${file}: ${err.message}`);
    }
  }
  console.log(applied ? 'Migrations complete.' : 'Database is up to date.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
