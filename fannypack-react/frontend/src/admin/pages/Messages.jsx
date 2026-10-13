import { useState } from 'react';
import { del, fmtDate, get, put, qs } from '../api.js';
import { Btn, Card, ErrorBox, Modal, PageHeader, Pagination, Status, Table, Tabs, useAsync, useUi } from '../ui.jsx';

const TOPIC = { order: 'Order', product: 'Product', wholesale: 'Wholesale', collab: 'Collaboration', other: 'Other' };
const STATUS_LOOK = { new: ['pending', 'New'], read: ['archived', 'Read'], replied: ['active', 'Replied'], spam: ['failed', 'Spam'] };

// Messages sent from the website's Contact page
export default function Messages() {
  const { toast, confirm } = useUi();
  const [tab, setTab] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState(null);
  const { data, error, loading, reload } = useAsync(() => get(`/messages${qs({ status: tab, page })}`), [tab, page]);
  const c = data?.counts || {};

  const setStatus = async (m, status, quiet) => {
    try {
      await put(`/messages/${m.id}`, { status });
      if (!quiet) toast(status === 'replied' ? 'Marked as replied' : status === 'spam' ? 'Marked as spam' : 'Updated');
      reload();
    } catch (err) {
      toast(err.message, 'critical');
    }
  };
  const open = (m) => {
    setView(m);
    if (m.status === 'new') setStatus(m, 'read', true);
  };
  const remove = async (m) => {
    if (!(await confirm({ title: 'Delete this message?', message: 'It is removed for good.', danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await del(`/messages/${m.id}`);
      toast('Message deleted');
      setView(null);
      reload();
    } catch (err) {
      toast(err.message, 'critical');
    }
  };
  const replyLink = (m) =>
    `mailto:${m.email}?subject=${encodeURIComponent(`Re: your message to Bookends Fanny Pack${m.order_number ? ` (${m.order_number})` : ''}`)}&body=${encodeURIComponent(`Hi ${m.name.split(' ')[0]},\n\n\n\n> ${m.message.replace(/\n/g, '\n> ')}`)}`;

  return (
    <>
      <PageHeader title="Messages" subtitle="What customers sent from the Contact page" />
      <Tabs
        tabs={[
          { key: '', label: 'All' },
          { key: 'new', label: `New${c.new ? ` (${c.new})` : ''}` },
          { key: 'read', label: 'Read' },
          { key: 'replied', label: 'Replied' },
          { key: 'spam', label: 'Spam' },
        ]}
        value={tab}
        onChange={(t) => { setTab(t); setPage(1); }}
      />
      <ErrorBox error={error} onRetry={reload} />
      <Card pad={false}>
        <Table
          loading={loading}
          rows={data?.items || []}
          onRowClick={open}
          empty={<div className="adm-empty"><i className="fas fa-envelope" /><h4>No messages yet</h4></div>}
          columns={[
            { key: 'created_at', label: 'Received', render: (m) => fmtDate(m.created_at) },
            { key: 'name', label: 'From', render: (m) => <><strong>{m.name}</strong><div className="adm-muted" style={{ fontSize: 12 }}>{m.email}</div></> },
            { key: 'topic', label: 'About', render: (m) => <>{TOPIC[m.topic] || m.topic}{m.order_number && <div className="adm-mono" style={{ fontSize: 12 }}>{m.order_number}</div>}</> },
            { key: 'message', label: 'Message', render: (m) => <span style={{ display: 'block', maxWidth: 380, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.message}</span> },
            { key: 'status', label: 'Status', render: (m) => <Status value={STATUS_LOOK[m.status][0]} label={STATUS_LOOK[m.status][1]} /> },
          ]}
        />
      </Card>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}

      <Modal
        open={Boolean(view)}
        title={view ? `${view.name} - ${TOPIC[view.topic] || view.topic}` : ''}
        onClose={() => setView(null)}
        width={640}
        footer={view && (
          <>
            <Btn variant="ghost" icon="fa-trash" onClick={() => remove(view)}>Delete</Btn>
            <Btn icon="fa-ban" onClick={() => { setStatus(view, 'spam'); setView(null); }}>Spam</Btn>
            <a className="adm-btn primary" href={replyLink(view)} onClick={() => setStatus(view, 'replied', true)}><i className="fas fa-reply" /> Reply by email</a>
          </>
        )}
      >
        {view && (
          <>
            <dl className="adm-kv">
              <dt>Received</dt><dd>{fmtDate(view.created_at)}</dd>
              <dt>Email</dt><dd><a href={`mailto:${view.email}`}>{view.email}</a></dd>
              {view.phone && <><dt>Phone</dt><dd><a href={`tel:${view.phone}`}>{view.phone}</a></dd></>}
              {view.order_number && <><dt>Order</dt><dd><a href={`/admin/orders/${view.order_number}`}>{view.order_number}</a></dd></>}
              <dt>Signed in</dt><dd>{view.user_id ? `Yes (customer #${view.user_id})` : 'No'}</dd>
            </dl>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: 14, lineHeight: 1.6 }}>{view.message}</p>
          </>
        )}
      </Modal>
    </>
  );
}
