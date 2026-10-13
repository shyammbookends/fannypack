import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { downloadCsv, get, inr, qs } from '../api.js';
import { Btn, Card, DateRange, ErrorBox, PageHeader, Spinner, Status, Table, Tabs, useAsync, useUi } from '../ui.jsx';
import { Kpi } from './Dashboard.jsx';

// Report rows come back as arrays in column order
const toObjects = (r) => (r ? r.rows.map((row, n) => ({ _k: n, ...Object.fromEntries(r.columns.map((c, i) => [c, row[i]])) })) : []);

export default function Payments() {
  const [range, setRange] = useState({ range: '30d' });
  const [tab, setTab] = useState('payments');
  const navigate = useNavigate();
  const { toast } = useUi();
  const deps = [range.range, range.from, range.to];
  const pays = useAsync(() => get(`/reports/payments${qs(range)}`), deps);
  const refs = useAsync(() => get(`/reports/refunds${qs(range)}`), deps);
  const integ = useAsync(() => get('/integrations').catch(() => null), []);

  const p = toObjects(pays.data);
  const r = toObjects(refs.data);
  const captured = p.filter((x) => ['captured', 'paid'].includes(x.Status));
  const failed = p.filter((x) => x.Status === 'failed');
  const refunded = r.filter((x) => x.Status !== 'failed');
  const sum = (l, k) => l.reduce((s, x) => s + Number(x[k] || 0), 0);
  const rp = integ.data?.razorpay;

  const exportCsv = async () => {
    try {
      await downloadCsv(`/reports/${tab}${qs({ ...range, format: 'csv' })}`, `fannypack-${tab}.csv`);
    } catch (err) {
      toast(err.message, 'critical');
    }
  };

  return (
    <>
      <PageHeader title="Payments" subtitle="Online payments and refunds recorded by the store" actions={<><DateRange value={range} onChange={setRange} /><Btn icon="fa-file-arrow-down" onClick={exportCsv}>Export CSV</Btn></>} />
      {rp && rp.status !== 'connected' && (
        <div className="adm-alert warning">
          <i className="fas fa-triangle-exclamation" />
          <div>Razorpay is <strong>not connected</strong>. Customers can only use Cash on Delivery until you connect it.</div>
          <Link className="adm-btn sm" to="/admin/integrations"><span>Connect</span></Link>
        </div>
      )}
      {rp && rp.status === 'connected' && (
        <div className="adm-alert info">
          <i className="fas fa-circle-check" />
          <div>Razorpay connected ({rp.environment} mode){rp.enabled ? '' : ' but turned off at checkout'}. Webhook {rp.webhookSecretSet ? 'secret is set' : <strong>secret is not set</strong>}.</div>
        </div>
      )}
      <ErrorBox error={pays.error || refs.error} onRetry={() => { pays.reload(); refs.reload(); }} />
      {pays.loading && !pays.data ? <Spinner /> : (
        <>
          <div className="adm-kpis">
            <Kpi icon="fa-circle-check" label="Captured" value={inr(sum(captured, 'Amount'))} sub={`${captured.length} payment(s)`} />
            <Kpi icon="fa-circle-xmark" label="Failed" value={failed.length} sub="Attempts that did not go through" warn={failed.length > 0} />
            <Kpi icon="fa-rotate-left" label="Refunded" value={inr(sum(refunded, 'Amount'))} sub={`${refunded.length} refund(s)`} />
            <Kpi icon="fa-scale-balanced" label="Net received" value={inr(sum(captured, 'Amount') - sum(refunded, 'Amount'))} sub="Before Razorpay fees" />
          </div>
          <Tabs tabs={[{ key: 'payments', label: 'Payments', count: p.length }, { key: 'refunds', label: 'Refunds', count: r.length }]} value={tab} onChange={setTab} />
          <Card pad={false}>
            {tab === 'payments' ? (
              <Table
                rowKey="_k"
                rows={p}
                onRowClick={(x) => navigate(`/admin/orders/${x['Order ID']}`)}
                empty={<div className="adm-empty"><i className="fas fa-credit-card" /><h4>No online payments in this period</h4><p>COD orders appear under Orders.</p></div>}
                columns={[
                  { key: 'Date', label: 'Date' },
                  { key: 'Order ID', label: 'Order', render: (x) => <strong className="adm-mono">{x['Order ID']}</strong> },
                  { key: 'Payment ID', label: 'Payment ID', render: (x) => <span className="adm-mono">{x['Payment ID']}</span> },
                  { key: 'Method', label: 'Method', render: (x) => x.Method || x.Provider },
                  { key: 'Status', label: 'Status', render: (x) => <Status value={x.Status} /> },
                  { key: 'Error', label: 'Error', render: (x) => x.Error || '—' },
                  { key: 'Amount', label: 'Amount', align: 'right', render: (x) => inr(x.Amount) },
                ]}
              />
            ) : (
              <Table
                rowKey="_k"
                rows={r}
                onRowClick={(x) => navigate(`/admin/orders/${x['Order ID']}`)}
                empty={<div className="adm-empty"><i className="fas fa-rotate-left" /><h4>No refunds in this period</h4></div>}
                columns={[
                  { key: 'Date', label: 'Date' },
                  { key: 'Order ID', label: 'Order', render: (x) => <strong className="adm-mono">{x['Order ID']}</strong> },
                  { key: 'Refund ID', label: 'Refund ID', render: (x) => <span className="adm-mono">{x['Refund ID']}</span> },
                  { key: 'Reason', label: 'Reason' },
                  { key: 'By', label: 'By' },
                  { key: 'Status', label: 'Status', render: (x) => <Status value={x.Status} /> },
                  { key: 'Amount', label: 'Amount', align: 'right', render: (x) => inr(x.Amount) },
                ]}
              />
            )}
          </Card>
          {(pays.data?.total > 500 || refs.data?.total > 500) && <p className="adm-muted">Showing the first 500 rows. Export CSV for everything.</p>}
        </>
      )}
    </>
  );
}
