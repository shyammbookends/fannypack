import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fmtDate, get, inr, post, qs, titleCase } from '../api.js';
import { Btn, Card, ErrorBox, Field, Input, Modal, PageHeader, Pagination, Select, Status, Table, Tabs, useAsync, useUi } from '../ui.jsx';
import { Kpi } from './Dashboard.jsx';

export default function Inventory() {
  const [params, setParams] = useSearchParams();
  const { toast } = useUi();
  const tab = params.get('tab') || 'stock';
  const filter = params.get('filter') || '';
  const page = Number(params.get('page')) || 1;
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [adjust, setAdjust] = useState(null);
  const [bulk, setBulk] = useState(null); // { [variantId]: newStock }
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    setParams(next, { replace: true });
  };

  const inv = useAsync(() => (tab === 'stock' ? get(`/inventory${qs({ q: debounced, filter, page })}`) : Promise.resolve(null)), [tab, debounced, filter, page]);
  const hist = useAsync(() => (tab === 'history' ? get(`/inventory/history${qs({ page })}`) : Promise.resolve(null)), [tab, page]);

  const doAdjust = async () => {
    setBusy(true);
    try {
      const r = await post('/inventory/adjust', { variantId: adjust.row.id, mode: adjust.mode, qty: Number(adjust.qty), reason: adjust.reason });
      toast(`Stock is now ${r.stock}`);
      setAdjust(null);
      inv.reload();
    } catch (err) {
      toast(err.message, 'critical');
    } finally {
      setBusy(false);
    }
  };

  const saveBulk = async () => {
    const items = Object.entries(bulk).map(([variantId, stock]) => ({ variantId: Number(variantId), stock: Number(stock) }));
    if (!items.length) return setBulk(null);
    setBusy(true);
    try {
      const r = await post('/inventory/bulk', { items, reason: 'Bulk stock update' });
      toast(`${r.updated} variant(s) updated`);
      setBulk(null);
      inv.reload();
    } catch (err) {
      toast(err.message, 'critical');
    } finally {
      setBusy(false);
    }
  };

  const s = inv.data?.summary;
  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Stock for every product option. Orders reserve stock automatically, so you can never oversell."
        actions={tab === 'stock' && (bulk ? (
          <>
            <Btn onClick={() => setBulk(null)}>Cancel</Btn>
            <Btn variant="primary" icon="fa-floppy-disk" loading={busy} onClick={saveBulk}>Save {Object.keys(bulk).length} change(s)</Btn>
          </>
        ) : <Btn icon="fa-table-cells" onClick={() => setBulk({})}>Bulk edit</Btn>)}
      />
      <Tabs tabs={[{ key: 'stock', label: 'Stock' }, { key: 'history', label: 'History' }]} value={tab} onChange={(t) => set({ tab: t === 'stock' ? '' : t, page: '' })} />

      {tab === 'stock' && (
        <>
          {s && (
            <div className="adm-kpis">
              <Kpi icon="fa-boxes-stacked" label="Units available" value={s.units.toLocaleString('en-IN')} />
              <Kpi icon="fa-triangle-exclamation" label="Low stock" value={s.low} warn={s.low > 0} to="/admin/inventory?filter=low" />
              <Kpi icon="fa-circle-xmark" label="Out of stock" value={s.out} warn={s.out > 0} to="/admin/inventory?filter=out" />
              <Kpi icon="fa-indian-rupee-sign" label="Stock value (retail)" value={inr(s.retail_value)} sub={s.cost_value ? `Cost ${inr(s.cost_value)}` : 'Add cost prices to see cost value'} />
            </div>
          )}
          <div className="adm-toolbar">
            <Input placeholder="Search product, option or SKU" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inventory" />
            <Select value={filter} onChange={(e) => set({ filter: e.target.value, page: '' })} style={{ maxWidth: 180 }} aria-label="Filter"
              options={[{ value: '', label: 'All' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }]} />
          </div>
          <ErrorBox error={inv.error} onRetry={inv.reload} />
          <Card pad={false}>
            <Table
              loading={inv.loading}
              rows={inv.data?.items || []}
              columns={[
                { key: 'product', label: 'Product', render: (r) => (
                  <div className="adm-cell-main">
                    {r.image ? <img className="adm-thumb" src={r.image} alt="" /> : <span className="adm-thumb"><i className="fas fa-image" /></span>}
                    <div><strong>{r.product}</strong><small>{r.option || 'Default'}</small></div>
                  </div>
                ) },
                { key: 'sku', label: 'SKU', render: (r) => <span className="adm-mono">{r.sku || '—'}</span> },
                { key: 'on_hand', label: 'On hand', align: 'right' },
                { key: 'reserved', label: 'Reserved', align: 'right', render: (r) => (r.reserved ? <span title="Held by orders waiting for payment">{r.reserved}</span> : '0') },
                { key: 'available', label: 'Available', align: 'right', render: (r) => bulk ? (
                  <Input type="number" min="0" style={{ width: 90, marginLeft: 'auto' }} value={bulk[r.id] ?? r.available}
                    onChange={(e) => setBulk((b) => ({ ...b, [r.id]: e.target.value }))} aria-label={`New stock for ${r.product} ${r.option}`} />
                ) : <strong>{r.available}</strong> },
                { key: 'state', label: 'Status', render: (r) => (!r.track_inventory ? <Status value="draft" label="Not tracked" /> : r.available === 0 ? <Status value="failed" label="Out of stock" /> : r.available <= r.low_stock_threshold ? <Status value="pending" label={`Low (≤${r.low_stock_threshold})`} /> : <Status value="active" label="In stock" />) },
                { key: 'x', label: '', align: 'right', render: (r) => !bulk && <Btn size="sm" icon="fa-plus-minus" onClick={() => setAdjust({ row: r, mode: 'add', qty: '', reason: '' })}>Adjust</Btn> },
              ]}
            />
          </Card>
          {inv.data && <Pagination page={inv.data.page} pageSize={inv.data.pageSize} total={inv.data.total} onPage={(p) => set({ page: String(p) })} />}
        </>
      )}

      {tab === 'history' && (
        <>
          <ErrorBox error={hist.error} onRetry={hist.reload} />
          <Card pad={false}>
            <Table
              loading={hist.loading}
              rows={hist.data?.items || []}
              columns={[
                { key: 'created_at', label: 'Date', render: (t) => fmtDate(t.created_at) },
                { key: 'product', label: 'Product', render: (t) => <><strong>{t.product}</strong>{t.option ? <small className="adm-muted"> · {t.option}</small> : null}</> },
                { key: 'previous', label: 'Before', align: 'right' },
                { key: 'new', label: 'After', align: 'right' },
                { key: 'change', label: 'Change', align: 'right', render: (t) => <strong style={{ color: t.change > 0 ? 'var(--good-ink)' : 'var(--critical)' }}>{t.change > 0 ? '+' : ''}{t.change}</strong> },
                { key: 'reason', label: 'Reason', render: (t) => <>{t.reason || titleCase(t.source)}{t.order_number ? <small className="adm-muted adm-mono"> · {t.order_number}</small> : null}</> },
                { key: 'admin_email', label: 'By', render: (t) => t.admin_email || <span className="adm-muted">{t.source === 'order' ? 'Customer order' : 'System'}</span> },
              ]}
            />
          </Card>
          {hist.data && <Pagination page={hist.data.page} pageSize={hist.data.pageSize} total={hist.data.total} onPage={(p) => set({ page: String(p) })} />}
        </>
      )}

      <Modal open={Boolean(adjust)} title={adjust ? `Adjust stock · ${adjust.row.product}${adjust.row.option ? ` (${adjust.row.option})` : ''}` : ''} onClose={() => setAdjust(null)}
        footer={<><Btn onClick={() => setAdjust(null)}>Cancel</Btn><Btn variant="primary" loading={busy} disabled={adjust?.qty === '' || !adjust?.reason} onClick={doAdjust}>Save</Btn></>}>
        {adjust && (
          <>
            <p className="adm-muted">Currently available: <strong>{adjust.row.available}</strong></p>
            <Field label="Action">
              <Select value={adjust.mode} onChange={(e) => setAdjust({ ...adjust, mode: e.target.value })} options={[{ value: 'add', label: 'Add stock (received)' }, { value: 'remove', label: 'Remove stock (damaged / lost)' }, { value: 'set', label: 'Set exact count (stock take)' }]} />
            </Field>
            <Field label="Quantity"><Input type="number" min="0" value={adjust.qty} onChange={(e) => setAdjust({ ...adjust, qty: e.target.value })} autoFocus /></Field>
            <Field label="Reason" hint="Saved in the inventory history."><Input value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} placeholder="e.g. New batch received" /></Field>
            {adjust.qty !== '' && (
              <p>New stock will be: <strong>{adjust.mode === 'add' ? adjust.row.available + Number(adjust.qty) : adjust.mode === 'remove' ? adjust.row.available - Number(adjust.qty) : Number(adjust.qty)}</strong></p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
