import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fmtDate, get, inr, post, qs } from '../api.js';
import { Btn, Card, ErrorBox, Field, Input, Modal, PageHeader, Pagination, Select, Status, Table, useAsync, useUi } from '../ui.jsx';

export default function Products() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast, confirm } = useUi();
  const [q, setQ] = useState(params.get('q') || '');
  const [selected, setSelected] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const status = params.get('status') || '';
  const collection = params.get('collection') || '';
  const page = Number(params.get('page')) || 1;
  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    setParams(next, { replace: true });
  };
  useEffect(() => {
    const t = setTimeout(() => q !== (params.get('q') || '') && set({ q, page: '' }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const cols = useAsync(() => get('/collections'), []);
  const { data, error, loading, reload } = useAsync(() => get(`/products${qs({ q: params.get('q'), status, collection, page })}`), [params.get('q'), status, collection, page]);

  const bulk = async (action, extra = {}) => {
    if (action === 'delete' && !(await confirm({ title: `Delete ${selected.length} product(s)?`, message: 'Products that already have orders cannot be deleted and will be skipped - archive them instead.', danger: true, confirmLabel: 'Delete' }))) return;
    setBusy(true);
    try {
      const r = await post('/products/bulk', { ids: selected, action, ...extra });
      toast(`${r.updated} updated${r.skipped?.length ? `, ${r.skipped.length} skipped (have orders)` : ''}`);
      setSelected([]);
      setModal(null);
      reload();
    } catch (err) {
      toast(err.message, 'critical');
    } finally {
      setBusy(false);
    }
  };

  const colOptions = [{ value: '', label: 'All collections' }, ...(cols.data || []).map((c) => ({ value: c.id, label: c.title }))];

  return (
    <>
      <PageHeader title="Products" subtitle="Everything you sell" actions={<Link to="/admin/products/new" className="adm-btn primary"><i className="fas fa-plus" /><span>Add product</span></Link>} />
      <div className="adm-toolbar">
        <Input placeholder="Search name, URL or SKU" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
        <Select value={status} onChange={(e) => set({ status: e.target.value, page: '' })} options={[{ value: '', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }, { value: 'archived', label: 'Archived' }]} style={{ maxWidth: 160 }} aria-label="Status" />
        <Select value={collection} onChange={(e) => set({ collection: e.target.value, page: '' })} options={colOptions} style={{ maxWidth: 220 }} aria-label="Collection" />
      </div>
      {selected.length > 0 && (
        <div className="adm-bulkbar">
          <strong>{selected.length} selected</strong>
          <Btn size="sm" icon="fa-eye" disabled={busy} onClick={() => bulk('publish')}>Publish</Btn>
          <Btn size="sm" icon="fa-eye-slash" disabled={busy} onClick={() => bulk('unpublish')}>Unpublish</Btn>
          <Btn size="sm" icon="fa-box-archive" disabled={busy} onClick={() => bulk('archive')}>Archive</Btn>
          <Btn size="sm" icon="fa-layer-group" disabled={busy} onClick={() => { setForm({ collection_id: cols.data?.[0]?.id || '' }); setModal('collection'); }}>Move to collection</Btn>
          <Btn size="sm" icon="fa-percent" disabled={busy} onClick={() => { setForm({ percent: 10 }); setModal('price'); }}>Change prices</Btn>
          <Btn size="sm" icon="fa-trash" disabled={busy} onClick={() => bulk('delete')}>Delete</Btn>
          <span className="adm-spacer" />
          <Btn size="sm" onClick={() => setSelected([])}>Clear</Btn>
        </div>
      )}
      <ErrorBox error={error} onRetry={reload} />
      <Card pad={false}>
        <Table
          loading={loading}
          rows={data?.items || []}
          selectable
          selected={selected}
          onSelect={setSelected}
          onRowClick={(p) => navigate(`/admin/products/${p.id}`)}
          empty={<div className="adm-empty"><i className="fas fa-tag" /><h4>No products found</h4><Link className="adm-btn primary" to="/admin/products/new"><span>Add product</span></Link></div>}
          columns={[
            { key: 'title', label: 'Product', render: (p) => (
              <div className="adm-cell-main">
                {p.image ? <img className="adm-thumb" src={p.image} alt="" /> : <span className="adm-thumb"><i className="fas fa-image" /></span>}
                <div><strong>{p.title}</strong><small>/{p.slug}</small></div>
              </div>
            ) },
            { key: 'skus', label: 'SKU', render: (p) => <span className="adm-mono adm-muted" style={{ fontSize: 12 }}>{p.skus || '—'}</span> },
            { key: 'collection', label: 'Collection' },
            { key: 'price', label: 'Price', render: (p) => (p.price_min === p.price_max ? inr(p.price_min) : `${inr(p.price_min)} – ${inr(p.price_max)}`) },
            { key: 'compare_at', label: 'Compare-at', render: (p) => (p.compare_at ? <s className="adm-muted">{inr(p.compare_at)}</s> : '—') },
            { key: 'stock', label: 'Stock', align: 'right', render: (p) => <span style={{ color: p.stock === 0 ? 'var(--critical)' : undefined, fontWeight: p.stock === 0 ? 600 : 400 }}>{p.stock}{p.variant_count > 1 ? <small className="adm-muted"> · {p.variant_count} variants</small> : ''}</span> },
            { key: 'status', label: 'Status', render: (p) => <Status value={p.status} /> },
            { key: 'created_at', label: 'Created', render: (p) => fmtDate(p.created_at, false) },
            { key: 'updated_at', label: 'Updated', render: (p) => fmtDate(p.updated_at, false) },
          ]}
        />
      </Card>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}

      <Modal open={modal === 'collection'} title="Move to collection" onClose={() => setModal(null)}
        footer={<><Btn onClick={() => setModal(null)}>Cancel</Btn><Btn variant="primary" loading={busy} onClick={() => bulk('set_collection', { collection_id: form.collection_id })}>Move</Btn></>}>
        <Field label="Collection"><Select value={form.collection_id} onChange={(e) => setForm({ collection_id: e.target.value })} options={colOptions.slice(1)} /></Field>
      </Modal>
      <Modal open={modal === 'price'} title="Change prices" onClose={() => setModal(null)}
        footer={<><Btn onClick={() => setModal(null)}>Cancel</Btn><Btn variant="primary" loading={busy} onClick={() => bulk('price', { percent: Number(form.percent) })}>Apply</Btn></>}>
        <p className="adm-muted">Changes the selling price of every variant of the selected products. Use a negative number to lower prices.</p>
        <Field label="Change (%)" hint="e.g. 10 = +10%, -5 = −5%. Prices are rounded to whole rupees."><Input type="number" value={form.percent} onChange={(e) => setForm({ percent: e.target.value })} /></Field>
      </Modal>
    </>
  );
}
