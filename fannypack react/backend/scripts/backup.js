// Database backup: every table's rows in one file, backups/db-YYYY-MM-DD-HHMM.json.enc
// (encrypted with ENCRYPTION_KEY from .env; plain .json only if no key is set)
// (keeps the newest 30). Uploaded images live in the uploads/ folder: back that up too.
// Usage: npm run db:backup
// Tip: if PostgreSQL's pg_dump is installed, `pg_dump -Fc "$DATABASE_URL" > backup.dump` is even better.
import { backendPath } from '../env.js';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../db.js';
import { canEncrypt, sealBackup } from '../lib/backupCrypto.js';

const dir = backendPath(process.env.BACKUP_DIR, 'backups');
await mkdir(dir, { recursive: true });

const { rows: tables } = await pool.query(
  `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
);
const data = { created_at: new Date().toISOString(), tables: {} };
let total = 0;
for (const { tablename } of tables) {
  const { rows } = await pool.query(`SELECT * FROM "${tablename}"`);
  data.tables[tablename] = rows;
  total += rows.length;
}

const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
const encrypted = canEncrypt();
const file = path.join(dir, `db-${stamp}.json${encrypted ? '.enc' : ''}`);
await writeFile(file, encrypted ? sealBackup(JSON.stringify(data)) : JSON.stringify(data), { mode: 0o600 });
if (!encrypted) console.warn('WARNING: ENCRYPTION_KEY is not set, so this backup is NOT encrypted. Keep it somewhere private.');
console.log(`Backed up ${tables.length} tables (${total} rows) to ${file}`);

// keep the newest 30 backups
const old = (await readdir(dir)).filter((f) => /^db-.*\.json(\.enc)?$/.test(f)).sort().reverse().slice(30);
for (const f of old) await unlink(path.join(dir, f));
await pool.end();
