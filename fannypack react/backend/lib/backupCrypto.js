import crypto from 'node:crypto';

// Backup files hold password hashes and customer data, so they are encrypted with ENCRYPTION_KEY
// (AES-256-GCM, tamper-proof). Format: "FPBK1" + 12-byte IV + 16-byte tag + ciphertext.
const MAGIC = Buffer.from('FPBK1');

function key() {
  const k = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');
  return k.length === 32 ? k : null;
}

export const canEncrypt = () => Boolean(key());

export function sealBackup(json) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(json, 'utf8'), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

export function openBackup(buf) {
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) return buf.toString('utf8'); // older plain JSON backup
  if (!key()) throw new Error('This backup is encrypted: ENCRYPTION_KEY in .env is needed to restore it.');
  const iv = buf.subarray(5, 17);
  const tag = buf.subarray(17, 33);
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(33)), d.final()]).toString('utf8');
}
