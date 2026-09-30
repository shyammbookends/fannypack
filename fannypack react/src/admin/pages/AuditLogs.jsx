import { useEffect, useState } from 'react';
import { fmtDate, get, qs, titleCase } from '../api.js';
import { Card, ErrorBox, Input, Modal, PageHeader, Pagination, Select, Table, useAsync } from '../ui.jsx';

const ENTITIES = ['', 'product', 'collection', 'order', 'customer', 'discount', 'inventory', 'content', 'settings', 'integration', 'webhook', 'admin', 'admin_user', 'admin_role', 'report'];

export default function AuditLogs() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading, reload } = useAsync(() => get(`/audit-logs${qs({ q: debounced, entity, page })}`), [debounced, entity, page]);

  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Every change made in the admin: who, what, when, and from where" />
      <div className="adm-toolbar">
        <Input placeholder="Search action, admin email or ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search logs" />
        <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} style={{ maxWidth: 200 }} aria-label="Area"
          options={ENTITIES.map((e) => ({ value: e, label: e ? titleCase(e) : 'All areas' }))} />
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <Card pad={false}>
        <Table
          loading={loading}
          rows={data?.items || []}
          onRowClick={setView}
          empty={<div className="adm-empty"><i className="fas fa-clipboard-list" /><h4>No log entries</h4></div>}
          columns={[
            { key: 'created_at', label: 'When', render: (l) => fmtDate(l.created_at) },
            { key: 'admin_email', label: 'Who', render: (l) => l.admin_email || <span className="adm-muted">System</span> },
            { key: 'action', label: 'Action', render: (l) => <span className="adm-mono">{l.action}</span> },
            { key: 'entity', label: 'Item', render: (l) => (l.entity ? `${titleCase(l.entity)}${l.entity_id ? ` #${l.entity_id}` : ''}` : '—') },
            { key: 'ip', label: 'IP', render: (l) => <span className="adm-mono">{l.ip || '—'}</span> },
          ]}
        />
      </Card>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      <Modal open={Boolean(view)} title={view?.action || ''} onClose={() => setView(null)} width={720}>
        {view && (
          <>
            <dl className="adm-kv">
              <dt>When</dt><dd>{fmtDate(view.created_at)}</dd>
              <dt>Who</dt><dd>{view.admin_email || 'System'}</dd>
              <dt>Item</dt><dd>{view.entity ? `${titleCase(view.entity)} ${view.entity_id || ''}` : '—'}</dd>
              <dt>IP</dt><dd className="adm-mono">{view.ip || '—'}</dd>
              <dt>Browser</dt><dd style={{ fontSize: 12 }}>{view.user_agent || '—'}</dd>
            </dl>
            <div className="adm-grid cols-2" style={{ marginTop: 12 }}>
              <div><h4 className="adm-section-title">Before</h4><pre className="adm-pre" style={{ maxHeight: 320, overflow: 'auto' }}>{view.before ? JSON.stringify(view.before, null, 2) : '—'}</pre></div>
              <div><h4 className="adm-section-title">After</h4><pre className="adm-pre" style={{ maxHeight: 320, overflow: 'auto' }}>{view.after ? JSON.stringify(view.after, null, 2) : '—'}</pre></div>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
