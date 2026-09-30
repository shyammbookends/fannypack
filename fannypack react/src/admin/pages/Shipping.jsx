import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fmtDate, get, post, qs } from '../api.js';
import { Btn, Card, ErrorBox, PageHeader, Pagination, Status, Table, Tabs, useAsync, useUi } from '../ui.jsx';
import { Kpi } from './Dashboard.jsx';

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'delayed', label: 'Delayed' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'rto', label: 'RTO' },
  { key: 'errors', label: 'Errors' },
];

export default function Shipping() {
  const [tab, setTab] = useState('active');
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState('');
  const navigate = useNavigate();
  const { toast } = useUi();
  const { data, error, loading, reload } = useAsync(() => get(`/shipping/overview${qs({ tab, page })}`), [tab, page]);
  const integ = useAsync(() => get('/integrations').catch(() => null), []);
  const sr = integ.data?.shiprocket;
  const c = data?.cards;

  const sync = async (number) => {
    setSyncing(number);
    try {
      await post(`/orders/${number}/shipment/sync`);
      toast('Tracking updated');
      reload();
    } catch (err) {
      toast(err.message, 'critical');
    } finally {
      setSyncing('');
    }
  };

  return (
    <>
      <PageHeader title="Shipping" subtitle="Shipments across all orders. Tracking refreshes every 30 minutes and on every Shiprocket webhook." />
      {sr && sr.status !== 'connected' && (
        <div className="adm-alert warning">
          <i className="fas fa-triangle-exclamation" />
          <div>Shiprocket is <strong>not connected</strong>. You can still add courier and AWB details by hand on each order.</div>
          <Link className="adm-btn sm" to="/admin/integrations"><span>Connect</span></Link>
        </div>
      )}
      {c && (
        <div className="adm-kpis">
          <Kpi icon="fa-box" label="To ship" value={c.processing} warn={c.processing > 0} />
          <Kpi icon="fa-truck" label="In transit" value={c.shipped} />
          <Kpi icon="fa-truck-fast" label="Out for delivery" value={c.out_for_delivery} />
          <Kpi icon="fa-circle-check" label="Delivered" value={c.delivered} />
          <Kpi icon="fa-clock" label="Delayed" value={c.delayed} warn={c.delayed > 0} />
          <Kpi icon="fa-rotate-left" label="RTO" value={c.rto} warn={c.rto > 0} />
          <Kpi icon="fa-ban" label="Cancelled after shipping" value={c.cancelled} />
          <Kpi icon="fa-boxes-packing" label="Shipments created" value={c.total} />
        </div>
      )}
      <Tabs tabs={TABS} value={tab} onChange={(t) => { setTab(t); setPage(1); }} />
      <ErrorBox error={error} onRetry={reload} />
      <Card pad={false}>
        <Table
          rowKey="number"
          loading={loading}
          rows={data?.items || []}
          onRowClick={(o) => navigate(`/admin/orders/${o.number}`)}
          empty={<div className="adm-empty"><i className="fas fa-truck-fast" /><h4>Nothing here</h4></div>}
          columns={[
            { key: 'number', label: 'Order', render: (o) => <div><strong className="adm-mono">{o.number}</strong><small className="adm-muted" style={{ display: 'block' }}>{fmtDate(o.created_at, false)}</small></div> },
            { key: 'name', label: 'Customer', render: (o) => <>{o.name}<small className="adm-muted" style={{ display: 'block' }}>{o.city}</small></> },
            { key: 'courier', label: 'Courier / AWB', render: (o) => (o.awb_code ? <>{o.courier_name || '—'}<small className="adm-mono" style={{ display: 'block' }}>{o.awb_code}</small></> : <span className="adm-muted">Not assigned</span>) },
            { key: 'shipment_status', label: 'Shipment', render: (o) => (o.fulfilment_error ? <Status value="error" label="Error" /> : <Status value={o.shipment_status || 'not_shipped'} />) },
            { key: 'expected_delivery', label: 'Expected', render: (o) => fmtDate(o.expected_delivery, false) },
            { key: 'synced', label: 'Last update', render: (o) => (o.fulfilment_error ? <span style={{ color: 'var(--critical)' }}>{o.fulfilment_error}</span> : fmtDate(o.shipping_synced_at)) },
            { key: 'x', label: '', align: 'right', render: (o) => (
              <span onClick={(e) => e.stopPropagation()} className="adm-row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                {o.tracking_url && <a className="adm-btn sm ghost" href={o.tracking_url} target="_blank" rel="noreferrer"><span>Track</span></a>}
                {o.awb_code && sr?.status === 'connected' && <Btn size="sm" icon="fa-rotate" loading={syncing === o.number} onClick={() => sync(o.number)} aria-label="Refresh tracking" />}
              </span>
            ) },
          ]}
        />
      </Card>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </>
  );
}
