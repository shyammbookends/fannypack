import { useState } from 'react';
import { get, inr, qs } from '../api.js';
import { Card, DateRange, ErrorBox, PageHeader, Spinner, useAsync } from '../ui.jsx';
import { BarList, compactInr, TimeChart } from '../charts.jsx';

function Metric({ label, value, cur, prev, format = (v) => v, invert }) {
  let delta = null;
  if (prev > 0) delta = Math.round(((cur - prev) / prev) * 100);
  else if (cur > 0) delta = null;
  const up = delta != null && delta > 0;
  const good = delta == null || delta === 0 ? null : invert ? !up : up;
  return (
    <div className="adm-kpi">
      <span>{label}</span>
      <strong>{format(value)}</strong>
      <small>
        {delta == null ? (prev === 0 && cur > 0 ? 'New this period' : 'No change') : (
          <span style={{ color: good ? 'var(--good-ink)' : 'var(--critical)' }}>
            <i className={`fas ${up ? 'fa-arrow-up' : delta < 0 ? 'fa-arrow-down' : 'fa-minus'}`} /> {Math.abs(delta)}%
          </span>
        )}{' '}
        vs previous period ({format(prev)})
      </small>
    </div>
  );
}

export default function Analytics() {
  const [range, setRange] = useState({ range: '30d' });
  const { data, error, loading, reload } = useAsync(() => get(`/analytics${qs(range)}`), [range.range, range.from, range.to]);
  const c = data?.current;
  const p = data?.previous;
  const n = (v) => Number(v || 0).toLocaleString('en-IN');

  return (
    <>
      <PageHeader title="Analytics" subtitle="How the store is doing compared with the period before" actions={<DateRange value={range} onChange={setRange} />} />
      <ErrorBox error={error} onRetry={reload} />
      {!data && loading && <Spinner />}
      {data && (
        <>
          <div className="adm-kpis">
            <Metric label="Revenue" value={c.revenue} cur={c.revenue} prev={p.revenue} format={inr} />
            <Metric label="Orders" value={c.orders} cur={c.orders} prev={p.orders} format={n} />
            <Metric label="Average order value" value={c.aov} cur={c.aov} prev={p.aov} format={inr} />
            <Metric label="Customers who ordered" value={c.customers} cur={c.customers} prev={p.customers} format={n} />
            <Metric label="Discounts given" value={c.discounts} cur={c.discounts} prev={p.discounts} format={inr} invert />
            <Metric label="Shipping charged" value={c.shipping} cur={c.shipping} prev={p.shipping} format={inr} />
            <div className="adm-kpi"><span>New vs returning customers</span><strong>{n(c.new_customers)} / {n(c.returning_customers)}</strong><small>First order this period / ordered before</small></div>
            <div className="adm-kpi"><span>Refunds</span><strong>{inr(c.refunds)}</strong><small>{c.refund_count} refund(s)</small></div>
          </div>
          <div className="adm-grid cols-2" style={{ marginBottom: 16 }}>
            <Card title="Revenue">
              <TimeChart data={data.series} valueKey="revenue" bucket={data.range.bucket} format={inr} axisFormat={compactInr} caption="Revenue over time" />
            </Card>
            <Card title="Orders">
              <TimeChart data={data.series} valueKey="orders" bucket={data.range.bucket} kind="bar" format={(v) => `${v} order${v === 1 ? '' : 's'}`} axisFormat={(v) => Math.round(v)} caption="Orders over time" />
            </Card>
          </div>
          <div className="adm-grid cols-2" style={{ marginBottom: 16 }}>
            <Card title="Top products">
              <BarList rows={data.byProduct.map((x) => ({ label: x.name, value: x.revenue, sub: `${x.qty} sold` }))} format={inr} />
            </Card>
            <Card title="Collections">
              <BarList rows={data.byCollection.map((x) => ({ label: x.name, value: x.revenue, sub: `${x.qty} sold` }))} format={inr} />
            </Card>
          </div>
          <Card title="Not measured yet">
            <ul style={{ margin: 0, paddingLeft: 18 }} className="adm-muted">
              {Object.values(data.notes).map((t) => <li key={t}>{t}</li>)}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
