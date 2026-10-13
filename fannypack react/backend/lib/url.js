// The site's public address for links in emails, sitemaps and share tags.
// Always PUBLIC_URL in production: never trust the request's Host header there (an attacker can
// set it, which would put their domain into password-reset emails).
export function publicBase(req) {
  const env = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  if (env) return env;
  if (process.env.NODE_ENV === 'production') throw Object.assign(new Error('PUBLIC_URL is not set'), { status: 500 });
  return `${req.protocol}://${req.get('host')}`; // local development only
}
