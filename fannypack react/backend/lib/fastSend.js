import zlib from 'node:zlib';

// Public pages and catalogue JSON are the same for every visitor and only change when the
// short-lived caches refresh. Compressing them once (instead of on every request) lets one
// server answer far more visitors at the same time.
const gzipped = new Map(); // body -> gzip bytes (only a handful of distinct public bodies exist)
const MAX_ENTRIES = 300;
const jsonOf = new WeakMap(); // cached object -> its JSON text

export function sendCompressed(req, res, body, type) {
  res.type(type);
  res.vary('Accept-Encoding');
  if (body.length < 1024 || !/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return res.send(body);
  let buf = gzipped.get(body);
  if (!buf) {
    buf = zlib.gzipSync(body, { level: 9 });
    if (gzipped.size >= MAX_ENTRIES) gzipped.delete(gzipped.keys().next().value); // oldest first
    gzipped.set(body, buf);
  }
  res.set('Content-Encoding', 'gzip'); // the compression middleware leaves encoded responses alone
  res.send(buf);
}

// JSON for an object that comes from a cache (memo): stringified once per cache refresh
export function sendCachedJson(req, res, obj) {
  let text = jsonOf.get(obj);
  if (text === undefined) {
    text = JSON.stringify(obj);
    jsonOf.set(obj, text);
  }
  sendCompressed(req, res, text, 'application/json; charset=utf-8');
}
