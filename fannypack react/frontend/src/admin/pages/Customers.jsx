import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fmtDate, get, inr, qs } from '../api.js';
import { Card, ErrorBox, Input, PageHeader, Pagination, Select, Status, Table, useAsync } from '../ui.jsx';

export default function Customers() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(params.get('q') || '');
  const sort = params.get('sort') || 'recent';
  const status = params.get('status') || '';
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
  const { data, error, loading, reload } = useAsync(() => get(`/customers${qs({ q: params.get('q'), sort, status, page })}`), [params.get('q'), sort, status, page]);

  return (
    <>
      <PageHeader title="Customers" subtitle="People with an account on the store" />
      <div className="adm-toolbar">
        <Input placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
        <Select value={sort} onChange={(e) => set({ sort: e.target.value, page: '' })} style={{ maxWidth: 200 }} aria-label="Sort"
          options={[{ value: 'recent', label: 'Newest first' }, { value: 'spent', label: 'Top spenders' }, { value: 'orders', label: 'Most orders' }, { value: 'last_order', label: 'Recent buyers' }]} />
        <Select value={status} onChange={(e) => set({ status: e.target.value, page: '' })} style={{ maxWidth: 160 }} aria-label="Status"
          options={[{ value: '', label: 'All' }, { value: 'blocked', label: 'Blocked' }]} />
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <Card pad={false}>
        <Table
          loading={loading}
          rows={data?.items || []}
          onRowClick={(c) => navigate(`/admin/customers/${c.id}`)}
          empty={<div className="adm-empty"><i className="fas fa-users" /><h4>No customers yet</h4></div>}
          columns={[
            { key: 'name', label: 'Customer', render: (c) => <div className="adm-cell-main"><span className="adm-avatar">{c.name.slice(0, 1).toUpperCase()}</span><div><strong>{c.name}</strong><small>{c.email}</small></div></div> },
            { key: 'phone', label: 'Phone', render: (c) => c.phone || '—' },
            { key: 'orders', label: 'Orders', align: 'right' },
            { key: 'spent', label: 'Total spent', align: 'right', render: (c) => <strong>{inr(c.spent)}</strong> },
            { key: 'last_order', label: 'Last order', render: (c) => fmtDate(c.last_order, false) },
            { key: 'created_at', label: 'Registered', render: (c) => fmtDate(c.created_at, false) },
            { key: 'status', label: 'Status', render: (c) => <Status value={c.status} /> },
          ]}
        />
      </Card>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </>
  );
}
