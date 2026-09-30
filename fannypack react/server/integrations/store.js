import { query } from '../db.js';
import { decrypt, encrypt } from '../lib/crypto.js';

// Integration credentials live in the existing "integrations" table:
//   config      -> non-secret settings (key id, pickup location, flags...)
//   secret_enc  -> AES-GCM encrypted JSON with the secrets (never sent to the browser)
export async function getIntegration(provider) {
  const { rows } = await query(`SELECT * FROM integrations WHERE provider = $1`, [provider]);
  const row = rows[0];
  if (!row) return { provider, config: {}, secrets: {}, status: 'disconnected', last_error: null, last_checked_at: null, unreadable: false };
  const secrets = decrypt(row.secret_enc);
  return {
    provider,
    config: row.config || {},
    secrets: secrets || {},
    // saved by another app / with another ENCRYPTION_KEY
    unreadable: Boolean(row.secret_enc) && !secrets,
    status: row.status,
    last_error: row.last_error,
    last_checked_at: row.last_checked_at,
    updated_at: row.updated_at,
  };
}

export async function saveIntegration(provider, { config, secrets, status, last_error, checked = false }) {
  const current = await getIntegration(provider);
  const nextConfig = config ?? current.config;
  const nextSecrets = secrets ?? current.secrets;
  await query(
    `INSERT INTO integrations (provider, config, secret_enc, status, last_error, last_checked_at, updated_at)
     VALUES ($1, $2::jsonb, $3, $4, $5, CASE WHEN $6 THEN now() ELSE NULL END, now())
     ON CONFLICT (provider) DO UPDATE SET
       config = EXCLUDED.config,
       secret_enc = EXCLUDED.secret_enc,
       status = EXCLUDED.status,
       last_error = EXCLUDED.last_error,
       last_checked_at = CASE WHEN $6 THEN now() ELSE integrations.last_checked_at END,
       updated_at = now()`,
    [
      provider,
      JSON.stringify(nextConfig),
      nextSecrets && Object.keys(nextSecrets).length ? encrypt(nextSecrets) : null,
      status ?? current.status ?? 'disconnected',
      last_error === undefined ? current.last_error : last_error,
      checked,
    ]
  );
  return getIntegration(provider);
}

export async function removeIntegration(provider) {
  await query(`DELETE FROM integrations WHERE provider = $1`, [provider]);
}
