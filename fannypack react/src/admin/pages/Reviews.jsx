import { useState } from 'react';
import { del, fmtDate, get, put, qs } from '../api.js';
import { Btn, Card, ErrorBox, PageHeader, Pagination, Select, Status, Table, useAsync, useUi } from '../ui.jsx';

const stars = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

// Customer reviews: only shoppers whose order was delivered can write one
export default function Reviews() {
  const { toast, confirm } = useUi();
  const [status, setStatus] = useState('');
  const [rating, setRating] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => get(`/reviews${qs({ status, rating, page })}`), [status, rating, page]);

  const setVisibility = async (r, next) => {
    try {
      await put(`/reviews/${r.id}`, { status: next });
      toast(next === 'hidden' ? 'Review hidden from the shop' : 'Review published');
      reload();
    } catch (err) {
      toast(err.message, 'critical');
    }
  };
  const remove = async (r) => {
    if (!(await confirm({ title: 'Delete this review?', message: 'It is removed for good. Hiding it keeps it on record instead.', danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await del(`/reviews/${r.id}`);
      toast('Review deleted');
      reload();
    } catch (err) {
      toast(err.message, 'critical');
    }
  };

  return (
    <>
      <PageHeader title="Reviews" subtitle="Ratings from customers who received their order" />
      <div className="adm-toolbar">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ maxWidth: 200 }} aria-label="Status"
          options={[{ value: '', label: 'All reviews' }, { value: 'published', label: 'Published' }, { value: 'hidden', label: 'Hidden' }]} />
        <Select value={rating} onChange={(e) => { setRating(e.target.value); setPage(1); }} style={{ maxWidth: 160 }} aria-label="Rating"
          options={[{ value: '', label: 'Any rating' }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n > 1 ? 's' : ''}` }))]} />
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <Card pad={false}>
        <Table
          loading={loading}
          rows={data?.items || []}
          empty={<div className="adm-empty"><i className="fas fa-star" /><h4>No reviews yet</h4></div>}
          columns={[
            { key: 'created_at', label: 'Date', render: (r) => fmtDate(r.created_at, false) },
            { key: 'product', label: 'Product', render: (r) => <a href={`/product/${r.slug}`} target="_blank" rel="noreferrer">{r.product}</a> },
            { key: 'rating', label: 'Rating', render: (r) => <span style={{ color: '#f5a623', whiteSpace: 'nowrap' }} title={`${r.rating} / 5`}>{stars(r.rating)}</span> },
            {
              key: 'body', label: 'Review', render: (r) => (
                <div style={{ maxWidth: 420 }}>
                  {r.title && <strong>{r.title}</strong>}
                  {r.body && <div className="adm-muted" style={{ whiteSpace: 'pre-wrap' }}>{r.body}</div>}
                </div>
              ),
            },
            { key: 'customer', label: 'Customer', render: (r) => <>{r.customer}<div className="adm-muted" style={{ fontSize: 12 }}>{r.email}</div></> },
            { key: 'status', label: 'Status', render: (r) => <Status value={r.status === 'published' ? 'active' : 'archived'} label={r.status === 'published' ? 'Published' : 'Hidden'} /> },
            {
              key: 'x', label: '', align: 'right', render: (r) => (
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  {r.status === 'published'
                    ? <Btn size="sm" icon="fa-eye-slash" onClick={() => setVisibility(r, 'hidden')}>Hide</Btn>
                    : <Btn size="sm" icon="fa-eye" onClick={() => setVisibility(r, 'published')}>Publish</Btn>}
                  <Btn size="sm" variant="ghost" icon="fa-trash" onClick={() => remove(r)} aria-label="Delete" />
                </span>
              ),
            },
          ]}
        />
      </Card>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </>
  );
}
