import { readFileSync } from 'node:fs';
import { query } from './db.js';
import { getSetting } from './lib/settings.js';
import { PUBLIC_CACHE, allProducts, siteData } from './catalog.js';
import { cachedConfig } from './orders.js';
import { publicBase } from './lib/url.js';
import { sendCompressed } from './lib/fastSend.js';

// Server-side SEO for the single-page app: crawlers and link previews (WhatsApp, Facebook…)
// don't run JavaScript, so every page is sent with its own <title>, description, Open Graph
// tags and structured data. Unknown URLs get a real 404 status.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const base = (req) => publicBase(req);
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

// a malformed address like /product/%E0 must give "not found", not a server error
function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
}

let template;
export function loadTemplate(file) {
  template = readFileSync(file, 'utf8');
}

// The embedded JSON is the same for every visitor: build it once per cache refresh, not per request
let lastData = { site: null, config: null, json: '' };
function dataJson(site, config) {
  if (lastData.site !== site || lastData.config !== config) {
    lastData = { site, config, json: JSON.stringify({ ...site, config }).replace(/</g, '\\u003c') };
  }
  return lastData.json;
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
    data && `<script type="application/json" id="site-data">${data}</script>`,
  ].filter(Boolean).join('\n    ');
  return template
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/, '')
    .replace('<!--seo-->', tags);
}

export async function sendPage(req, res) {
  const [store, seo, site, config] = await Promise.all([getSetting('store'), getSetting('seo'), siteData(), cachedConfig()]);
  const data = dataJson(site, config); // everything the first paint needs, so the page makes no extra requests
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
    // from the cached catalogue (same data the product API uses): no database work per visit
    const slug = safeDecode(product[1]);
    const p = (await allProducts()).find((x) => x.slug === slug);
    if (p) {
      const image = abs(req, p.og_image || p.images?.[0]);
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
          image: (p.images || []).map((i) => abs(req, i)),
          category: p.category.name,
          brand: { '@type': 'Brand', name: siteName },
          offers: p.price_from != null ? {
            '@type': 'Offer', priceCurrency: 'INR', price: p.price_from, url: defaults.canonical,
            availability: p.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          } : undefined,
          aggregateRating: p.rating?.count > 0 ? { '@type': 'AggregateRating', ratingValue: p.rating.average, reviewCount: p.rating.count } : undefined,
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
  // ordinary pages are the same for everyone, so a CDN may serve them for a few seconds; order pages and 404s are never shared
  const shared = status === 200 && !path.startsWith('/order/');
  res.status(status).set('Cache-Control', shared ? PUBLIC_CACHE : 'no-cache');
  sendCompressed(req, res, render(meta, data), 'html');
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
