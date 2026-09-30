import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { downloadCsv, fmtDate, get, inr, qs } from '../api.js';
import { Btn, Card, ErrorBox, Input, PageHeader, Pagination, Status, Table, Tabs, useAsync, useUi } from '../ui.jsx';

const TABS = [
  ['all', 'All'], ['pending', 'Pending'], ['awaiting_payment', 'Awaiting payment'], ['paid', 'Paid'], ['processing', 'Processing'],
  ['shipped', 'Shipped'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'],
  ['refunded', 'Refunded'], ['failed', 'Failed'],
];

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useUi();
  const filter = params.get('filter') || 'all';
  const page = Number(params.get('page')) || 1;
  const [q, setQ] = useState(params.get('q') || '');
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

  const { data, error, loading, reload } = useAsync(
    () => get(`/orders${qs({ filter, page, q: params.get('q') })}`),
    [filter, page, params.get('q')]
  );

  const exportCsv = () =>
    downloadCsv('/reports/orders?range=year&format=csv', 'fannypack-orders.csv').catch((e) => toast(e.message, 'critical'));

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Every order placed on the store"
        actions={<Btn icon="fa-file-arrow-down" onClick={exportCsv}>Export CSV</Btn>}
      />
      <Tabs tabs={TABS.map(([key, label]) => ({ key, label, count: data?.counts?.[key] }))} value={filter} onChange={(f) => set({ filter: f === 'all' ? '' : f, page: '' })} />
      <div className="adm-toolbar">
        <Input placeholder="Search order #, name, email, phone, AWB" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <Card pad={false}>
        <Table
          rowKey="number"
          loading={loading}
          rows={data?.items || []}
          onRowClick={(o) => navigate(`/admin/orders/${o.number}`)}
          empty={<div className="adm-empty"><i className="fas fa-bag-shopping" /><h4>No orders here</h4><p>Try another tab or search.</p></div>}
          columns={[
            { key: 'number', label: 'Order', render: (o) => <strong className="adm-mono">{o.number}</strong> },
            { key: 'created_at', label: 'Date', render: (o) => fmtDate(o.created_at) },
            { key: 'name', label: 'Customer', render: (o) => <div className="adm-cell-main"><div><strong>{o.name}</strong><small>{o.phone}</small></div></div> },
            { key: 'total', label: 'Amount', align: 'right', render: (o) => <><strong>{inr(o.total)}</strong><br /><small className="adm-muted">{o.items} item{o.items === 1 ? '' : 's'}</small></> },
            { key: 'payment_status', label: 'Payment', render: (o) => <Status value={o.payment_status} /> },
            { key: 'status', label: 'Fulfilment', render: (o) => <Status value={o.status} /> },
            { key: 'shipment_status', label: 'Shipping', render: (o) => <Status value={o.shipment_status} /> },
            { key: 'courier_name', label: 'Courier / AWB', render: (o) => (o.awb_code ? <><div>{o.courier_name || '—'}</div><small className="adm-mono adm-muted">{o.awb_code}</small></> : <span className="adm-muted">—</span>) },
          ]}
        />
      </Card>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </>
  );
}
