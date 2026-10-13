import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { del, fmtDate, get, inr, post, put } from '../api.js';
import { Btn, Card, Drawer, ErrorBox, Field, Input, PageHeader, Select, Spinner, Status, Table, Textarea, Toggle, useAsync, useUi } from '../ui.jsx';

const empty = { code: '', description: '', type: 'percent', value: 10, scope: 'all', product_ids: [], collection_ids: [], min_order: 0, max_discount: '', starts_at: '', ends_at: '', usage_limit: '', per_customer_limit: '', active: true };
const toLocal = (d) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

function state(d) {
  const now = new Date();
  if (!d.active) return ['draft', 'Inactive'];
  if (d.starts_at && new Date(d.starts_at) > now) return ['pending', 'Scheduled'];
  if (d.ends_at && new Date(d.ends_at) < now) return ['failed', 'Expired'];
  if (d.usage_limit != null && d.used_count >= d.usage_limit) return ['refunded', 'Used up'];
  return ['active', 'Active'];
}

export default function Discounts() {
  const [params, setParams] = useSearchParams();
  const { toast, confirm } = useUi();
  const { data, error, loading, reload } = useAsync(() => get('/discounts'), []);
  const products = useAsync(() => get('/products?pageSize=100'), []);
  const cols = useAsync(() => get('/collections'), []);
  const [edit, setEdit] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (params.get('new')) {
      setEdit({ ...empty });
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const open = (d) => {
    setErrors({});
    setEdit(d ? { ...d, max_discount: d.max_discount ?? '', usage_limit: d.usage_limit ?? '', per_customer_limit: d.per_customer_limit ?? '', starts_at: toLocal(d.starts_at), ends_at: toLocal(d.ends_at), description: d.description || '' } : { ...empty });
  };
  const set = (k, v) => setEdit((e) => ({ ...e, [k]: v }));
  const toggleIn = (k, id) => setEdit((e) => ({ ...e, [k]: e[k].includes(id) ? e[k].filter((x) => x !== id) : [...e[k], id] }));

  const save = async () => {
    setBusy(true);
    setErrors({});
    const body = { ...edit, starts_at: edit.starts_at ? new Date(edit.starts_at).toISOString() : null, ends_at: edit.ends_at ? new Date(edit.ends_at).toISOString() : null };
    try {
      if (edit.id) await put(`/discounts/${edit.id}`, body);
      else await post('/discounts', body);
      toast('Discount saved');
      setEdit(null);
      reload();
    } catch (err) {
      setErrors(err.data?.fields || {});
      toast(err.message, 'critical');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (d) => {
    if (!(await confirm({ title: `Delete ${d.code}?`, message: 'Codes that were already used are deactivated instead of deleted.', danger: true, confirmLabel: 'Delete' }))) return;
    try {
      const r = await del(`/discounts/${d.id}`);
      toast(r.deactivated ? 'Code was used, so it was deactivated' : 'Discount deleted');
      reload();
    } catch (err) {
      toast(err.message, 'critical');
    }
  };

  return (
    <>
      <PageHeader title="Discounts" subtitle="Coupon codes customers can enter at checkout" actions={<Btn variant="primary" icon="fa-plus" onClick={() => open(null)}>Create discount</Btn>} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Spinner /> : (
        <Card pad={false}>
          <Table
            rows={data || []}
            onRowClick={open}
            empty={<div className="adm-empty"><i className="fas fa-percent" /><h4>No discounts yet</h4><p>Create a code like WELCOME10.</p></div>}
            columns={[
              { key: 'code', label: 'Code', render: (d) => <div><strong className="adm-mono">{d.code}</strong>{d.description && <small className="adm-muted" style={{ display: 'block' }}>{d.description}</small>}</div> },
              { key: 'value', label: 'Discount', render: (d) => (d.type === 'percent' ? `${d.value}% off` : `${inr(d.value)} off`) + (d.max_discount ? ` (max ${inr(d.max_discount)})` : '') },
              { key: 'scope', label: 'Applies to', render: (d) => (d.scope === 'all' ? 'All products' : d.scope === 'products' ? `${d.product_ids.length} product(s)` : `${d.collection_ids.length} collection(s)`) + (d.min_order ? ` · min ${inr(d.min_order)}` : '') },
              { key: 'used', label: 'Used', render: (d) => `${d.used_count}${d.usage_limit ? ` / ${d.usage_limit}` : ''}` },
              { key: 'total_discounted', label: 'Given', align: 'right', render: (d) => inr(d.total_discounted) },
              { key: 'dates', label: 'Valid', render: (d) => `${d.starts_at ? fmtDate(d.starts_at, false) : 'Now'} → ${d.ends_at ? fmtDate(d.ends_at, false) : 'No end'}` },
              { key: 'status', label: 'Status', render: (d) => { const [v, l] = state(d); return <Status value={v} label={l} />; } },
              { key: 'x', label: '', align: 'right', render: (d) => <span onClick={(e) => e.stopPropagation()}><Btn size="sm" variant="ghost" icon="fa-trash" onClick={() => remove(d)} aria-label="Delete" /></span> },
            ]}
          />
        </Card>
      )}

      <Drawer open={Boolean(edit)} title={edit?.id ? `Edit ${edit.code}` : 'Create discount'} onClose={() => setEdit(null)}
        footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn variant="primary" loading={busy} onClick={save}>Save</Btn></>}>
        {edit && (
          <>
            <Field label="Code" error={errors.code} hint="Customers type this at checkout."><Input value={edit.code} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="WELCOME10" /></Field>
            <Field label="Description (internal)"><Textarea rows={2} value={edit.description} onChange={(e) => set('description', e.target.value)} /></Field>
            <div className="adm-form-grid">
              <Field label="Type"><Select value={edit.type} onChange={(e) => set('type', e.target.value)} options={[{ value: 'percent', label: 'Percentage' }, { value: 'fixed', label: 'Fixed amount (₹)' }]} /></Field>
              <Field label={edit.type === 'percent' ? 'Percent off' : 'Amount off (₹)'} error={errors.value}><Input type="number" min="1" value={edit.value} onChange={(e) => set('value', e.target.value)} /></Field>
              <Field label="Minimum order (₹)"><Input type="number" min="0" value={edit.min_order} onChange={(e) => set('min_order', e.target.value)} /></Field>
              <Field label="Maximum discount (₹)" hint="Optional cap"><Input type="number" min="0" value={edit.max_discount} onChange={(e) => set('max_discount', e.target.value)} /></Field>
              <Field label="Starts" error={errors.starts_at}><Input type="datetime-local" value={edit.starts_at} onChange={(e) => set('starts_at', e.target.value)} /></Field>
              <Field label="Ends" error={errors.ends_at}><Input type="datetime-local" value={edit.ends_at} onChange={(e) => set('ends_at', e.target.value)} /></Field>
              <Field label="Total uses allowed" hint="Empty = unlimited"><Input type="number" min="1" value={edit.usage_limit} onChange={(e) => set('usage_limit', e.target.value)} /></Field>
              <Field label="Uses per customer" hint="Empty = unlimited"><Input type="number" min="1" value={edit.per_customer_limit} onChange={(e) => set('per_customer_limit', e.target.value)} /></Field>
            </div>
            <Field label="Applies to">
              <Select value={edit.scope} onChange={(e) => set('scope', e.target.value)} options={[{ value: 'all', label: 'All products' }, { value: 'products', label: 'Specific products' }, { value: 'collections', label: 'Specific collections' }]} />
            </Field>
            {edit.scope === 'products' && (
              <Field label="Products" error={errors.product_ids}>
                <div className="adm-stack" style={{ gap: 6, maxHeight: 240, overflow: 'auto' }}>
                  {(products.data?.items || []).map((p) => (
                    <label key={p.id} className="adm-row" style={{ gap: 8 }}><input type="checkbox" checked={edit.product_ids.includes(p.id)} onChange={() => toggleIn('product_ids', p.id)} />{p.title}</label>
                  ))}
                </div>
              </Field>
            )}
            {edit.scope === 'collections' && (
              <Field label="Collections" error={errors.collection_ids}>
                <div className="adm-stack" style={{ gap: 6 }}>
                  {(cols.data || []).map((c) => (
                    <label key={c.id} className="adm-row" style={{ gap: 8 }}><input type="checkbox" checked={edit.collection_ids.includes(c.id)} onChange={() => toggleIn('collection_ids', c.id)} />{c.title}</label>
                  ))}
                </div>
              </Field>
            )}
            <Toggle checked={edit.active} onChange={(v) => set('active', v)} label="Active" />
          </>
        )}
      </Drawer>
    </>
  );
}
