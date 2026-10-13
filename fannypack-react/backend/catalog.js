import { Router } from 'express';
import { query } from './db.js';
import { getSetting } from './lib/settings.js';
import { getPublishedContent } from './lib/content.js';
import { memo } from './lib/memo.js';
import { sendCachedJson } from './lib/fastSend.js';

// Stock numbers above this are shown to shoppers as this number
export const MAX_SHOWN_STOCK = 50;

// One product row with its category and variants, shaped for the website.
// Only published ("active") products are ever returned to the storefront.
const PRODUCT_SQL = `
  SELECT p.id, p.slug,
         COALESCE(p.display_name, p.name)  AS name,
         p.description, p.short_description, p.color, p.kind, p.sort,
         p.site_images AS images, p.features, p.specifications, p.ingredients, p.tags,
         p.video_url, p.model_enabled, p.model_url, p.model_poster, p.model_settings,
         p.seo_title, p.seo_description, p.og_image,
         json_build_object('id', c.id, 'name', COALESCE(c.display_name, c.name), 'note', c.note) AS category,
         (SELECT json_build_object('average', COALESCE(round(avg(r.rating)::numeric, 1), 0)::float, 'count', count(*)::int)
          FROM product_reviews r WHERE r.product_id = p.id AND r.status = 'published') AS rating,
         COALESCE((
           -- exact stock is private: shoppers only need "in stock" / "only N left"
           SELECT json_agg(json_build_object('id', v.id, 'option', v.option, 'price', v.price, 'stock', LEAST(GREATEST(v.stock, 0), ${MAX_SHOWN_STOCK}),
                                             'compare_at_price', v.compare_at_price, 'sku', v.sku, 'image', v.image)
                           ORDER BY v.sort, v.id)
           FROM product_variants v WHERE v.product_id = p.id
         ), '[]'::json) AS variants
  FROM products p
  JOIN categories c ON c.id = p.category_id
  WHERE p.active AND p.status = 'active' AND c.active`;

function shape(row) {
  const prices = row.variants.map((v) => v.price);
  const { model_enabled, model_url, model_poster, model_settings, ...rest } = row;
  return {
    ...rest,
    model: model_enabled && model_url ? { url: model_url, poster: model_poster, settings: model_settings || {} } : null,
    price_from: prices.length ? Math.min(...prices) : null,
    in_stock: row.variants.some((v) => v.stock > 0),
  };
}

export const catalog = Router();

// Public, same-for-everyone answers: a CDN (Firebase Hosting / Cloudflare) may keep them for a short
// time, so a traffic spike is served from the edge instead of this server. Browsers always re-check
// (no stale-while-revalidate: browsers apply it too and then fire slow background re-checks).
export const PUBLIC_CACHE = 'public, max-age=0, s-maxage=30';

// Collections for the menu / homepage (the "categories" table)
const COLLECTION_SQL = `
  SELECT c.id, COALESCE(c.display_name, c.name) AS name, c.note, c.description, c.site_image AS image, c.banner,
         c.display_mode, c.accent, c.icon, c.variant_label, c.featured, c.seo_title, c.seo_description,
         (SELECT count(*)::int FROM products p WHERE p.category_id = c.id AND p.active AND p.status = 'active') AS product_count
  FROM categories c WHERE c.active
  ORDER BY c.site_sort NULLS LAST, c.sort, c.id`;

// The whole catalogue (it is small): cached for a few seconds, shared by all visitors
const allProducts = memo(async () => (await query(`${PRODUCT_SQL} ORDER BY c.site_sort NULLS LAST, p.sort, p.id`)).rows.map(shape), 15_000);

catalog.get('/products', async (req, res) => {
  res.set('Cache-Control', PUBLIC_CACHE);
  sendCachedJson(req, res, await allProducts());
});

// built once per catalogue refresh for each product (the product objects are replaced on refresh)
const details = new WeakMap();
function productDetail(all, product) {
  let d = details.get(product);
  if (!d) {
    // "more like this": a few cards only
    const others = all.filter((o) => o.id !== product.id);
    d = {
      product,
      sameCategory: others.filter((o) => o.category.id === product.category.id).slice(0, 8),
      moreProducts: others.filter((o) => o.category.id !== product.category.id).slice(0, 8),
    };
    details.set(product, d);
  }
  return d;
}

// Product page: the product plus "more like this" (same category first, then the rest)
catalog.get('/products/:slug', async (req, res) => {
  // straight from the cached catalogue: a busy product page costs no database work
  const all = await allProducts();
  const product = all.find((p) => p.slug === req.params.slug);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  res.set('Cache-Control', PUBLIC_CACHE);
  sendCachedJson(req, res, productDetail(all, product));
});

// Everything the storefront shell needs: published homepage content, collections, store info and SEO.
// Also embedded in every page by seo.js so the first paint needs no extra request.
export const siteData = memo(loadSiteData, 20_000);
export { allProducts };

async function loadSiteData() {
  const [content, store, seo, categories] = await Promise.all([getPublishedContent(), getSetting('store'), getSetting('seo'), query(COLLECTION_SQL)]);
  return {
    content,
    categories: categories.rows,
    store: {
      name: store.name, logo: store.logo, favicon: store.favicon, contact_email: store.contact_email, phone: store.phone,
      open: store.store_open !== false, support_hours: store.support_hours,
      legal_name: store.legal_name, address: store.address, gstin: store.gstin, fssai: store.fssai,
      grievance_officer: store.grievance_officer, grievance_email: store.grievance_email, grievance_phone: store.grievance_phone,
    },
    seo,
  };
}

catalog.get('/content', async (req, res) => {
  res.set('Cache-Control', PUBLIC_CACHE);
  sendCachedJson(req, res, await siteData());
});
