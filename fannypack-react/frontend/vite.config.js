import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server: send "photo.jpg.webp" (made by `npm run images`) instead of "photo.jpg" when the
// browser accepts WebP - the same thing the backend does in production.
const publicDir = path.resolve(import.meta.dirname, 'public');
const webpInDev = {
  name: 'prefer-webp',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const { pathname } = new URL(req.url, 'http://x');
      if (!/^\/img\/.+\.(jpe?g|png)$/i.test(pathname)) return next();
      res.setHeader('Vary', 'Accept');
      if (!/\bimage\/webp\b/.test(req.headers.accept || '')) return next();
      let file;
      try {
        file = path.resolve(publicDir, `.${decodeURIComponent(pathname)}.webp`);
      } catch {
        return next();
      }
      if (!file.startsWith(publicDir + path.sep) || !existsSync(file)) return next(); // never leave public/
      res.setHeader('Content-Type', 'image/webp');
      createReadStream(file).pipe(res);
    });
  },
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  // where `npm run dev` sends /api calls (the backend)
  const api = env.VITE_API_PROXY || 'http://localhost:5000';
  return {
    plugins: [react(), webpInDev],
    build: {
      sourcemap: false, // never ship source maps (they would expose the original code)
      rollupOptions: {
        output: {
          // React + router change rarely: keep them in their own file so browsers keep it cached across site updates
          manualChunks: (id) => (/node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id) ? 'vendor' : undefined),
        },
      },
    },
    server: {
      port: Number(env.VITE_PORT) || 5173,
      proxy: {
        '/api': {
          target: api,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              if (req.headers.host) proxyReq.setHeader('x-forwarded-host', req.headers.host);
            });
          },
        },
        '/uploads': api,
        '/robots.txt': api,
        '/sitemap.xml': api,
      },
    },
  };
});
