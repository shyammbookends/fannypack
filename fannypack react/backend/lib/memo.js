// Tiny in-memory cache for hot public data (homepage content, product list).
// - results live for `ttlMs`
// - many requests arriving at once share one database query
// - bumpCache() empties everything at once (called whenever the admin saves something)
let version = 0;
export const bumpCache = () => {
  version += 1;
};

export function memo(fn, ttlMs) {
  const entries = new Map(); // key -> { at, version, promise }
  return (key = '') => {
    const hit = entries.get(key);
    if (hit && hit.version === version && Date.now() - hit.at < ttlMs) return hit.promise;
    const promise = Promise.resolve().then(fn);
    entries.set(key, { at: Date.now(), version, promise });
    promise.catch(() => entries.delete(key)); // never cache a failure
    if (entries.size > 200) entries.delete(entries.keys().next().value);
    return promise;
  };
}
