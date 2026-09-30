import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fmtDate, get, inr, put, titleCase } from '../api.js';
import { Btn, Card, ErrorBox, PageHeader, Spinner, Status, Table, Textarea, useAsync, useUi } from '../ui.jsx';
import { Kpi } from './Dashboard.jsx';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast, confirm } = useUi();
  const { data, error, loading, reload } = useAsync(() => get(`/customers/${id}`), [id]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setNote(data.customer.admin_note || '');
  }, [data]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { customer: c, orders, addresses, payments, refunds, shipments, cart, timeline } = data;

  const update = async (patch, msg) => {
    setBusy(true);
    try {
      await put(`/customers/${id}`, patch);
      toast(msg);
      reload();
    } catch (err) {
      toast(err.message, 'critical');
    } finally {
      setBusy(false);
    }
  };
  const toggleBlock = async () => {
    const blocking = c.status !== 'blocked';
    if (blocking && !(await confirm({ title: `Block ${c.name}?`, message: 'They will be signed out and cannot sign in or order until unblocked.', danger: true, confirmLabel: 'Block' }))) return;
    update({ status: blocking ? 'blocked' : 'active' }, blocking ? 'Customer blocked' : 'Customer unblocked');
  };

  return (
    <>
      <PageHeader
        back={{ label: 'Customers', onClick: (e) => { e.preventDefault(); navigate('/admin/customers'); } }}
        title={<span className="adm-row">{c.name} <Status value={c.status} /></span>}
        subtitle={`Customer since ${fmtDate(c.created_at, false)}`}
        actions={<Btn variant={c.status === 'blocked' ? 'secondary' : 'danger'} icon={c.status === 'blocked' ? 'fa-unlock' : 'fa-ban'} loading={busy} onClick={toggleBlock}>{c.status === 'blocked' ? 'Unblock' : 'Block customer'}</Btn>}
      />
      <div className="adm-kpis">
        <Kpi icon="fa-indian-rupee-sign" label="Lifetime value" value={inr(c.spent)} />
        <Kpi icon="fa-bag-shopping" label="Orders" value={c.orders} />
        <Kpi icon="fa-receipt" label="Average order" value={inr(c.orders ? Math.round(c.spent / c.orders) : 0)} />
        <Kpi icon="fa-rotate-left" label="Refunded" value={inr(refunds.reduce((s, r) => s + (r.status !== 'failed' ? r.amount : 0), 0))} />
      </div>
      <div className="adm-grid main-side">
        <div className="adm-stack">
          <Card title="Orders" pad={false}>
            <Table
              rowKey="number"
              rows={orders}
              onRowClick={(o) => navigate(`/admin/orders/${o.number}`)}
              empty={<div className="adm-empty"><i className="fas fa-bag-shopping" /><h4>No orders yet</h4></div>}
              columns={[
                { key: 'number', label: 'Order', render: (o) => <strong className="adm-mono">{o.number}</strong> },
                { key: 'created_at', label: 'Date', render: (o) => fmtDate(o.created_at) },
                { key: 'payment_status', label: 'Payment', render: (o) => <Status value={o.payment_status} /> },
                { key: 'status', label: 'Status', render: (o) => <Status value={o.status} /> },
                { key: 'total', label: 'Total', align: 'right', render: (o) => inr(o.total) },
              ]}
            />
          </Card>
          <Card title="Payments" pad={false}>
            <Table
              rowKey="provider_payment_id"
              rows={payments}
              empty={<p className="adm-muted" style={{ padding: 16 }}>No payments recorded.</p>}
              columns={[
                { key: 'number', label: 'Order', render: (p) => <span className="adm-mono">{p.number}</span> },
                { key: 'provider_payment_id', label: 'Payment ID', render: (p) => <span className="adm-mono">{p.provider_payment_id}</span> },
                { key: 'method', label: 'Method', render: (p) => p.method || p.provider },
                { key: 'status', label: 'Status', render: (p) => <Status value={p.status} /> },
                { key: 'amount', label: 'Amount', align: 'right', render: (p) => inr(p.amount) },
              ]}
            />
          </Card>
          {shipments.length > 0 && (
            <Card title="Shipments" pad={false}>
              <Table
                rowKey="number"
                rows={shipments}
                columns={[
                  { key: 'number', label: 'Order', render: (s) => <span className="adm-mono">{s.number}</span> },
                  { key: 'courier_name', label: 'Courier' },
                  { key: 'awb_code', label: 'AWB', render: (s) => <span className="adm-mono">{s.awb_code || '—'}</span> },
                  { key: 'shipment_status', label: 'Status', render: (s) => <Status value={s.shipment_status} /> },
                  { key: 'tracking_url', label: '', render: (s) => (s.tracking_url ? <a href={s.tracking_url} target="_blank" rel="noreferrer" style={{ color: 'var(--series-1)' }}>Track</a> : null) },
                ]}
              />
            </Card>
          )}
          <Card title="Timeline">
            <ul className="adm-timeline">
              {timeline.map((t, i) => (
                <li key={i}>
                  <strong>{titleCase(t.status)}{t.number && <> · <Link to={`/admin/orders/${t.number}`} className="adm-mono" style={{ color: 'var(--series-1)' }}>{t.number}</Link></>}</strong>
                  {t.note && <span>{t.note}</span>}
                  <small>{fmtDate(t.created_at)}</small>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="adm-stack">
          <Card title="Profile">
            <dl className="adm-kv">
              <dt>Email</dt><dd>{c.email}</dd>
              <dt>Phone</dt><dd>{c.phone || '—'}</dd>
              <dt>Last sign in</dt><dd>{fmtDate(c.last_login_at)}</dd>
            </dl>
            <p className="adm-muted" style={{ fontSize: 12, marginTop: 10 }}>Passwords are never shown or stored in readable form.</p>
          </Card>
          <Card title="Addresses">
            {addresses.length ? addresses.map((a, i) => (
              <p key={i} style={{ marginBottom: 10 }}>{a.name} · {a.phone}<br />{a.address_line}<br />{a.city}, {a.state} {a.pin}</p>
            )) : <span className="adm-muted">No addresses yet.</span>}
          </Card>
          <Card title={`Cart (${cart.length})`}>
            {cart.length ? cart.map((x, i) => <div key={i} className="adm-sum"><span>{x.name}{x.option ? ` · ${x.option}` : ''}</span><span>× {x.qty}</span></div>) : <span className="adm-muted">Empty</span>}
          </Card>
          <Card title="Notes">
            <div className="adm-stack" style={{ gap: 8 }}>
              <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Private notes about this customer" />
              {note !== (c.admin_note || '') && <Btn size="sm" variant="primary" loading={busy} onClick={() => update({ admin_note: note }, 'Note saved')}>Save note</Btn>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
