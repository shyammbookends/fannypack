import crypto from 'node:crypto';

// AES-256-GCM encryption for secrets stored in the database (integration keys, 2FA secrets).
// Format: "v1.<iv b64>.<tag b64>.<ciphertext b64>"

function key() {
  const raw = process.env.ENCRYPTION_KEY || '';
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters). See .env.example.');
  }
  return buf;
}

export function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

// Returns the decrypted value, or null when there is nothing / it can't be decrypted
// (for example it was written with a different key).
export function decrypt(payload) {
  if (!payload) return null;
  try {
    const [v, iv, tag, ct] = String(payload).split('.');
    if (v !== 'v1') return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const out = Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]);
    return JSON.parse(out.toString('utf8'));
  } catch {
    return null;
  }
}

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

// Show only the last few characters of a secret-ish value
export function mask(value, visible = 4) {
  if (!value) return '';
  const s = String(value);
  return s.length <= visible ? '•'.repeat(s.length) : '•'.repeat(Math.min(12, s.length - visible)) + s.slice(-visible);
}
