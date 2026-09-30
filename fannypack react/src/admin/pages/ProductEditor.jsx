import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { del, get, post, put } from '../api.js';
import { Btn, Card, ErrorBox, Field, ImageField, Input, ListInput, MediaPicker, PageHeader, Select, Spinner, Status, Textarea, Toggle, useAsync, useUi } from '../ui.jsx';

const EMPTY_VARIANT = { option: '', price: '', compare_at_price: '', cost_price: '', sku: '', barcode: '', stock: 0, low_stock_threshold: 5, track_inventory: true, weight_g: '', length_cm: '', width_cm: '', height_cm: '', shipping_class: '', image: '' };

const blank = {
  name: '', slug: '', status: 'draft', category_id: '', description: '', short_description: '', brand: 'Bookends Fanny Pack',
  tags: [], images: [], video_url: '', model_url: '', model_poster: '', model_enabled: false,
  model_settings: { auto_rotate: true, rotation_speed: 30, camera_orbit: '0deg 75deg 105%', camera_controls: true, exposure: 1 },
  seo_title: '', seo_description: '', og_image: '', tax_rate: 0, hsn: '', features: [], ingredients: [], specifications: [], color: '#dddddd', kind: 'other',
  variants: [{ ...EMPTY_VARIANT }],
};

// DB row -> form
function toForm(p) {
  return {
    name: p.title, slug: p.slug, status: p.status, category_id: p.category_id, description: p.description || '',
    short_description: p.short_description || '', brand: p.brand || '', tags: p.tags || [], images: p.site_images || [],
    video_url: p.video_url || '', model_url: p.model_url || '', model_poster: p.model_poster || '', model_enabled: p.model_enabled,
    model_settings: { ...blank.model_settings, ...(p.model_settings || {}) },
    seo_title: p.seo_title || '', seo_description: p.seo_description || '', og_image: p.og_image || '', tax_rate: Number(p.tax_rate) || 0, hsn: p.hsn || '',
    features: p.features || [], ingredients: p.ingredients || [], specifications: p.specifications || [], color: p.color || '#dddddd', kind: p.kind || 'other',
    variants: p.variants.map((v) => ({
      ...EMPTY_VARIANT, ...v,
      compare_at_price: v.compare_at_price ?? '', cost_price: v.cost_price ?? '', sku: v.sku || '', barcode: v.barcode || '',
      weight_g: v.weight_g ?? '', length_cm: v.length_cm ?? '', width_cm: v.width_cm ?? '', height_cm: v.height_cm ?? '', shipping_class: v.shipping_class || '', image: v.image || '',
      originalStock: v.stock,
    })),
  };
}

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { toast, confirm } = useUi();
  const cols = useAsync(() => get('/collections'), []);
  const existing = useAsync(() => (isNew ? Promise.resolve(null) : get(`/products/${encodeURIComponent(id)}`)), [id]);
  const [f, setF] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);

  // Fill the form once (new product, or when the product has loaded)
  useEffect(() => {
    if (isNew) setF({ ...blank });
    else if (existing.data) setF(toForm(existing.data));
  }, [isNew, existing.data]);
  // New product: default to the first collection once the list arrives
  useEffect(() => {
    if (isNew && cols.data?.length) setF((x) => (x && !x.category_id ? { ...x, category_id: cols.data[0].id } : x));
  }, [isNew, cols.data]);

  if (existing.error) return <ErrorBox error={existing.error} onRetry={existing.reload} />;
  if (!f) return <Spinner />;

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setVar = (i, k, v) => setF((x) => ({ ...x, variants: x.variants.map((vv, j) => (j === i ? { ...vv, [k]: v } : vv)) }));
  const setMs = (k, v) => setF((x) => ({ ...x, model_settings: { ...x.model_settings, [k]: v } }));
  const autoSlug = (name) => name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80);

  const save = async (statusOverride) => {
    setSaving(true);
    setErrors({});
    const body = {
      ...f,
      status: statusOverride || f.status,
      // stock is only sent when it was changed here (otherwise inventory history stays clean)
      variants: f.variants.map((v) => ({ ...v, stock: v.id && Number(v.stock) === v.originalStock ? null : Number(v.stock) || 0 })),
    };
    try {
      const saved = isNew ? await post('/products', body) : await put(`/products/${encodeURIComponent(id)}`, body);
      toast(isNew ? 'Product created' : 'Saved - the store is updated');
      if (isNew || saved.id !== id) navigate(`/admin/products/${saved.id}`, { replace: true });
      else setF(toForm(saved));
    } catch (err) {
      setErrors(err.data?.fields || {});
      toast(err.message, 'critical');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this product?', message: 'This cannot be undone. Products with orders cannot be deleted - archive them instead.', danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await del(`/products/${encodeURIComponent(id)}`);
      toast('Product deleted');
      navigate('/admin/products');
    } catch (err) {
      toast(err.message, 'critical');
    }
  };

  const duplicate = async () => {
    try {
      const copy = await post(`/products/${encodeURIComponent(id)}/duplicate`);
      toast('Duplicated as a draft');
      navigate(`/admin/products/${copy.id}`);
    } catch (err) {
      toast(err.message, 'critical');
    }
  };

  const moveImg = (i, d) => {
    const imgs = [...f.images];
    const j = i + d;
    if (j < 0 || j >= imgs.length) return;
    [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
    set('images', imgs);
  };

  return (
    <>
      <PageHeader
        back={{ label: 'Products', onClick: (e) => { e.preventDefault(); navigate('/admin/products'); } }}
        title={isNew ? 'Add product' : <span className="adm-row">{f.name || 'Untitled'} <Status value={f.status} /></span>}
        actions={
          <>
            {!isNew && f.status === 'active' && <a className="adm-btn" href={`/product/${f.slug}`} target="_blank" rel="noreferrer"><i className="fas fa-arrow-up-right-from-square" /><span>View on store</span></a>}
            {!isNew && <Btn icon="fa-copy" onClick={duplicate}>Duplicate</Btn>}
            {!isNew && <Btn variant="danger" icon="fa-trash" onClick={remove}>Delete</Btn>}
            <Btn variant="primary" icon="fa-floppy-disk" loading={saving} onClick={() => save()}>Save</Btn>
          </>
        }
      />
      <div className="adm-grid main-side">
        <div className="adm-stack">
          <Card title="Basic information">
            <div className="adm-form-grid">
              <Field label="Product name" error={errors.name} className="full">
                <Input value={f.name} onChange={(e) => { set('name', e.target.value); if (!slugTouched) set('slug', autoSlug(e.target.value)); }} />
              </Field>
              <Field label="URL slug" error={errors.slug} hint={`Store link: /product/${f.slug || '…'}`}>
                <Input value={f.slug} onChange={(e) => { setSlugTouched(true); set('slug', e.target.value); }} />
              </Field>
              <Field label="Brand"><Input value={f.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
              <Field label="Short description" className="full" hint="One line used in lists and search results."><Input value={f.short_description} onChange={(e) => set('short_description', e.target.value)} /></Field>
              <Field label="Description" className="full"><Textarea rows={5} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
            </div>
          </Card>

          <Card title="Media" subtitle="The first image is the thumbnail. Use the arrows to reorder.">
            <div className="adm-gallery">
              {f.images.map((src, i) => (
                <div key={src + i} className={`adm-gallery-item ${i === 0 ? 'first' : ''}`}>
                  {i === 0 && <span className="tag">Thumbnail</span>}
                  <img src={src} alt="" />
                  <div className="adm-gallery-tools">
                    <button type="button" onClick={() => moveImg(i, -1)} aria-label="Move left"><i className="fas fa-arrow-left" /></button>
                    <button type="button" onClick={() => moveImg(i, 1)} aria-label="Move right"><i className="fas fa-arrow-right" /></button>
                    <button type="button" onClick={() => set('images', f.images.filter((_, j) => j !== i))} aria-label="Remove"><i className="fas fa-trash" /></button>
                  </div>
                </div>
              ))}
              <button type="button" className="adm-gallery-add" onClick={() => setPicker(true)}><i className="fas fa-plus" />Add image</button>
            </div>
            <MediaPicker open={picker} onClose={() => setPicker(false)} onPick={(u) => { set('images', [...f.images, u]); setPicker(false); }} />
            <div className="adm-form-grid" style={{ marginTop: 16 }}>
              <ImageField label="Product video (MP4 / WEBM)" type="videos" accept="video/mp4,video/webm" value={f.video_url} onChange={(v) => set('video_url', v)} />
              <ImageField label="Social preview image" value={f.og_image} onChange={(v) => set('og_image', v)} hint="Shown when the link is shared." />
            </div>
          </Card>

          <Card title="3D model" subtitle="Optional GLB model shown on the product page (loaded only when a visitor opens it).">
            <div className="adm-stack" style={{ gap: 12 }}>
              <Toggle checked={f.model_enabled} onChange={(v) => set('model_enabled', v)} label="Show 3D viewer on the product page" />
              <div className="adm-form-grid">
                <ImageField label="GLB model file" type="models" accept=".glb,model/gltf-binary" value={f.model_url} onChange={(v) => set('model_url', v)} hint="Keep it under ~10 MB for fast loading." />
                <ImageField label="Model thumbnail (poster)" value={f.model_poster} onChange={(v) => set('model_poster', v)} />
                <Field label="Rotation speed (degrees / second)"><Input type="number" min="1" max="360" value={f.model_settings.rotation_speed} onChange={(e) => setMs('rotation_speed', e.target.value)} /></Field>
                <Field label="Camera position" hint="e.g. 0deg 75deg 105%"><Input value={f.model_settings.camera_orbit} onChange={(e) => setMs('camera_orbit', e.target.value)} /></Field>
                <Field label="Brightness (exposure)"><Input type="number" step="0.1" min="0.1" max="3" value={f.model_settings.exposure} onChange={(e) => setMs('exposure', e.target.value)} /></Field>
                <div className="adm-stack" style={{ gap: 10, justifyContent: 'center' }}>
                  <Toggle checked={f.model_settings.auto_rotate} onChange={(v) => setMs('auto_rotate', v)} label="Auto rotate" />
                  <Toggle checked={f.model_settings.camera_controls} onChange={(v) => setMs('camera_controls', v)} label="Let visitors drag / zoom" />
                </div>
              </div>
            </div>
          </Card>

          <Card title="Pricing, inventory & shipping" subtitle="One row per size / option. Leave the option empty if there is only one." actions={<Btn size="sm" icon="fa-plus" onClick={() => set('variants', [...f.variants, { ...EMPTY_VARIANT }])}>Add variant</Btn>}>
            {errors.variants && <div className="adm-alert critical" style={{ marginBottom: 12 }}><i className="fas fa-circle-exclamation" /><div>{errors.variants}</div></div>}
            <div className="adm-stack" style={{ gap: 12 }}>
              {f.variants.map((v, i) => (
                <div className="adm-variant" key={v.id || `new-${i}`}>
                  <div className="adm-variant-head">
                    <strong>{v.option || (f.variants.length > 1 ? `Variant ${i + 1}` : 'Default')}</strong>
                    {f.variants.length > 1 && <Btn size="sm" variant="ghost" icon="fa-trash" onClick={() => set('variants', f.variants.filter((_, j) => j !== i))} aria-label="Remove variant" />}
                  </div>
                  <div className="adm-form-grid cols-3">
                    <Field label="Option (size / colour)"><Input value={v.option} onChange={(e) => setVar(i, 'option', e.target.value)} placeholder="e.g. 180 ml, M" /></Field>
                    <Field label="Selling price (₹)"><Input type="number" min="0" value={v.price} onChange={(e) => setVar(i, 'price', e.target.value)} /></Field>
                    <Field label="Compare-at price (₹)" hint="Old / MRP price, shown struck through"><Input type="number" min="0" value={v.compare_at_price} onChange={(e) => setVar(i, 'compare_at_price', e.target.value)} /></Field>
                    <Field label="Cost price (₹)" hint="Private - for margin reports"><Input type="number" min="0" value={v.cost_price} onChange={(e) => setVar(i, 'cost_price', e.target.value)} /></Field>
                    <Field label="SKU"><Input value={v.sku} onChange={(e) => setVar(i, 'sku', e.target.value)} /></Field>
                    <Field label="Barcode"><Input value={v.barcode} onChange={(e) => setVar(i, 'barcode', e.target.value)} /></Field>
                    <Field label="Quantity in stock"><Input type="number" min="0" value={v.stock} onChange={(e) => setVar(i, 'stock', e.target.value)} /></Field>
                    <Field label="Low-stock alert at"><Input type="number" min="0" value={v.low_stock_threshold} onChange={(e) => setVar(i, 'low_stock_threshold', e.target.value)} /></Field>
                    <Field label="Stock status"><div style={{ paddingTop: 8 }}><Toggle checked={v.track_inventory} onChange={(x) => setVar(i, 'track_inventory', x)} label="Track inventory" /></div></Field>
                    <Field label="Weight (g)"><Input type="number" min="0" value={v.weight_g} onChange={(e) => setVar(i, 'weight_g', e.target.value)} /></Field>
                    <Field label="Length × width × height (cm)">
                      <div className="adm-row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                        <Input type="number" min="0" value={v.length_cm} onChange={(e) => setVar(i, 'length_cm', e.target.value)} aria-label="Length" />
                        <Input type="number" min="0" value={v.width_cm} onChange={(e) => setVar(i, 'width_cm', e.target.value)} aria-label="Width" />
                        <Input type="number" min="0" value={v.height_cm} onChange={(e) => setVar(i, 'height_cm', e.target.value)} aria-label="Height" />
                      </div>
                    </Field>
                    <Field label="Shipping class"><Input value={v.shipping_class} onChange={(e) => setVar(i, 'shipping_class', e.target.value)} placeholder="e.g. fragile" /></Field>
                  </div>
                  <ImageField label="Photo for this option (optional)" hint="Shown first on the product page when a shopper picks this option, and in the cart." value={v.image} onChange={(x) => setVar(i, 'image', x)} />
                  {v.price !== '' && v.cost_price !== '' && Number(v.price) > 0 && (
                    <small className="adm-muted">Margin: ₹{Number(v.price) - Number(v.cost_price)} ({Math.round(((Number(v.price) - Number(v.cost_price)) / Number(v.price)) * 100)}%)</small>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Product details">
            <div className="adm-stack" style={{ gap: 14 }}>
              <Field label="About this item (bullet points)" hint="Press Enter after each point."><ListInput value={f.features} onChange={(v) => set('features', v)} placeholder="Add a point…" /></Field>
              <Field label="Ingredients" hint="Press Enter after each ingredient. Shown on the product page."><ListInput value={f.ingredients} onChange={(v) => set('ingredients', v)} placeholder="Add an ingredient…" /></Field>
              <Field label="Specifications">
                <div className="adm-stack" style={{ gap: 6 }}>
                  {f.specifications.map((row, i) => (
                    <div className="adm-row" key={i} style={{ flexWrap: 'nowrap' }}>
                      <Input value={row[0]} placeholder="Name" onChange={(e) => set('specifications', f.specifications.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
                      <Input value={row[1]} placeholder="Value" onChange={(e) => set('specifications', f.specifications.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
                      <Btn size="sm" variant="ghost" icon="fa-xmark" onClick={() => set('specifications', f.specifications.filter((_, j) => j !== i))} aria-label="Remove row" />
                    </div>
                  ))}
                  <div><Btn size="sm" icon="fa-plus" onClick={() => set('specifications', [...f.specifications, ['', '']])}>Add row</Btn></div>
                </div>
              </Field>
            </div>
          </Card>

          <Card title="Search engine listing (SEO)">
            <div className="adm-stack" style={{ gap: 12 }}>
              <Field label="SEO title" hint={`${(f.seo_title || f.name).length}/70`}><Input value={f.seo_title} placeholder={f.name} onChange={(e) => set('seo_title', e.target.value)} /></Field>
              <Field label="SEO description" hint={`${(f.seo_description || '').length}/160`}><Textarea rows={3} value={f.seo_description} onChange={(e) => set('seo_description', e.target.value)} /></Field>
            </div>
          </Card>
        </div>

        <div className="adm-stack">
          <Card title="Status">
            <Field label="Visibility">
              <Select value={f.status} onChange={(e) => set('status', e.target.value)} options={[{ value: 'active', label: 'Active - visible on store' }, { value: 'draft', label: 'Draft - hidden' }, { value: 'archived', label: 'Archived - hidden' }]} />
            </Field>
          </Card>
          <Card title="Organisation">
            <div className="adm-stack" style={{ gap: 12 }}>
              <Field label="Collection" error={errors.category_id}>
                <Select value={f.category_id} onChange={(e) => set('category_id', e.target.value)} options={(cols.data || []).map((c) => ({ value: c.id, label: c.title }))} />
              </Field>
              <Field label="Tags" hint="Press Enter after each tag."><ListInput value={f.tags} onChange={(v) => set('tags', v)} placeholder="Add a tag…" /></Field>
              <Field label="Product type"><Select value={f.kind} onChange={(e) => set('kind', e.target.value)} options={['bottle', 'jar', 'can', 'tshirt', 'jacket', 'pendent', 'other']} /></Field>
              <Field label="Accent colour"><input type="color" className="adm-input" style={{ padding: 3, height: 38 }} value={f.color} onChange={(e) => set('color', e.target.value)} /></Field>
            </div>
          </Card>
          <Card title="Tax">
            <Field label="GST rate (%)" hint="Used for the tax lines on invoices (see Settings → Tax for whether prices include tax)."><Input type="number" min="0" max="100" step="0.01" value={f.tax_rate} onChange={(e) => set('tax_rate', e.target.value)} /></Field>
            <Field label="HSN code" hint="Printed on GST invoices, e.g. 2103 for sauces."><Input inputMode="numeric" maxLength={8} value={f.hsn} onChange={(e) => set('hsn', e.target.value.replace(/\D/g, ''))} /></Field>
          </Card>
          {!isNew && (
            <Card title="Stock history">
              <Link to={`/admin/inventory`} style={{ color: 'var(--series-1)' }}>Open inventory</Link>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
