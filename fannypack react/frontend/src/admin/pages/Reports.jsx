import { useState } from 'react';
import { downloadCsv, get, qs } from '../api.js';
import { Btn, Card, DateRange, ErrorBox, PageHeader, Spinner, useAsync, useUi } from '../ui.jsx';

const ICONS = {
  sales_daily: 'fa-calendar-day', sales_weekly: 'fa-calendar-week', sales_monthly: 'fa-calendar', orders: 'fa-bag-shopping',
  products: 'fa-tag', collections: 'fa-layer-group', customers: 'fa-users', payments: 'fa-credit-card', refunds: 'fa-rotate-left',
  shipping: 'fa-truck', delivery: 'fa-circle-check',
};

export default function Reports() {
  const [range, setRange] = useState({ range: '30d' });
  const [key, setKey] = useState('sales_daily');
  const [busy, setBusy] = useState(false);
  const { toast } = useUi();
  const list = useAsync(() => get('/reports'), []);
  const rep = useAsync(() => get(`/reports/${key}${qs(range)}`), [key, range.range, range.from, range.to]);

  const exportCsv = async () => {
    setBusy(true);
    try {
      await downloadCsv(`/reports/${key}${qs({ ...range, format: 'csv' })}`, `fannypack-${key}.csv`);
    } catch (err) {
      toast(err.message, 'critical');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Reports" subtitle="Preview a report, then download it as CSV (opens in Excel / Google Sheets)" actions={<DateRange value={range} onChange={setRange} />} />
      <ErrorBox error={list.error} onRetry={list.reload} />
      <div className="adm-grid main-side" style={{ gridTemplateColumns: '240px minmax(0,1fr)' }}>
        <Card pad={false}>
          <nav className="adm-report-nav">
            {(list.data || []).map((r) => (
              <button key={r.key} className={key === r.key ? 'on' : ''} onClick={() => setKey(r.key)}>
                <i className={`fas ${ICONS[r.key] || 'fa-file'}`} />{r.title}
              </button>
            ))}
          </nav>
        </Card>
        <Card
          title={rep.data?.title || 'Report'}
          subtitle={rep.data ? `${rep.data.total} row(s)${rep.data.total > 500 ? ' · preview shows the first 500' : ''}` : ''}
          actions={<Btn variant="primary" icon="fa-file-arrow-down" loading={busy} disabled={!rep.data?.total} onClick={exportCsv}>Download CSV</Btn>}
          pad={false}
        >
          <ErrorBox error={rep.error} onRetry={rep.reload} />
          {rep.loading && !rep.data ? <Spinner /> : rep.data && (
            rep.data.rows.length ? (
              <div className="adm-table-wrap" style={{ maxHeight: 560 }}>
                <table className="adm-table">
                  <thead><tr>{rep.data.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>
                    {rep.data.rows.map((row, i) => (
                      <tr key={i}>{row.map((v, j) => <td key={j} style={{ whiteSpace: 'nowrap' }}>{v ?? '—'}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="adm-empty"><i className="fas fa-file-circle-question" /><h4>No data for these dates</h4></div>
          )}
        </Card>
      </div>
    </>
  );
}
