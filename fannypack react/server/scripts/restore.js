// Restore a backup made by `npm run db:backup`. REPLACES all data in the database.
// Run `npm run db:migrate` first on a new database so the tables exist.
// Usage: npm run db:restore -- backups/db-2026-09-30-1015.json --yes
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { pool } from '../db.js';

const file = process.argv[2];
if (!file || !process.argv.includes('--yes')) {
  console.log('Usage: npm run db:restore -- <backup.json> --yes\nThis deletes the current data and loads the backup instead.');
  process.exit(1);
}

const backup = JSON.parse(await readFile(file, 'utf8'));
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // load rows in any order: foreign keys are checked by PostgreSQL only for normal sessions
  await client.query('SET LOCAL session_replication_role = replica');
  const names = Object.keys(backup.tables);
  const { rows: existing } = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  const known = new Set(existing.map((r) => r.tablename));
  const missing = names.filter((n) => !known.has(n));
  if (missing.length) throw new Error(`Tables missing in this database (run npm run db:migrate first): ${missing.join(', ')}`);
  await client.query(`TRUNCATE ${names.filter((n) => n !== 'schema_migrations').map((n) => `"${n}"`).join(', ')} CASCADE`);
  let total = 0;
  for (const name of names) {
    const rows = backup.tables[name];
    if (name === 'schema_migrations' || !rows.length) continue;
    for (let i = 0; i < rows.length; i += 500) {
      await client.query(`INSERT INTO "${name}" SELECT * FROM json_populate_recordset(null::"${name}", $1::json)`, [JSON.stringify(rows.slice(i, i + 500))]);
    }
    total += rows.length;
  }
  // continue ids after the restored rows
  const { rows: seqs } = await client.query(
    `SELECT s.relname AS seq, t.relname AS tbl, a.attname AS col FROM pg_depend d
     JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
     JOIN pg_class t ON t.oid = d.refobjid JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
     JOIN pg_namespace n ON n.oid = s.relnamespace WHERE n.nspname = 'public' AND d.deptype = 'a'`
  );
  for (const s of seqs) {
    await client.query(`SELECT setval('"${s.seq}"', COALESCE((SELECT max("${s.col}") FROM "${s.tbl}"), 0) + 1, false)`);
  }
  await client.query('COMMIT');
  console.log(`Restored ${total} rows from ${file} (backup made ${backup.created_at}).`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Restore failed, nothing was changed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
