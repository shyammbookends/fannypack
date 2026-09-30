import { Router } from 'express';
import { query, tx } from '../db.js';
import { requirePerm } from './auth.js';
import { audit, diff } from '../lib/audit.js';
import { changeStock } from '../lib/inventory.js';
import { bool, HttpError, int, paging, slugify, str } from './util.js';

export const products = Router();

const STATUSES = ['draft', 'active', 'archived'];

const PRODUCT_DETAIL_SQL = `
  SELECT p.*, COALESCE(p.display_name, p.name) AS title,
         COALESCE((SELECT json_agg(v ORDER BY v.sort, v.id) FROM product_variants v WHERE v.product_id = p.id), '[]'::json) AS variants
  FROM products p WHERE p.id = $1`;

async function loadProduct(db, id) {
  const { rows } = await db.query(PRODUCT_DETAIL_SQL, [id]);
  return rows[0] || null;
}

const arr = (v, max = 50) => (Array.isArray(v) ? v.slice(0, max) : []);
const strList = (v, max = 50) => arr(v, max).map((x) => str(x, 500)).filter(Boolean);

function cleanProduct(b, { isNew }) {
  const fields = {};
  const name = str(b.name, 150);
  if (!name) fields.name = 'Product name is required.';
  const slug = slugify(b.slug || name);
  if (!slug) fields.slug = 'URL slug is required.';
  const status = STATUSES.includes(b.status) ? b.status : 'draft';
  if (!str(b.category_id)) fields.category_id = 'Choose a collection.';
  const variants = arr(b.variants, 50);
  if (!variants.length) fields.variants = 'Add at least one price / variant.';
  const seenOpt = new Set();
  const cleanVariants = variants.map((v, i) => {
    const option = str(v.option, 60) || '';
    if (seenOpt.has(option)) fields.variants = `Two variants have the same option "${option || '(default)'}".`;
    seenOpt.add(option);
    const price = int(v.price);
    if (price == null || price < 0) fields.variants = 'Every variant needs a selling price.';
    const cmp = int(v.compare_at_price);
    if (cmp != null && price != null && cmp <= price) fields.variants = 'Compare-at price must be higher than the selling price.';
    return {
      id: int(v.id),
      option,
      price,
      compare_at_price: cmp,
      cost_price: int(v.cost_price),
      sku: str(v.sku, 60) || null,
      barcode: str(v.barcode, 60) || null,
      stock: int(v.stock),
      low_stock_threshold: Math.max(0, int(v.low_stock_threshold) ?? 5),
      track_inventory: v.track_inventory !== false,
      weight_g: int(v.weight_g),
      length_cm: v.length_cm === '' || v.length_cm == null ? null : Number(v.length_cm) || null,
      width_cm: v.width_cm === '' || v.width_cm == null ? null : Number(v.width_cm) || null,
      height_cm: v.height_cm === '' || v.height_cm == null ? null : Number(v.height_cm) || null,
      shipping_class: str(v.shipping_class, 40) || null,
      image: str(v.image, 500) || null,
      sort: i,
    };
  });
  if (Object.keys(fields).length) throw new HttpError(400, 'Please fix the highlighted fields.', fields);
  const ms = b.model_settings || {};
  return {
    name,
    slug,
    status,
    category_id: str(b.category_id),
    description: str(b.description, 10000) || '',
    short_description: str(b.short_description, 500) || null,
    brand: str(b.brand, 80) || null,
    tags: strList(b.tags, 30),
    images: strList(b.images, 20),
    video_url: str(b.video_url, 500) || null,
    model_url: str(b.model_url, 500) || null,
    model_poster: str(b.model_poster, 500) || null,
    model_enabled: bool(b.model_enabled),
    model_settings: {
      auto_rotate: ms.auto_rotate !== false,
      rotation_speed: Math.min(360, Math.max(1, Number(ms.rotation_speed) || 30)),
      camera_orbit: str(ms.camera_orbit, 60) || '0deg 75deg 105%',
      camera_controls: ms.camera_controls !== false,
      exposure: Math.min(3, Math.max(0.1, Number(ms.exposure) || 1)),
    },
    seo_title: str(b.seo_title, 120) || null,
    seo_description: str(b.seo_description, 300) || null,
    og_image: str(b.og_image, 500) || null,
    tax_rate: Math.min(100, Math.max(0, Number(b.tax_rate) || 0)),
    hsn: String(b.hsn ?? '').replace(/\D/g, '').slice(0, 8) || null,
    features: strList(b.features, 20),
    ingredients: strList(b.ingredients, 60),
    specifications: arr(b.specifications, 30)
      .filter((r) => Array.isArray(r) && str(r[0]))
      .map((r) => [str(r[0], 80), str(r[1], 300) || '']),
    color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#dddddd',
    kind: str(b.kind, 30) || 'other',
    variants: cleanVariants,
    isNew,
  };
}

async function saveVariants(db, productId, variants, admin, { isNew }) {
  const { rows: existing } = await db.query(`SELECT id FROM product_variants WHERE product_id = $1`, [productId]);
  const keep = new Set(variants.filter((v) => v.id).map((v) => v.id));
  for (const e of existing) {
    if (!keep.has(e.id)) await db.query(`DELETE FROM product_variants WHERE id = $1`, [e.id]);
  }
  for (const v of variants) {
    const vals = [v.option, v.price, v.compare_at_price, v.cost_price, v.sku, v.barcode, v.low_stock_threshold, v.track_inventory, v.weight_g, v.length_cm, v.width_cm, v.height_cm, v.shipping_class, v.sort, v.image];
    if (v.id && existing.some((e) => e.id === v.id)) {
      await db.query(
        `UPDATE product_variants SET option=$1, price=$2, compare_at_price=$3, cost_price=$4, sku=$5, barcode=$6,
                low_stock_threshold=$7, track_inventory=$8, weight_g=$9, length_cm=$10, width_cm=$11, height_cm=$12,
                shipping_class=$13, sort=$14, image=$15, updated_at=now()
         WHERE id=$16 AND product_id=$17`,
        [...vals, v.id, productId]
      );
      if (v.stock != null) await changeStock(db, { variantId: v.id, set: Math.max(0, v.stock), source: 'admin', reason: 'Edited in product editor', admin });
    } else {
      const { rows } = await db.query(
        `INSERT INTO product_variants (product_id, option, price, compare_at_price, cost_price, sku, barcode,
                low_stock_threshold, track_inventory, weight_g, length_cm, width_cm, height_cm, shipping_class, sort, image, stock)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0) RETURNING id`,
        [productId, ...vals]
      );
      if (v.stock) await changeStock(db, { variantId: rows[0].id, set: Math.max(0, v.stock), source: 'admin', reason: isNew ? 'Opening stock' : 'New variant', admin });
    }
  }
}

function uniqueViolation(err) {
  if (err.code !== '23505') return err;
  if (/sku/.test(err.constraint || '')) return new HttpError(409, 'That SKU is already used by another product.', { variants: 'SKU already in use.' });
  if (/slug/.test(err.constraint || '')) return new HttpError(409, 'That URL slug is already used.', { slug: 'Already in use.' });
  if (/pkey/.test(err.constraint || '')) return new HttpError(409, 'A product with this URL slug already exists.', { slug: 'Already in use.' });
  if (/option/.test(err.constraint || '')) return new HttpError(409, 'Two variants have the same option.', { variants: 'Duplicate option.' });
  return err;
}

// ---------- list ----------
products.get('/products', requirePerm('products'), async (req, res) => {
  const { page, pageSize, offset } = paging(req);
  const where = [];
  const params = [];
  const add = (sql, v) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (req.query.q) add(`(COALESCE(p.display_name,p.name) ILIKE ? OR p.id ILIKE $${params.length + 1} OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.sku ILIKE $${params.length + 1}))`, `%${req.query.q}%`);
  if (STATUSES.includes(req.query.status)) add(`p.status = ?`, req.query.status);
  if (req.query.collection) add(`p.category_id = ?`, req.query.collection);
  const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sorts = { name: 'title', updated: 'p.updated_at DESC', created: 'p.created_at DESC', stock: 'stock', price: 'price_min' };
  const order = sorts[req.query.sort] || 'c.site_sort NULLS LAST, p.sort, p.id';
  const [list, count] = await Promise.all([
    query(
      `SELECT p.id, p.slug, COALESCE(p.display_name, p.name) AS title, p.status, p.category_id,
              COALESCE(c.display_name, c.name) AS collection, p.site_images->>0 AS image, p.created_at, p.updated_at,
              (SELECT min(price) FROM product_variants v WHERE v.product_id = p.id) AS price_min,
              (SELECT max(price) FROM product_variants v WHERE v.product_id = p.id) AS price_max,
              (SELECT max(compare_at_price) FROM product_variants v WHERE v.product_id = p.id) AS compare_at,
              (SELECT COALESCE(sum(stock),0)::int FROM product_variants v WHERE v.product_id = p.id) AS stock,
              (SELECT count(*)::int FROM product_variants v WHERE v.product_id = p.id) AS variant_count,
              (SELECT string_agg(sku, ', ' ORDER BY sort) FROM product_variants v WHERE v.product_id = p.id) AS skus
       FROM products p JOIN categories c ON c.id = p.category_id
       ${W} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${offset}`,
      params
    ),
    query(`SELECT count(*)::int AS n FROM products p ${W}`, params),
  ]);
  res.json({ items: list.rows, total: count.rows[0].n, page, pageSize });
});

products.get('/products/:id', requirePerm('products'), async (req, res) => {
  const p = await loadProduct({ query }, req.params.id);
  if (!p) throw new HttpError(404, 'Product not found.');
  res.json(p);
});

// ---------- create / update ----------
products.post('/products', requirePerm('products'), async (req, res) => {
  const d = cleanProduct(req.body || {}, { isNew: true });
  try {
    const created = await tx(async (db) => {
      await db.query(
        `INSERT INTO products (id, slug, name, display_name, category_id, description, short_description, brand, tags,
                image, site_images, video_url, model_url, model_poster, model_enabled, model_settings, seo_title, seo_description,
                og_image, tax_rate, features, ingredients, specifications, color, kind, status, active, sort)
         VALUES ($1,$1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
                 (SELECT COALESCE(max(sort),0)+1 FROM products))`,
        [
          d.slug, d.name, d.category_id, d.description, d.short_description, d.brand, JSON.stringify(d.tags),
          d.images[0] || '', JSON.stringify(d.images), d.video_url, d.model_url, d.model_poster, d.model_enabled,
          JSON.stringify(d.model_settings), d.seo_title, d.seo_description, d.og_image, d.tax_rate,
          JSON.stringify(d.features), JSON.stringify(d.ingredients), JSON.stringify(d.specifications), d.color, d.kind,
          d.status, d.status === 'active',
        ]
      );
      await saveVariants(db, d.slug, d.variants, req.admin, { isNew: true });
      await db.query(`UPDATE products SET hsn = $1 WHERE id = $2`, [d.hsn, d.slug]);
      return loadProduct(db, d.slug);
    });
    await audit(req, 'product.create', 'product', created.id, null, { name: created.title, status: created.status });
    res.status(201).json(created);
  } catch (err) {
    throw uniqueViolation(err);
  }
});

products.put('/products/:id', requirePerm('products'), async (req, res) => {
  const d = cleanProduct(req.body || {}, { isNew: false });
  try {
    const { before, after } = await tx(async (db) => {
      const before = await loadProduct(db, req.params.id);
      if (!before) throw new HttpError(404, 'Product not found.');
      await db.query(
        `UPDATE products SET slug=$2, display_name=$3, category_id=$4, description=$5, short_description=$6, brand=$7,
                tags=$8, site_images=$9, image = CASE WHEN $10 <> '' THEN $10 ELSE image END, video_url=$11, model_url=$12,
                model_poster=$13, model_enabled=$14, model_settings=$15, seo_title=$16, seo_description=$17, og_image=$18,
                tax_rate=$19, features=$20, ingredients=$21, specifications=$22, color=$23, kind=$24, status=$25,
                active=$26, updated_at=now()
         WHERE id=$1`,
        [
          req.params.id, d.slug, d.name, d.category_id, d.description, d.short_description, d.brand, JSON.stringify(d.tags),
          JSON.stringify(d.images), d.images[0] || '', d.video_url, d.model_url, d.model_poster, d.model_enabled,
          JSON.stringify(d.model_settings), d.seo_title, d.seo_description, d.og_image, d.tax_rate, JSON.stringify(d.features),
          JSON.stringify(d.ingredients), JSON.stringify(d.specifications), d.color, d.kind, d.status, d.status === 'active',
        ]
      );
      await saveVariants(db, req.params.id, d.variants, req.admin, { isNew: false });
      await db.query(`UPDATE products SET hsn = $1 WHERE id = $2`, [d.hsn, req.params.id]);
      return { before, after: await loadProduct(db, req.params.id) };
    });
    const pick = (p) => ({
      name: p.title, slug: p.slug, status: p.status, collection: p.category_id, description: p.description,
      images: p.site_images, seo_title: p.seo_title,
      prices: p.variants.map((v) => `${v.option || 'default'}: ₹${v.price}${v.compare_at_price ? ` (MRP ₹${v.compare_at_price})` : ''}`),
      stock: p.variants.map((v) => `${v.option || 'default'}: ${v.stock}`),
    });
    const ch = diff(pick(before), pick(after));
    if (Object.keys(ch.after).length) await audit(req, 'product.update', 'product', req.params.id, ch.before, ch.after);
    res.json(after);
  } catch (err) {
    throw uniqueViolation(err);
  }
});

products.post('/products/:id/duplicate', requirePerm('products'), async (req, res) => {
  const copy = await tx(async (db) => {
    const p = await loadProduct(db, req.params.id);
    if (!p) throw new HttpError(404, 'Product not found.');
    let newId = `${p.id}-copy`;
    for (let n = 2; (await db.query(`SELECT 1 FROM products WHERE id = $1 OR slug = $1`, [newId])).rows.length; n++) newId = `${p.id}-copy-${n}`;
    await db.query(
      `INSERT INTO products (id, slug, name, display_name, category_id, description, short_description, brand, tags, image,
              small_image, site_images, video_url, model_url, model_poster, model_enabled, model_settings, seo_title,
              seo_description, og_image, tax_rate, features, ingredients, specifications, color, kind, status, active, sort)
       SELECT $2, $2, name || ' (copy)', COALESCE(display_name, name) || ' (copy)', category_id, description, short_description,
              brand, tags, image, small_image, site_images, video_url, model_url, model_poster, model_enabled, model_settings,
              seo_title, seo_description, og_image, tax_rate, features, ingredients, specifications, color, kind, 'draft', false, sort + 1
       FROM products WHERE id = $1`,
      [p.id, newId]
    );
    await db.query(
      `INSERT INTO product_variants (product_id, option, price, compare_at_price, cost_price, low_stock_threshold, track_inventory,
              weight_g, length_cm, width_cm, height_cm, shipping_class, sort, stock)
       SELECT $2, option, price, compare_at_price, cost_price, low_stock_threshold, track_inventory, weight_g, length_cm,
              width_cm, height_cm, shipping_class, sort, 0
       FROM product_variants WHERE product_id = $1`,
      [p.id, newId]
    );
    return loadProduct(db, newId);
  });
  await audit(req, 'product.duplicate', 'product', copy.id, { from: req.params.id }, { id: copy.id });
  res.status(201).json(copy);
});

products.delete('/products/:id', requirePerm('products'), async (req, res) => {
  const { rows } = await query(`SELECT count(*)::int AS n FROM order_items WHERE product_id = $1`, [req.params.id]);
  if (rows[0].n) throw new HttpError(409, 'This product has orders, so it cannot be deleted. Archive it instead.');
  const p = await loadProduct({ query }, req.params.id);
  if (!p) throw new HttpError(404, 'Product not found.');
  await query(`DELETE FROM products WHERE id = $1`, [req.params.id]);
  await audit(req, 'product.delete', 'product', req.params.id, { name: p.title, status: p.status }, null);
  res.json({ ok: true });
});

// Bulk actions: publish | unpublish | archive | delete | set_collection | price (percent)
products.post('/products/bulk', requirePerm('products'), async (req, res) => {
  const ids = arr(req.body?.ids, 200).map(String);
  const action = String(req.body?.action || '');
  if (!ids.length) throw new HttpError(400, 'Select at least one product.');
  let result = { updated: 0, skipped: [] };
  await tx(async (db) => {
    if (action === 'publish' || action === 'unpublish' || action === 'archive') {
      const status = action === 'publish' ? 'active' : action === 'archive' ? 'archived' : 'draft';
      const r = await db.query(`UPDATE products SET status = $1, active = $2, updated_at = now() WHERE id = ANY($3::text[])`, [status, status === 'active', ids]);
      result.updated = r.rowCount;
    } else if (action === 'set_collection') {
      const col = str(req.body?.collection_id);
      if (!(await db.query(`SELECT 1 FROM categories WHERE id = $1`, [col])).rows.length) throw new HttpError(400, 'Collection not found.');
      result.updated = (await db.query(`UPDATE products SET category_id = $1, updated_at = now() WHERE id = ANY($2::text[])`, [col, ids])).rowCount;
    } else if (action === 'price') {
      const pct = Number(req.body?.percent);
      if (!Number.isFinite(pct) || pct <= -90 || pct > 500 || pct === 0) throw new HttpError(400, 'Enter a percentage change between -90 and 500.');
      result.updated = (
        await db.query(`UPDATE product_variants SET price = GREATEST(0, round(price * (1 + $1 / 100.0)))::int, updated_at = now() WHERE product_id = ANY($2::text[])`, [pct, ids])
      ).rowCount;
    } else if (action === 'delete') {
      const { rows } = await db.query(`SELECT DISTINCT product_id FROM order_items WHERE product_id = ANY($1::text[])`, [ids]);
      const blocked = new Set(rows.map((r) => r.product_id));
      const del = ids.filter((i) => !blocked.has(i));
      if (del.length) result.updated = (await db.query(`DELETE FROM products WHERE id = ANY($1::text[])`, [del])).rowCount;
      result.skipped = [...blocked];
    } else throw new HttpError(400, 'Unknown bulk action.');
  });
  await audit(req, `product.bulk_${action}`, 'product', ids.join(','), null, { ids, ...req.body, ids: undefined, updated: result.updated });
  res.json(result);
});

// ================= Collections (categories table) =================

const COLLECTION_LIST_SQL = `
  SELECT c.*, COALESCE(c.display_name, c.name) AS title,
         (SELECT count(*)::int FROM products p WHERE p.category_id = c.id) AS product_count
  FROM categories c`;

function cleanCollection(b) {
  const fields = {};
  const name = str(b.name, 100);
  if (!name) fields.name = 'Collection name is required.';
  if (Object.keys(fields).length) throw new HttpError(400, 'Please fix the highlighted fields.', fields);
  return {
    name,
    id: slugify(b.id || b.slug || name),
    description: str(b.description, 2000) || '',
    image: str(b.image, 500) || null,
    banner: str(b.banner, 500) || null,
    seo_title: str(b.seo_title, 120) || null,
    seo_description: str(b.seo_description, 300) || null,
    featured: bool(b.featured),
    active: b.active !== false,
    display_mode: b.display_mode === 'group' ? 'group' : 'list',
    accent: /^#[0-9a-f]{6}$/i.test(b.accent || '') ? b.accent : null,
    icon: /^fa-[a-z0-9-]+$/.test(b.icon || '') ? b.icon : null,
    variant_label: str(b.variant_label, 30) || null,
  };
}

products.get('/collections', requirePerm('collections'), async (_req, res) => {
  res.json((await query(`${COLLECTION_LIST_SQL} ORDER BY c.site_sort NULLS LAST, c.sort, c.id`)).rows);
});

products.get('/collections/:id', requirePerm('collections'), async (req, res) => {
  const { rows } = await query(`${COLLECTION_LIST_SQL} WHERE c.id = $1`, [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Collection not found.');
  const { rows: items } = await query(
    `SELECT id, COALESCE(display_name, name) AS title, status, site_images->>0 AS image, sort FROM products WHERE category_id = $1 ORDER BY sort, id`,
    [req.params.id]
  );
  res.json({ ...rows[0], products: items });
});

products.post('/collections', requirePerm('collections'), async (req, res) => {
  const c = cleanCollection(req.body || {});
  if (!c.id) throw new HttpError(400, 'Collection URL is required.', { id: 'Required.' });
  if ((await query(`SELECT 1 FROM categories WHERE id = $1`, [c.id])).rows.length) throw new HttpError(409, 'A collection with this URL already exists.', { id: 'Already in use.' });
  await query(
    `INSERT INTO categories (id, name, display_name, note, image, site_image, description, banner, seo_title, seo_description,
            featured, active, display_mode, accent, icon, variant_label, sort, site_sort)
     VALUES ($1,$2,$2,$3,COALESCE($4,''),$4,$3,$5,$6,$7,$8,$9,$10,$11,$12,$13,
             (SELECT COALESCE(max(sort),0)+1 FROM categories), (SELECT COALESCE(max(site_sort),0)+1 FROM categories))`,
    [c.id, c.name, c.description, c.image, c.banner, c.seo_title, c.seo_description, c.featured, c.active, c.display_mode, c.accent, c.icon, c.variant_label]
  );
  await audit(req, 'collection.create', 'collection', c.id, null, c);
  res.status(201).json((await query(`${COLLECTION_LIST_SQL} WHERE c.id = $1`, [c.id])).rows[0]);
});

products.put('/collections/:id', requirePerm('collections'), async (req, res) => {
  const c = cleanCollection({ ...req.body, id: req.params.id });
  const { rows: b } = await query(`${COLLECTION_LIST_SQL} WHERE c.id = $1`, [req.params.id]);
  if (!b[0]) throw new HttpError(404, 'Collection not found.');
  await query(
    `UPDATE categories SET display_name=$2, description=$3, note = CASE WHEN $3 <> '' THEN $3 ELSE note END,
            site_image=$4, banner=$5, seo_title=$6, seo_description=$7, featured=$8, active=$9, display_mode=$10,
            accent=$11, icon=$12, variant_label=$13, updated_at=now()
     WHERE id=$1`,
    [req.params.id, c.name, c.description, c.image, c.banner, c.seo_title, c.seo_description, c.featured, c.active, c.display_mode, c.accent, c.icon, c.variant_label]
  );
  const { rows: a } = await query(`${COLLECTION_LIST_SQL} WHERE c.id = $1`, [req.params.id]);
  const pick = (x) => ({ name: x.title, description: x.description, image: x.site_image, banner: x.banner, active: x.active, featured: x.featured, display_mode: x.display_mode });
  const ch = diff(pick(b[0]), pick(a[0]));
  if (Object.keys(ch.after).length) await audit(req, 'collection.update', 'collection', req.params.id, ch.before, ch.after);
  res.json(a[0]);
});

products.delete('/collections/:id', requirePerm('collections'), async (req, res) => {
  const { rows } = await query(`SELECT count(*)::int AS n FROM products WHERE category_id = $1`, [req.params.id]);
  if (rows[0].n) throw new HttpError(409, `This collection still has ${rows[0].n} product(s). Move them to another collection first.`);
  const r = await query(`DELETE FROM categories WHERE id = $1`, [req.params.id]);
  if (!r.rowCount) throw new HttpError(404, 'Collection not found.');
  await audit(req, 'collection.delete', 'collection', req.params.id);
  res.json({ ok: true });
});

// Order of collections on the website
products.put('/collections-order', requirePerm('collections'), async (req, res) => {
  const ids = arr(req.body?.ids, 100).map(String);
  await tx(async (db) => {
    for (const [i, id] of ids.entries()) await db.query(`UPDATE categories SET site_sort = $1 WHERE id = $2`, [i, id]);
  });
  await audit(req, 'collection.reorder', 'collection', null, null, { ids });
  res.json({ ok: true });
});

// Products in a collection: set membership + order
products.put('/collections/:id/products', requirePerm('collections'), async (req, res) => {
  const ids = arr(req.body?.productIds, 200).map(String);
  await tx(async (db) => {
    if (!(await db.query(`SELECT 1 FROM categories WHERE id = $1`, [req.params.id])).rows.length) throw new HttpError(404, 'Collection not found.');
    for (const [i, pid] of ids.entries()) {
      await db.query(`UPDATE products SET category_id = $1, sort = $2, updated_at = now() WHERE id = $3`, [req.params.id, i, pid]);
    }
  });
  await audit(req, 'collection.products', 'collection', req.params.id, null, { productIds: ids });
  res.json({ ok: true });
});
