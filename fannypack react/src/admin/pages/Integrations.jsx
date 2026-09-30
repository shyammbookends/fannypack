import { useState } from 'react';
import { del, fmtDate, get, post, put, qs } from '../api.js';
import { Btn, Card, ErrorBox, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Status, Table, Toggle, useAsync, useUi } from '../ui.jsx';

function Copy({ text }) {
  const { toast } = useUi();
  return (
    <div className="adm-code">
      <span className="adm-mono">{text}</span>
      <Btn size="sm" variant="ghost" icon="fa-copy" aria-label="Copy" onClick={() => navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => toast('Copy failed', 'critical'))} />
    </div>
  );
}

function StatusLine({ status }) {
  if (status === 'connected') return <Status value="connected" label="Connected" />;
  if (status === 'error') return <Status value="error" label="Connection error" />;
  return <Status value="disconnected" label="NOT CONNECTED" />;
}

function Razorpay({ rp, reload }) {
  const { toast, confirm } = useUi();
  const [f, setF] = useState({ keyId: '', keySecret: '', webhookSecret: '' });
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(rp.status !== 'connected' || rp.source === 'env');
  const run = async (name, fn) => {
    setBusy(name);
    try {
      const r = await fn();
      if (r?.message) toast(r.message);
      reload();
    } catch (err) {
      toast(err.message, 'critical');
      reload();
    } finally {
      setBusy('');
    }
  };
  const save = () => run('save', async () => {
    const r = await put('/integrations/razorpay', { ...f, enabled: true });
    setF({ keyId: '', keySecret: '', webhookSecret: '' });
    setEditing(false);
    return r;
  });
  const disconnect = async () => {
    if (!(await confirm({ title: 'Disconnect Razorpay?', message: 'Saved keys are deleted. Customers will only be able to pay by COD.', danger: true, confirmLabel: 'Disconnect' }))) return;
    run('del', () => del('/integrations/razorpay'));
  };
  return (
    <Card>
      <div className="adm-int-head">
        <span className="adm-int-logo" style={{ background: '#072654', color: '#fff' }}><i className="fas fa-credit-card" /></span>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0 }}>Razorpay</h3>
          <small className="adm-muted">Online payments: UPI, cards, netbanking, wallets</small>
        </div>
        <StatusLine status={rp.status} />
      </div>
      {rp.status === 'connected' && (
        <dl className="adm-kv" style={{ marginTop: 14 }}>
          <dt>Mode</dt><dd>{rp.environment === 'live' ? <strong>Live</strong> : 'Test'}</dd>
          <dt>Key ID</dt><dd className="adm-mono">{rp.keyId}</dd>
          <dt>Key Secret</dt><dd className="adm-mono">{rp.keySecret || '—'}</dd>
          <dt>Webhook secret</dt><dd>{rp.webhookSecretSet ? 'Set' : <span style={{ color: 'var(--critical)' }}>Not set</span>}</dd>
          <dt>Saved in</dt><dd>{rp.source === 'env' ? '.env file on the server' : 'Admin (encrypted)'}</dd>
          <dt>Last checked</dt><dd>{fmtDate(rp.lastCheckedAt)}</dd>
        </dl>
      )}
      {rp.lastError && <div className="adm-alert critical" style={{ marginTop: 12 }}><i className="fas fa-circle-xmark" /><div>{rp.lastError}</div></div>}
      {rp.unreadable && <div className="adm-alert critical" style={{ marginTop: 12 }}><i className="fas fa-key" /><div>Saved keys cannot be decrypted (ENCRYPTION_KEY changed). Enter them again.</div></div>}
      {rp.status === 'connected' && rp.source === 'admin' && (
        <div style={{ marginTop: 12 }}>
          <Toggle checked={rp.enabled} onChange={(v) => run('en', () => post('/integrations/razorpay/enabled', { enabled: v }))} label="Show online payment at checkout" />
        </div>
      )}
      {editing ? (
        <div className="adm-stack" style={{ marginTop: 16 }}>
          <p className="adm-muted" style={{ margin: 0 }}>Razorpay Dashboard → Account &amp; Settings → API Keys. Keys are tested before saving and stored encrypted; they are never sent back to the browser.</p>
          <Field label="Key ID"><Input value={f.keyId} onChange={(e) => setF({ ...f, keyId: e.target.value.trim() })} placeholder="rzp_test_… or rzp_live_…" autoComplete="off" /></Field>
          <Field label="Key Secret" hint={rp.status === 'connected' && rp.source === 'admin' ? 'Leave empty to keep the saved secret.' : ''}><Input type="password" value={f.keySecret} onChange={(e) => setF({ ...f, keySecret: e.target.value.trim() })} autoComplete="new-password" /></Field>
          <Field label="Webhook secret" hint="The secret you type when creating the webhook in Razorpay. Leave empty to keep the saved one."><Input type="password" value={f.webhookSecret} onChange={(e) => setF({ ...f, webhookSecret: e.target.value.trim() })} autoComplete="new-password" /></Field>
          <div className="adm-row">
            <Btn variant="primary" icon="fa-plug" loading={busy === 'save'} disabled={!f.keyId} onClick={save}>Test &amp; save</Btn>
            {rp.status === 'connected' && <Btn onClick={() => setEditing(false)}>Cancel</Btn>}
          </div>
        </div>
      ) : (
        <div className="adm-row" style={{ marginTop: 16 }}>
          <Btn icon="fa-vial" loading={busy === 'test'} onClick={() => run('test', () => post('/integrations/razorpay/test'))}>Test connection</Btn>
          <Btn icon="fa-pen" onClick={() => setEditing(true)}>Update keys</Btn>
          {rp.source === 'admin' && <Btn variant="danger" icon="fa-link-slash" loading={busy === 'del'} onClick={disconnect}>Disconnect</Btn>}
        </div>
      )}
      <h4 className="adm-section-title" style={{ marginTop: 20 }}>Webhook</h4>
      <p className="adm-muted" style={{ margin: '0 0 6px' }}>Razorpay Dashboard → Webhooks → Add. URL:</p>
      <Copy text={rp.webhook.url} />
      <p className="adm-muted" style={{ margin: '8px 0 4px' }}>Active events: {rp.webhook.events.join(', ')}</p>
      <p style={{ margin: 0 }}>
        {rp.webhook.total ? <>Last event: <strong>{rp.webhook.last?.event_type}</strong> · <Status value={rp.webhook.last?.processing_status} /> · {fmtDate(rp.webhook.last?.received_at)}</> : <span className="adm-muted">No webhook received yet.</span>}
        {rp.webhook.failed > 0 && <span style={{ color: 'var(--critical)' }}> · {rp.webhook.failed} failed</span>}
      </p>
    </Card>
  );
}

function Shiprocket({ sr, reload }) {
  const { toast, confirm } = useUi();
  const [f, setF] = useState({
    email: '', password: '', pickupLocation: sr.pickupLocation, autoCreate: sr.autoCreate, autoCreateCod: sr.autoCreateCod,
    autoAwb: sr.autoAwb, autoPickup: sr.autoPickup, defaults: sr.defaults,
  });
  const [busy, setBusy] = useState('');
  const [token, setToken] = useState('');
  const connected = sr.status === 'connected' || Boolean(sr.email);
  const run = async (name, fn) => {
    setBusy(name);
    try {
      const r = await fn();
      if (r?.message) toast(r.message);
      reload();
      return r;
    } catch (err) {
      toast(err.message, 'critical');
      reload();
    } finally {
      setBusy('');
    }
  };
  const save = () => run('save', async () => {
    const r = await put('/integrations/shiprocket', f);
    setF((x) => ({ ...x, email: '', password: '' }));
    return r;
  });
  const disconnect = async () => {
    if (!(await confirm({ title: 'Disconnect Shiprocket?', message: 'Saved login and tokens are deleted. Existing shipments keep their AWB numbers.', danger: true, confirmLabel: 'Disconnect' }))) return;
    run('del', () => del('/integrations/shiprocket'));
  };
  const newToken = async () => {
    if (sr.webhook.tokenSet && !(await confirm({ title: 'Create a new webhook token?', message: 'The old token stops working. Paste the new one into Shiprocket.', confirmLabel: 'Create' }))) return;
    const r = await run('token', () => post('/integrations/shiprocket/webhook-token'));
    if (r?.token) setToken(r.token);
  };
  const d = (k, v) => setF({ ...f, defaults: { ...f.defaults, [k]: Number(v) || 0 } });

  return (
    <Card>
      <div className="adm-int-head">
        <span className="adm-int-logo" style={{ background: '#6c2bd9', color: '#fff' }}><i className="fas fa-truck-fast" /></span>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0 }}>Shiprocket</h3>
          <small className="adm-muted">Create shipments, assign couriers and AWB, schedule pickups, track deliveries</small>
        </div>
        <StatusLine status={sr.status} />
      </div>
      {connected && (
        <dl className="adm-kv" style={{ marginTop: 14 }}>
          <dt>API user</dt><dd>{sr.email || '—'}</dd>
          <dt>Password</dt><dd>{sr.passwordSet ? '••••••••' : '—'}</dd>
          <dt>Token</dt><dd>{sr.tokenSet ? `Valid until ${fmtDate(sr.tokenExpires)}` : 'None'}</dd>
          <dt>Last checked</dt><dd>{fmtDate(sr.lastCheckedAt)}</dd>
        </dl>
      )}
      {sr.lastError && <div className="adm-alert critical" style={{ marginTop: 12 }}><i className="fas fa-circle-xmark" /><div>{sr.lastError}</div></div>}
      {sr.unreadable && <div className="adm-alert critical" style={{ marginTop: 12 }}><i className="fas fa-key" /><div>Saved login cannot be decrypted (ENCRYPTION_KEY changed). Enter it again.</div></div>}

      <div className="adm-stack" style={{ marginTop: 16 }}>
        <p className="adm-muted" style={{ margin: 0 }}>Shiprocket → Settings → API → Configure → Create an API user. Use that API user here, not your main login.</p>
        <div className="adm-form-grid">
          <Field label="API user email" hint={connected ? 'Leave empty to keep the saved one.' : ''}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value.trim() })} autoComplete="off" /></Field>
          <Field label="API user password" hint={connected ? 'Leave empty to keep the saved one.' : ''}><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="Pickup location name" hint="Exactly as in Shiprocket → Settings → Pickup addresses"><Input value={f.pickupLocation} onChange={(e) => setF({ ...f, pickupLocation: e.target.value })} placeholder="Primary" /></Field>
        </div>
        <h4 className="adm-section-title">Default package (used when a product has no size/weight)</h4>
        <div className="adm-form-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
          <Field label="Weight (g)"><Input type="number" value={f.defaults.weight_g} onChange={(e) => d('weight_g', e.target.value)} /></Field>
          <Field label="Length (cm)"><Input type="number" value={f.defaults.length_cm} onChange={(e) => d('length_cm', e.target.value)} /></Field>
          <Field label="Width (cm)"><Input type="number" value={f.defaults.width_cm} onChange={(e) => d('width_cm', e.target.value)} /></Field>
          <Field label="Height (cm)"><Input type="number" value={f.defaults.height_cm} onChange={(e) => d('height_cm', e.target.value)} /></Field>
        </div>
        <h4 className="adm-section-title">Automation</h4>
        <Toggle checked={f.autoCreate} onChange={(v) => setF({ ...f, autoCreate: v })} label="Create the shipment automatically when an online payment succeeds" />
        <Toggle checked={f.autoCreateCod} onChange={(v) => setF({ ...f, autoCreateCod: v })} label="Also create shipments automatically for COD orders" />
        <Toggle checked={f.autoAwb} onChange={(v) => setF({ ...f, autoAwb: v })} label="Assign courier + AWB automatically" />
        <Toggle checked={f.autoPickup} onChange={(v) => setF({ ...f, autoPickup: v })} label="Request pickup automatically" />
        <div className="adm-row">
          <Btn variant="primary" icon="fa-plug" loading={busy === 'save'} disabled={!connected && (!f.email || !f.password)} onClick={save}>{connected ? 'Save' : 'Test & connect'}</Btn>
          {connected && <Btn icon="fa-vial" loading={busy === 'test'} onClick={() => run('test', () => post('/integrations/shiprocket/test'))}>Test connection</Btn>}
          {connected && <Btn variant="danger" icon="fa-link-slash" loading={busy === 'del'} onClick={disconnect}>Disconnect</Btn>}
        </div>
      </div>

      <h4 className="adm-section-title" style={{ marginTop: 20 }}>Tracking webhook</h4>
      <p className="adm-muted" style={{ margin: '0 0 6px' }}>Shiprocket → Settings → API → Webhooks. URL:</p>
      <Copy text={sr.webhook.url} />
      <p className="adm-muted" style={{ margin: '8px 0 6px' }}>Token (sent by Shiprocket in the x-api-key header): {sr.webhook.tokenSet ? 'set' : <strong style={{ color: 'var(--critical)' }}>not set</strong>}</p>
      {token ? (
        <div className="adm-alert warning"><i className="fas fa-key" /><div>Copy this token now; it will not be shown again.<Copy text={token} /></div></div>
      ) : <Btn size="sm" icon="fa-key" loading={busy === 'token'} onClick={newToken}>{sr.webhook.tokenSet ? 'Create new token' : 'Create token'}</Btn>}
      <p style={{ margin: '10px 0 0' }}>
        {sr.webhook.total ? <>Last update: <strong>{sr.webhook.last?.event_type}</strong> · <Status value={sr.webhook.last?.processing_status} /> · {fmtDate(sr.webhook.last?.received_at)}</> : <span className="adm-muted">No webhook received yet.</span>}
      </p>
    </Card>
  );
}

function WebhookLog() {
  const { toast } = useUi();
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(0);
  const { data, error, loading, reload } = useAsync(() => get(`/webhooks${qs({ provider, status, page })}`), [provider, status, page]);
  const open = async (id) => {
    try {
      setView(await get(`/webhooks/${id}`));
    } catch (err) {
      toast(err.message, 'critical');
    }
  };
  const retry = async (id) => {
    setBusy(id);
    try {
      const r = await post(`/webhooks/${id}/retry`);
      toast(`Retried: ${r.status}`, r.status === 'failed' ? 'critical' : 'good');
      reload();
      if (view?.id === id) open(id);
    } catch (err) {
      toast(err.message, 'critical');
    } finally {
      setBusy(0);
    }
  };
  return (
    <Card title="Webhook events" subtitle="Every call Razorpay and Shiprocket made to the store. Duplicates are ignored automatically." pad={false}
      actions={<>
        <Select value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }} options={[{ value: '', label: 'All providers' }, { value: 'razorpay', label: 'Razorpay' }, { value: 'shiprocket', label: 'Shiprocket' }]} aria-label="Provider" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[{ value: '', label: 'Any status' }, { value: 'processed', label: 'Processed' }, { value: 'failed', label: 'Failed' }, { value: 'rejected', label: 'Rejected' }, { value: 'ignored', label: 'Ignored' }]} aria-label="Status" />
      </>}>
      <ErrorBox error={error} onRetry={reload} />
      <Table
        loading={loading}
        rows={data?.items || []}
        onRowClick={(w) => open(w.id)}
        empty={<div className="adm-empty"><i className="fas fa-satellite-dish" /><h4>No webhook events yet</h4></div>}
        columns={[
          { key: 'received_at', label: 'Received', render: (w) => fmtDate(w.received_at) },
          { key: 'provider', label: 'Provider', render: (w) => w.provider[0].toUpperCase() + w.provider.slice(1) },
          { key: 'event_type', label: 'Event', render: (w) => <span className="adm-mono">{w.event_type || '—'}</span> },
          { key: 'processing_status', label: 'Status', render: (w) => <Status value={w.processing_status} /> },
          { key: 'attempts', label: 'Attempts', align: 'right' },
          { key: 'error_message', label: 'Error', render: (w) => w.error_message || '—' },
          { key: 'x', label: '', align: 'right', render: (w) => w.processing_status === 'failed' && <span onClick={(e) => e.stopPropagation()}><Btn size="sm" icon="fa-rotate-right" loading={busy === w.id} onClick={() => retry(w.id)}>Retry</Btn></span> },
        ]}
      />
      {data && <div style={{ padding: '0 16px' }}><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></div>}
      <Modal open={Boolean(view)} title={view ? `${view.provider} · ${view.event_type || 'event'}` : ''} onClose={() => setView(null)} width={760}
        footer={view?.processing_status === 'failed' && <Btn variant="primary" icon="fa-rotate-right" loading={busy === view.id} onClick={() => retry(view.id)}>Retry</Btn>}>
        {view && (
          <>
            <dl className="adm-kv">
              <dt>Event ID</dt><dd className="adm-mono">{view.event_id}</dd>
              <dt>Status</dt><dd><Status value={view.processing_status} /></dd>
              <dt>Received</dt><dd>{fmtDate(view.received_at)}</dd>
              <dt>Processed</dt><dd>{fmtDate(view.processed_at)}</dd>
              {view.error_message && <><dt>Error</dt><dd style={{ color: 'var(--critical)' }}>{view.error_message}</dd></>}
            </dl>
            <pre className="adm-pre" style={{ marginTop: 12, maxHeight: 380, overflow: 'auto' }}>{JSON.stringify(view.payload, null, 2)}</pre>
          </>
        )}
      </Modal>
    </Card>
  );
}

export default function Integrations() {
  const { data, error, loading, reload } = useAsync(() => get('/integrations'), []);
  return (
    <>
      <PageHeader title="Integrations" subtitle="Real connections only: nothing shows as connected until the provider accepts your credentials." />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Spinner /> : data && (
        <div className="adm-stack">
          <div className="adm-grid cols-2" style={{ alignItems: 'start' }}>
            <Razorpay rp={data.razorpay} reload={reload} />
            <Shiprocket key={data.shiprocket.email || 'none'} sr={data.shiprocket} reload={reload} />
          </div>
          <WebhookLog />
        </div>
      )}
    </>
  );
}
