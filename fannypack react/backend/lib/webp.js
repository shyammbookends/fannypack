import path from 'node:path';
import { existsSync } from 'node:fs';

// Serve "photo.jpg.webp" instead of "photo.jpg" when the browser accepts WebP and the copy exists
// (created by `npm run images`). Same URL, much smaller download. Mount before express.static(root).
export function preferWebp(root, cacheControl = 'public, max-age=86400, stale-while-revalidate=604800') {
  const base = path.resolve(root);
  return (req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !/\.(jpe?g|png)$/i.test(req.path)) return next();
    res.vary('Accept'); // caches must keep the WebP and original answers apart
    if (!/\bimage\/webp\b/.test(req.get('accept') || '')) return next();
    let rel;
    try {
      rel = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    const file = path.resolve(base, `.${rel}.webp`);
    // never leave the folder (no "../" tricks)
    if (!file.startsWith(base + path.sep) || !existsSync(file)) return next();
    res.type('image/webp');
    res.sendFile(file, { headers: { 'Cache-Control': cacheControl } });
  };
}
