import { useState } from 'react';
import { fmtDate, get, post } from '../api.js';
import { ROLE_NAMES, useAdmin } from '../AdminApp.jsx';
import { Btn, Card, ErrorBox, Field, Input, PageHeader, Status, Table, useAsync, useUi } from '../ui.jsx';

function browser(ua = '') {
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${b}${os ? ` on ${os}` : ''}`;
}

function PasswordCard() {
  const { toast } = useUi();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const mismatch = f.confirm && f.next !== f.confirm;
  const save = async () => {
    setBusy(true);
    try {
      await post('/account/password', { current: f.current, next: f.next });
      toast('Password changed. Other sessions were signed out.');
      setF({ current: '', next: '', confirm: '' });
    } catch (err) {
      toast(err.message, 'critical');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Password">
      <Field label="Current password"><Input type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field>
      <Field label="New password" hint="At least 10 characters."><Input type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
      <Field label="Confirm new password" error={mismatch ? 'Passwords do not match.' : ''}><Input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
      <Btn variant="primary" loading={busy} disabled={!f.current || f.next.length < 10 || f.next !== f.confirm} onClick={save}>Change password</Btn>
    </Card>
  );
}

function TwoFactorCard() {
  const { admin, refresh } = useAdmin();
  const { toast } = useUi();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn, msg) => {
    setBusy(true);
    try {
      await fn();
      if (msg) toast(msg);
      return true;
    } catch (err) {
      toast(err.message, 'critical');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const start = () => run(async () => setSetup(await post('/account/2fa/setup')));
  const enable = async () => {
    if (await run(() => post('/account/2fa/enable', { code }), 'Two-step verification is on')) {
      setSetup(null);
      setCode('');
      refresh();
    }
  };
  const disable = async () => {
    if (await run(() => post('/account/2fa/disable', { password: pw, code }), 'Two-step verification is off')) {
      setCode('');
      setPw('');
      refresh();
    }
  };
  return (
    <Card title="Two-step verification" actions={admin.totpEnabled ? <Status value="active" label="On" /> : <Status value="draft" label="Off" />}>
      {admin.totpEnabled ? (
        <>
          <p className="adm-muted">You enter a code from your authenticator app each time you sign in. To turn it off, confirm your password and a current code.</p>
          <Field label="Password"><Input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label="6-digit code"><Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
          <Btn variant="danger" loading={busy} disabled={!pw || code.length !== 6} onClick={disable}>Turn off</Btn>
        </>
      ) : setup ? (
        <>
          <p>Scan this with Google Authenticator, Microsoft Authenticator or Authy, then enter the 6-digit code.</p>
          <div className="adm-row" style={{ alignItems: 'flex-start', gap: 16 }}>
            <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} style={{ borderRadius: 8, border: '1px solid var(--line)' }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <p className="adm-muted" style={{ fontSize: 13 }}>Can’t scan? Enter this key by hand:</p>
              <p className="adm-mono" style={{ wordBreak: 'break-all' }}>{setup.secret}</p>
              <Field label="6-digit code"><Input inputMode="numeric" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
              <div className="adm-row">
                <Btn variant="primary" loading={busy} disabled={code.length !== 6} onClick={enable}>Turn on</Btn>
                <Btn onClick={() => { setSetup(null); setCode(''); }}>Cancel</Btn>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="adm-muted">Protect your admin account with a code from your phone in addition to your password.</p>
          <Btn variant="primary" icon="fa-shield-halved" loading={busy} onClick={start}>Set up</Btn>
        </>
      )}
    </Card>
  );
}

function SessionsCard() {
  const { toast, confirm } = useUi();
  const { data, error, loading, reload } = useAsync(() => get('/account/sessions'), []);
  const others = (data || []).filter((s) => !s.current).length;
  const revoke = async () => {
    if (!(await confirm({ title: 'Sign out other devices?', message: 'Every other browser signed in to this admin account will be signed out.', confirmLabel: 'Sign out others' }))) return;
    try {
      await post('/account/sessions/revoke-others');
      toast('Other devices signed out');
      reload();
    } catch (err) {
      toast(err.message, 'critical');
    }
  };
  return (
    <Card title="Where you’re signed in" pad={false} actions={others > 0 && <Btn size="sm" icon="fa-right-from-bracket" onClick={revoke}>Sign out {others} other{others === 1 ? '' : 's'}</Btn>}>
      <ErrorBox error={error} onRetry={reload} />
      <Table
        rowKey="created_at"
        loading={loading}
        rows={data || []}
        columns={[
          { key: 'ua', label: 'Device', render: (s) => <>{browser(s.user_agent)}{s.current && <> <Status value="active" label="This device" /></>}</> },
          { key: 'ip', label: 'IP', render: (s) => <span className="adm-mono">{s.ip || '—'}</span> },
          { key: 'created_at', label: 'Signed in', render: (s) => fmtDate(s.created_at) },
          { key: 'last_seen_at', label: 'Last active', render: (s) => fmtDate(s.last_seen_at) },
          { key: 'expires_at', label: 'Expires', render: (s) => fmtDate(s.expires_at) },
        ]}
      />
    </Card>
  );
}

export default function Account() {
  const { admin } = useAdmin();
  return (
    <>
      <PageHeader title="Account & security" subtitle={`${admin.name} · ${admin.email} · ${ROLE_NAMES[admin.role] || admin.role}`} />
      <div className="adm-grid cols-2" style={{ alignItems: 'start', marginBottom: 16 }}>
        <PasswordCard />
        <TwoFactorCard />
      </div>
      <SessionsCard />
    </>
  );
}
