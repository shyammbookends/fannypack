// Restore a backup made by `npm run db:backup`. REPLACES all data in the database.
// Run `npm run db:migrate` first on a new database so the tables exist.
// Usage: npm run db:restore -- backups/db-2026-09-30-1015.json.enc --yes
import '../env.js';
import { readFile } from 'node:fs/promises';
import { pool } from '../db.js';
import { openBackup } from '../lib/backupCrypto.js';

const file = process.argv[2];
if (!file || !process.argv.includes('--yes')) {
  console.log('Usage: npm run db:restore -- <backup.json> --yes\nThis deletes the current data and loads the backup instead.');
  process.exit(1);
}

const backup = JSON.parse(openBackup(await readFile(file)));
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const names = Object.keys(backup.tables);
  const { rows: existing } = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  const known = new Set(existing.map((r) => r.tablename));
  const missing = names.filter((n) => !known.has(n));
  if (missing.length) throw new Error(`Tables missing in this database (run npm run db:migrate first): ${missing.join(', ')}`);
  await client.query(`TRUNCATE ${names.filter((n) => n !== 'schema_migrations').map((n) => `"${n}"`).join(', ')} CASCADE`);

  // Foreign keys stay on (hosted databases such as Neon do not allow switching them off), so tables
  // are loaded parents first, and rows of a table that points at itself are loaded parents first too.
  const { rows: fks } = await client.query(
    `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent,
            array_agg(a.attname ORDER BY k.n) AS cols, array_agg(af.attname ORDER BY k.n) AS refcols
     FROM pg_constraint c
     CROSS JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS k(col, refcol, n)
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.col
     JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = k.refcol
     WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
     GROUP BY c.oid, c.conrelid, c.confrelid`
  );
  const unquote = (t) => t.replace(/^"|"$/g, '');
  const parentsOf = new Map(names.map((n) => [n, new Set()]));
  const selfRefs = new Map();
  for (const fk of fks) {
    const [child, parent] = [unquote(fk.child), unquote(fk.parent)];
    if (!parentsOf.has(child)) continue;
    if (child === parent) selfRefs.set(child, [...(selfRefs.get(child) || []), fk]);
    else if (parentsOf.has(parent)) parentsOf.get(child).add(parent);
  }
  const order = [];
  const placed = new Set();
  while (order.length < names.length) {
    const ready = names.filter((n) => !placed.has(n) && [...parentsOf.get(n)].every((p) => placed.has(p)));
    if (!ready.length) throw new Error(`Circular table links: ${names.filter((n) => !placed.has(n)).join(', ')}`);
    for (const n of ready) { order.push(n); placed.add(n); }
  }
  const sortSelf = (rows, refs) => {
    const key = (row, cols) => JSON.stringify(cols.map((c) => row[c]));
    const out = [];
    const have = new Set();
    let left = rows;
    while (left.length) {
      const next = left.filter((r) => refs.every((fk) => fk.cols.some((c) => r[c] == null) || have.has(fk.refcols + key(r, fk.cols))));
      if (!next.length) return [...out, ...left]; // let PostgreSQL report the broken link
      for (const r of next) { out.push(r); for (const fk of refs) have.add(fk.refcols + key(r, fk.refcols)); }
      left = left.filter((r) => !next.includes(r));
    }
    return out;
  };

  let total = 0;
  for (const name of order) {
    let rows = backup.tables[name];
    if (name === 'schema_migrations' || !rows.length) continue;
    if (selfRefs.has(name)) rows = sortSelf(rows, selfRefs.get(name));
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
