import { useState } from 'react';
import { Link } from 'react-router-dom';
import { del, get, post, put } from '../api.js';
import { Btn, Card, Drawer, ErrorBox, Field, ImageField, Input, PageHeader, Select, Spinner, Status, Table, Textarea, Toggle, useAsync, useUi } from '../ui.jsx';

const empty = { name: '', id: '', description: '', image: '', banner: '', seo_title: '', seo_description: '', featured: false, active: true, display_mode: 'list', accent: '#e8281a', icon: 'fa-tag', variant_label: '' };

export default function Collections() {
  const { toast, confirm } = useUi();
  const { data, error, loading, reload } = useAsync(() => get('/collections'), []);
  const [edit, setEdit] = useState(null); // { isNew, form, products }
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const open = async (c) => {
    setErrors({});
    if (!c) return setEdit({ isNew: true, form: { ...empty }, products: [] });
    try {
      const d = await get(`/collections/${encodeURIComponent(c.id)}`);
      setEdit({
        isNew: false,
        form: {
          name: d.title, id: d.id, description: d.description || '', image: d.site_image || '', banner: d.banner || '',
          seo_title: d.seo_title || '', seo_description: d.seo_description || '', featured: d.featured, active: d.active,
          display_mode: d.display_mode, accent: d.accent || '#e8281a', icon: d.icon || 'fa-tag', variant_label: d.variant_label || '',
        },
        products: d.products,
      });
    } catch (err) {
      toast(err.message, 'critical');
    }
  };

  const set = (k, v) => setEdit((e) => ({ ...e, form: { ...e.form, [k]: v } }));

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      if (edit.isNew) await post('/collections', edit.form);
      else {
        await put(`/collections/${encodeURIComponent(edit.form.id)}`, edit.form);
        await put(`/collections/${encodeURIComponent(edit.form.id)}/products`, { productIds: edit.products.map((p) => p.id) });
      }
      toast(edit.isNew ? 'Collection created' : 'Collection saved');
      setEdit(null);
      reload();
    } catch (err) {
      setErrors(err.data?.fields || {});
      toast(err.message, 'critical');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c) => {
    if (!(await confirm({ title: `Delete "${c.title}"?`, message: 'Only empty collections can be deleted.', danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await del(`/collections/${encodeURIComponent(c.id)}`);
      toast('Collection deleted');
      reload();
    } catch (err) {
      toast(err.message, 'critical');
    }
  };

  const move = async (i, d) => {
    const list = [...data];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    try {
      await put('/collections-order', { ids: list.map((c) => c.id) });
      reload();
    } catch (err) {
      toast(err.message, 'critical');
    }
  };

  const moveProduct = (i, d) => {
    const list = [...edit.products];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setEdit((e) => ({ ...e, products: list }));
  };

  return (
    <>
      <PageHeader title="Collections" subtitle="Groups of products shown on the store (menu, categories, homepage)" actions={<Btn variant="primary" icon="fa-plus" onClick={() => open(null)}>Create collection</Btn>} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Spinner /> : (
        <Card pad={false}>
          <Table
            rows={data || []}
            onRowClick={open}
            columns={[
              { key: 'order', label: 'Order', width: 90, render: (c) => {
                const i = data.indexOf(c);
                return (
                  <span onClick={(e) => e.stopPropagation()} className="adm-row" style={{ gap: 2 }}>
                    <Btn size="sm" variant="ghost" icon="fa-arrow-up" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" />
                    <Btn size="sm" variant="ghost" icon="fa-arrow-down" disabled={i === data.length - 1} onClick={() => move(i, 1)} aria-label="Move down" />
                  </span>
                );
              } },
              { key: 'title', label: 'Collection', render: (c) => (
                <div className="adm-cell-main">
                  <span className="adm-thumb" style={{ background: c.accent || undefined, color: '#fff' }}><i className={`fas ${c.icon || 'fa-tag'}`} /></span>
                  <div><strong>{c.title}</strong><small>/{c.id}</small></div>
                </div>
              ) },
              { key: 'product_count', label: 'Products', align: 'right' },
              { key: 'display_mode', label: 'Menu style', render: (c) => (c.display_mode === 'group' ? `Group card (${c.variant_label || 'items'})` : 'Products listed') },
              { key: 'featured', label: 'Featured', render: (c) => (c.featured ? <Status value="active" label="Featured" /> : '—') },
              { key: 'active', label: 'Status', render: (c) => <Status value={c.active ? 'active' : 'draft'} label={c.active ? 'Active' : 'Hidden'} /> },
              { key: 'x', label: '', align: 'right', render: (c) => <span onClick={(e) => e.stopPropagation()}><Btn size="sm" variant="ghost" icon="fa-trash" onClick={() => remove(c)} aria-label="Delete" /></span> },
            ]}
          />
        </Card>
      )}

      <Drawer
        open={Boolean(edit)}
        title={edit?.isNew ? 'Create collection' : `Edit ${edit?.form.name}`}
        onClose={() => setEdit(null)}
        width={620}
        footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn variant="primary" loading={busy} onClick={save}>Save</Btn></>}
      >
        {edit && (
          <>
            <Field label="Name" error={errors.name}><Input value={edit.form.name} onChange={(e) => set('name', e.target.value)} /></Field>
            {edit.isNew && <Field label="URL (optional)" error={errors.id} hint="Made from the name if empty."><Input value={edit.form.id} onChange={(e) => set('id', e.target.value)} /></Field>}
            <Field label="Description"><Textarea rows={3} value={edit.form.description} onChange={(e) => set('description', e.target.value)} /></Field>
            <ImageField label="Image (category card / pills)" value={edit.form.image} onChange={(v) => set('image', v)} />
            <ImageField label="Banner (menu group card)" value={edit.form.banner} onChange={(v) => set('banner', v)} />
            <div className="adm-form-grid">
              <Field label="Menu style">
                <Select value={edit.form.display_mode} onChange={(e) => set('display_mode', e.target.value)} options={[{ value: 'list', label: 'Show products directly' }, { value: 'group', label: 'One group card → opens products' }]} />
              </Field>
              <Field label="Group label" hint="e.g. Flavours, Variants"><Input value={edit.form.variant_label} onChange={(e) => set('variant_label', e.target.value)} /></Field>
              <Field label="Accent colour"><input type="color" className="adm-input" style={{ padding: 3 }} value={edit.form.accent} onChange={(e) => set('accent', e.target.value)} /></Field>
              <Field label="Icon" hint="Font Awesome name, e.g. fa-pepper-hot"><Input value={edit.form.icon} onChange={(e) => set('icon', e.target.value)} /></Field>
            </div>
            <div className="adm-row" style={{ gap: 24 }}>
              <Toggle checked={edit.form.active} onChange={(v) => set('active', v)} label="Visible on store" />
              <Toggle checked={edit.form.featured} onChange={(v) => set('featured', v)} label="Featured" />
            </div>
            <Field label="SEO title"><Input value={edit.form.seo_title} onChange={(e) => set('seo_title', e.target.value)} /></Field>
            <Field label="SEO description"><Textarea rows={2} value={edit.form.seo_description} onChange={(e) => set('seo_description', e.target.value)} /></Field>
            {!edit.isNew && (
              <Field label={`Products in this collection (${edit.products.length})`} hint="Order here = order on the store. To move a product to another collection, edit the product.">
                <div className="adm-stack" style={{ gap: 6 }}>
                  {edit.products.map((p, i) => (
                    <div key={p.id} className="adm-row" style={{ flexWrap: 'nowrap', border: '1px solid var(--line)', borderRadius: 10, padding: 6 }}>
                      {p.image ? <img className="adm-thumb" src={p.image} alt="" /> : <span className="adm-thumb"><i className="fas fa-image" /></span>}
                      <Link to={`/admin/products/${p.id}`} style={{ flex: 1, fontWeight: 500 }}>{p.title}</Link>
                      <Status value={p.status} />
                      <Btn size="sm" variant="ghost" icon="fa-arrow-up" disabled={i === 0} onClick={() => moveProduct(i, -1)} aria-label="Move up" />
                      <Btn size="sm" variant="ghost" icon="fa-arrow-down" disabled={i === edit.products.length - 1} onClick={() => moveProduct(i, 1)} aria-label="Move down" />
                    </div>
                  ))}
                  {!edit.products.length && <span className="adm-muted">No products yet.</span>}
                </div>
              </Field>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
