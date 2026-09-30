import { query } from '../db.js';

// Record a sensitive admin action. Never store secrets in before/after.
export async function audit(req, action, entity, entityId, before = null, after = null, db = { query }) {
  try {
    await db.query(
      `INSERT INTO audit_logs (admin_id, admin_email, action, entity, entity_id, before, after, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        req?.admin?.id ?? null,
        req?.admin?.email ?? null,
        action,
        entity ?? null,
        entityId != null ? String(entityId) : null,
        before == null ? null : JSON.stringify(before),
        after == null ? null : JSON.stringify(after),
        req?.ip ?? null,
        req?.headers?.['user-agent']?.slice(0, 300) ?? null,
      ]
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

// Only keep the fields that actually changed (for readable audit entries)
export function diff(before, after) {
  const b = {};
  const a = {};
  for (const k of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
    if (JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])) {
      b[k] = before?.[k] ?? null;
      a[k] = after?.[k] ?? null;
    }
  }
  return { before: b, after: a };
}
