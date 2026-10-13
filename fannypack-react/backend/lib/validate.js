// Input checks shared by every route.
// The email pattern has no overlapping parts, so it runs in linear time even on hostile input
// (the old /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/ could freeze the server for seconds on a long crafted string).
const EMAIL = /^[^\s@]{1,64}@[^\s@.]{1,63}(?:\.[^\s@.]{1,63})+$/;

export function isEmail(v) {
  const s = String(v ?? '');
  return s.length <= 254 && EMAIL.test(s) && /\.[^\s@.]{2,}$/.test(s);
}
