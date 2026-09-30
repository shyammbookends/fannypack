import dns from 'node:dns/promises';

// Cheap checks at sign-up, so obviously fake emails and mobile numbers are rejected immediately.

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/i;

// Common throw-away inbox providers
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com', '10minutemail.net',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'yopmail.com', 'yopmail.net', 'trashmail.com', 'getnada.com',
  'dispostable.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'mohmal.com',
  'emailondeck.com', 'tempinbox.com', 'mailnesia.com', 'mytemp.email', 'tempr.email', 'discard.email', 'spamgourmet.com',
  'example.com', 'example.org', 'example.net', 'test.com',
]);

const domainCache = new Map();

// System DNS first; if the local resolver refuses/times out, ask public DNS instead
const publicResolver = new dns.Resolver({ timeout: 3000, tries: 2 });
publicResolver.setServers(['1.1.1.1', '8.8.8.8', '9.9.9.9']);
const UNREACHABLE = ['ECONNREFUSED', 'ETIMEOUT', 'ECONNRESET', 'EREFUSED', 'ESERVFAIL', 'ECANCELLED'];

async function resolveMx(domain) {
  try {
    return await dns.resolveMx(domain);
  } catch (err) {
    if (!UNREACHABLE.includes(err.code)) throw err;
    return publicResolver.resolveMx(domain);
  }
}

// Does this domain receive email? It must publish a mail server (MX record).
// Returns true / false, or null when DNS cannot be reached at all.
async function domainAcceptsMail(domain) {
  const hit = domainCache.get(domain);
  if (hit && hit.at > Date.now() - 6 * 3600 * 1000) return hit.ok;
  let ok;
  try {
    const mx = await resolveMx(domain);
    ok = mx.some((r) => r.exchange && r.exchange !== '.'); // "." = null MX: domain accepts no mail
  } catch (err) {
    if (['ENOTFOUND', 'ENODATA', 'ENONAME', 'NXDOMAIN'].includes(err.code)) ok = false;
    else return null; // DNS unreachable: don't block sign-up because of our own network problem
  }
  domainCache.set(domain, { ok, at: Date.now() });
  return ok;
}

export async function checkEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.includes('..')) return { ok: false, email, error: 'Enter a valid email address.' };
  const domain = email.split('@')[1];
  if (DISPOSABLE.has(domain)) return { ok: false, email, error: 'Please use your real email address (temporary inboxes are not allowed).' };
  if ((await domainAcceptsMail(domain)) === false) return { ok: false, email, error: `"${domain}" does not receive email. Please check the address.` };
  return { ok: true, email };
}

export function checkPhone(raw) {
  const phone = String(raw || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(phone)) return { ok: false, phone, error: 'Enter a valid 10-digit Indian mobile number.' };
  if (/^(\d)\1{9}$/.test(phone)) return { ok: false, phone, error: 'Enter your real mobile number.' };
  if (['9876543210', '9123456789', '9012345678', '6789012345', '7890123456', '8901234567'].includes(phone)) {
    return { ok: false, phone, error: 'Enter your real mobile number.' };
  }
  // 5+ of the same digit in a row (e.g. 9000000001) is almost always made up
  if (/(\d)\1{5,}/.test(phone)) return { ok: false, phone, error: 'Enter your real mobile number.' };
  return { ok: true, phone };
}
