import { readFileSync } from 'node:fs';
import { query } from './db.js';
import { getSetting } from './lib/settings.js';
import { siteData } from './catalog.js';

// Server-side SEO for the single-page app: crawlers and link previews (WhatsApp, Facebook…)
// don't run JavaScript, so every page is sent with its own <title>, description, Open Graph
// tags and structured data. Unknown URLs get a real 404 status.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const base = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const abs = (req, url) => (!url ? '' : /^https?:\/\//.test(url) ? url : `${base(req)}${url.startsWith('/') ? '' : '/'}${url}`);
const clip = (s, n = 160) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t;
};

// Pages the storefront knows (everything else is a 404)
const STATIC_PAGES = {
  '/': null,
  '/shop': 'Shop all products',
  '/search': 'Search',
  '/cart': 'Your Cart',
  '/checkout': 'Checkout',
  '/signin': 'Sign in',
  '/signup': 'Create account',
  '/forgot-password': 'Forgot password',
  '/reset-password': 'Reset password',
  '/account': 'Your Account',
  '/account/orders': 'Your Orders',
  '/account/wishlist': 'Your Wishlist',
  '/privacy-policy': 'Privacy Policy',
  '/terms': 'Terms & Conditions',
  '/refund-policy': 'Refund & Cancellation Policy',
  '/shipping-policy': 'Shipping & Delivery Policy',
  '/contact': 'Contact Us',
};
const NO_INDEX = new Set(['/cart', '/checkout', '/signin', '/signup', '/forgot-password', '/reset-password', '/account', '/account/orders', '/account/wishlist', '/search']);

let template;
export function loadTemplate(file) {
  template = readFileSync(file, 'utf8');
}

function render(meta, data) {
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    meta.canonical && `<link rel="canonical" href="${esc(meta.canonical)}" />`,
    meta.noindex && '<meta name="robots" content="noindex" />',
    `<meta property="og:site_name" content="${esc(meta.siteName)}" />`,
    `<meta property="og:type" content="${meta.type || 'website'}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    meta.canonical && `<meta property="og:url" content="${esc(meta.canonical)}" />`,
    meta.image && `<meta property="og:image" content="${esc(meta.image)}" />`,
    `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}" />`,
    meta.jsonLd && `<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c')}</script>`,
    // homepage content + collections for the first paint (JSON, not executed: allowed by the CSP)
    data && `<script type="application/json" id="site-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean).join('\n    ');
  return template
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/, '')
    .replace('<!--seo-->', tags);
}

export async function sendPage(req, res) {
  const [store, seo, data] = await Promise.all([getSetting('store'), getSetting('seo'), siteData()]);
  const siteName = store.name || 'Bookends Fanny Pack';
  const path = req.path.replace(/\/+$/, '') || '/';
  const defaults = {
    siteName,
    title: seo.title || siteName,
    description: seo.description || "Ghaslet hot sauces, Chilli Crisp, DK's Boom Boom Lemonde and merch from Bookends Fanny Pack. Order online with Cash on Delivery or secure online payment.",
    image: abs(req, seo.og_image || '/img/ghaslet-banner-2.jpg'),
    canonical: `${base(req)}${path === '/' ? '/' : path}`,
  };

  let meta = null;
  let status = 200;
  const product = /^\/product\/([^/]+)$/.exec(path);
  if (path === '/') {
    meta = {
      ...defaults,
      jsonLd: { '@context': 'https://schema.org', '@type': 'Organization', name: store.legal_name || siteName, url: `${base(req)}/`, logo: abs(req, store.logo || '/img/logo.png'), email: store.contact_email || undefined },
    };
  } else if (product) {
    const { rows } = await query(
      `SELECT p.slug, COALESCE(p.display_name, p.name) AS name, p.description, p.short_description, p.seo_title, p.seo_description,
              p.og_image, p.site_images, COALESCE(c.display_name, c.name) AS category,
              (SELECT min(price) FROM product_variants v WHERE v.product_id = p.id) AS price,
              (SELECT COALESCE(sum(stock), 0) FROM product_variants v WHERE v.product_id = p.id) AS stock,
              (SELECT json_build_object('avg', round(avg(rating)::numeric, 1), 'n', count(*)) FROM product_reviews r WHERE r.product_id = p.id AND r.status = 'published') AS rating
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.slug = $1 AND p.active AND p.status = 'active' AND c.active`,
      [decodeURIComponent(product[1])]
    );
    const p = rows[0];
    if (p) {
      const image = abs(req, p.og_image || p.site_images?.[0]);
      const description = clip(p.seo_description || p.short_description || p.description || defaults.description);
      meta = {
        ...defaults,
        type: 'product',
        title: `${p.seo_title || p.name} | ${siteName}`,
        description,
        image: image || defaults.image,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: p.name,
          description,
          image: (p.site_images || []).map((i) => abs(req, i)),
          category: p.category,
          brand: { '@type': 'Brand', name: siteName },
          offers: p.price != null ? {
            '@type': 'Offer', priceCurrency: 'INR', price: p.price, url: defaults.canonical,
            availability: Number(p.stock) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          } : undefined,
          aggregateRating: Number(p.rating?.n) > 0 ? { '@type': 'AggregateRating', ratingValue: Number(p.rating.avg), reviewCount: Number(p.rating.n) } : undefined,
        },
      };
    }
  } else if (Object.hasOwn(STATIC_PAGES, path)) {
    meta = { ...defaults, title: `${STATIC_PAGES[path]} | ${siteName}`, noindex: NO_INDEX.has(path) };
  } else if (/^\/order\/[^/]+(\/invoice)?$/.test(path)) {
    meta = { ...defaults, title: `Your order | ${siteName}`, noindex: true, canonical: null };
  }
  if (!meta) {
    status = 404;
    meta = { ...defaults, title: `Page not found | ${siteName}`, noindex: true, canonical: null };
  }
  res.status(status).set('Cache-Control', 'no-cache').type('html').send(render(meta, data));
}

export async function robots(req, res) {
  res.type('text/plain').send(
    ['User-agent: *', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /checkout', 'Disallow: /cart', 'Disallow: /account', 'Disallow: /order/', '', `Sitemap: ${base(req)}/sitemap.xml`, ''].join('\n')
  );
}

export async function sitemap(req, res) {
  const { rows } = await query(
    `SELECT p.slug, COALESCE(p.updated_at, p.created_at) AS updated FROM products p JOIN categories c ON c.id = p.category_id
     WHERE p.active AND p.status = 'active' AND c.active ORDER BY p.sort, p.id`
  );
  const urls = [
    { loc: '/', priority: '1.0' },
    { loc: '/shop', priority: '0.9' },
    ...rows.map((p) => ({ loc: `/product/${encodeURIComponent(p.slug)}`, lastmod: p.updated ? new Date(p.updated).toISOString().slice(0, 10) : null, priority: '0.8' })),
    ...['/contact', '/refund-policy', '/shipping-policy', '/privacy-policy', '/terms'].map((loc) => ({ loc, priority: '0.3' })),
  ];
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${esc(base(req) + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`)
      .join('\n')}\n</urlset>\n`
  );
}
