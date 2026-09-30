import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, inr, qs, fmtDate } from '../api.js';
import { Card, DateRange, ErrorBox, PageHeader, Spinner, Status, Table, useAsync } from '../ui.jsx';
import { BarList, compactInr, StatusBreakdown, TimeChart } from '../charts.jsx';

export const PAY_TONE = { paid: 'good', cod: 'neutral', pending: 'warning', failed: 'critical', refunded: 'serious' };
export const PAY_LABEL = { paid: 'Paid', cod: 'Cash on Delivery', pending: 'Pending', failed: 'Failed', refunded: 'Refunded' };
export const SHIP_TONE = {
  not_shipped: 'neutral', processing: 'warning', pickup_scheduled: 'warning', shipped: 'info', in_transit: 'info',
  out_for_delivery: 'info', delivered: 'good', delayed: 'serious', rto: 'serious', rto_delivered: 'serious', lost: 'critical', cancelled: 'critical',
};
export const SHIP_LABEL = (k) =>
  ({ not_shipped: 'Not shipped yet', pickup_scheduled: 'Pickup scheduled', in_transit: 'In transit', out_for_delivery: 'Out for delivery', rto: 'RTO', rto_delivered: 'RTO delivered' }[k] ||
  String(k).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));

export function Kpi({ icon, label, value, sub, to, warn }) {
  const inner = (
    <>
      <span><i className={`fas ${icon}`} />{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </>
  );
  return to ? <Link to={to} className={`adm-kpi ${warn ? 'warn' : ''}`}>{inner}</Link> : <div className={`adm-kpi ${warn ? 'warn' : ''}`}>{inner}</div>;
}

export default function Dashboard() {
  const [range, setRange] = useState({ range: '30d' });
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => get(`/dashboard${qs(range)}`), [range.range, range.from, range.to]);
  const c = data?.cards;
  const label = { today: 'today', yesterday: 'yesterday', '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days', year: 'this year', custom: 'selected dates' }[range.range];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live numbers from your store" actions={<DateRange value={range} onChange={setRange} />} />
      <ErrorBox error={error} onRetry={reload} />
      {!data && loading && <Spinner />}
      {data && (
        <>
          <div className="adm-kpis">
            <Kpi icon="fa-indian-rupee-sign" label="Total sales" value={inr(c.total_sales)} sub="All time" />
            <Kpi icon="fa-sun" label="Today's sales" value={inr(c.today_sales)} />
            <Kpi icon="fa-chart-simple" label="Sales" value={inr(c.range_sales)} sub={label} />
            <Kpi icon="fa-bag-shopping" label="Orders" value={c.range_orders} sub={label} to="/admin/orders" />
            <Kpi icon="fa-hourglass-half" label="Pending orders" value={c.pending_orders} sub="Waiting to ship" to="/admin/orders?filter=pending" warn={c.pending_orders > 0} />
            <Kpi icon="fa-circle-check" label="Delivered" value={c.delivered_orders} sub={label} to="/admin/orders?filter=delivered" />
            <Kpi icon="fa-truck-fast" label="Pending deliveries" value={c.pending_deliveries} sub="Shipped, not delivered" to="/admin/shipping" />
            <Kpi icon="fa-users" label="Customers" value={c.customers} to="/admin/customers" />
            <Kpi icon="fa-tag" label="Active products" value={c.products} to="/admin/products" />
            <Kpi icon="fa-triangle-exclamation" label="Low stock" value={c.low_stock} sub="Variants at / below threshold" to="/admin/inventory?filter=low" warn={c.low_stock > 0} />
          </div>

          <div className="adm-grid cols-2" style={{ marginBottom: 16 }}>
            <Card title="Sales over time" subtitle={label}>
              <TimeChart data={data.series} valueKey="revenue" bucket={data.range.bucket} format={inr} axisFormat={compactInr} caption="Sales over time" />
            </Card>
            <Card title="Orders over time" subtitle={label}>
              <TimeChart data={data.series} valueKey="orders" bucket={data.range.bucket} kind="bar" format={(v) => `${v} order${v === 1 ? '' : 's'}`} axisFormat={(v) => Math.round(v)} caption="Orders over time" />
            </Card>
          </div>

          <div className="adm-grid cols-2" style={{ marginBottom: 16 }}>
            <Card title="Revenue by product" subtitle={label}>
              <BarList rows={data.byProduct.map((p) => ({ label: p.name, value: p.revenue, sub: `${p.qty} sold` }))} format={inr} />
            </Card>
            <Card title="Revenue by collection" subtitle={label}>
              <BarList rows={data.byCollection.map((p) => ({ label: p.name, value: p.revenue, sub: `${p.qty} sold` }))} format={inr} />
            </Card>
          </div>

          <div className="adm-grid cols-2" style={{ marginBottom: 16 }}>
            <Card title="Payment status" subtitle={`Orders placed ${label}`}>
              <StatusBreakdown rows={data.paymentStatus} toneOf={(k) => PAY_TONE[k] || 'neutral'} labelOf={(k) => PAY_LABEL[k] || k} />
            </Card>
            <Card title="Shipping status" subtitle={`Orders placed ${label}`}>
              <StatusBreakdown rows={data.shippingStatus} toneOf={(k) => SHIP_TONE[k] || 'neutral'} labelOf={SHIP_LABEL} />
            </Card>
          </div>

          <Card title="Recent orders" actions={<Link className="adm-btn sm" to="/admin/orders"><span>View all</span></Link>} pad={false}>
            <Table
              rowKey="number"
              rows={data.recentOrders}
              onRowClick={(o) => navigate(`/admin/orders/${o.number}`)}
              empty={<div className="adm-empty"><i className="fas fa-bag-shopping" /><h4>No orders yet</h4><p>New orders will show up here.</p></div>}
              columns={[
                { key: 'number', label: 'Order', render: (o) => <strong className="adm-mono">{o.number}</strong> },
                { key: 'name', label: 'Customer' },
                { key: 'created_at', label: 'Date', render: (o) => fmtDate(o.created_at) },
                { key: 'payment_status', label: 'Payment', render: (o) => <Status value={o.payment_status} /> },
                { key: 'status', label: 'Status', render: (o) => <Status value={o.status} /> },
                { key: 'total', label: 'Total', align: 'right', render: (o) => inr(o.total) },
              ]}
            />
          </Card>
        </>
      )}
    </>
  );
}
