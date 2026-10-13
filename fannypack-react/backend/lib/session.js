// Sign-in cookie shared by the shop and the admin panel.
// Firebase Hosting forwards only ONE cookie, named "__session", to the backend (all others are
// stripped), so both sign-ins live in it: "__session=c.<token>~a.<token>" (either part may be absent).
// Tokens are random 64-hex strings; they are only ever looked up by their hash, and expiry is
// enforced by the sessions tables, not by the cookie.
export const SESSION_COOKIE = '__session';
const MAX_AGE = 30 * 86400; // the cookie outlives the longest session; the server decides validity
const TOKEN = /^[a-f0-9]{64}$/;

function current(req, res) {
  if (res?.locals?.fpSession) return res.locals.fpSession; // already changed during this request
  const out = { c: null, a: null };
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0 || part.slice(0, i).trim() !== SESSION_COOKIE) continue;
    for (const piece of part.slice(i + 1).trim().split('~')) {
      const [kind, token] = piece.split('.');
      if ((kind === 'c' || kind === 'a') && TOKEN.test(token || '')) out[kind] = token;
    }
  }
  return out;
}

// kind: 'c' = customer, 'a' = admin
export function readSession(req, kind) {
  return current(req)[kind];
}

export function writeSession(res, kind, token) {
  const req = res.req;
  const next = { ...current(req, res), [kind]: token && TOKEN.test(token) ? token : null };
  res.locals.fpSession = next;
  const value = ['c', 'a'].filter((k) => next[k]).map((k) => `${k}.${next[k]}`).join('~');
  // Secure whenever the site is reached over HTTPS, even if NODE_ENV was forgotten
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true' || Boolean(req?.secure);
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${value ? MAX_AGE : 0}${secure ? '; Secure' : ''}`
  );
}
