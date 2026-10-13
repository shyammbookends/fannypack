import { useState } from 'react';
import { del, fmtDate, get, post, put, titleCase } from '../api.js';
import { useAdmin } from '../AdminApp.jsx';
import { Btn, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Status, Table, useAsync, useUi } from '../ui.jsx';

function TempPassword({ value, onClose }) {
  const { toast } = useUi();
  return (
    <Modal open={Boolean(value)} title="Temporary password" onClose={onClose} footer={<Btn variant="primary" onClick={onClose}>Done</Btn>}>
      <p>Share this with the person privately. It is shown only once; ask them to change it after signing in.</p>
      <div className="adm-code">
        <span className="adm-mono" style={{ fontSize: 18 }}>{value}</span>
        <Btn size="sm" variant="ghost" icon="fa-copy" aria-label="Copy" onClick={() => navigator.clipboard?.writeText(value).then(() => toast('Copied'))} />
      </div>
    </Modal>
  );
}

export default function AdminUsers() {
  const { admin } = useAdmin();
  const { toast, confirm } = useUi();
  const { data, error, loading, reload } = useAsync(() => get('/admin-users'), []);
  const [add, setAdd] = useState(null);
  const [edit, setEdit] = useState(null);
  const [role, setRole] = useState(null);
  const [temp, setTemp] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const isSuper = admin.role === 'super_admin';

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const roleName = (k) => data.roles.find((r) => r.key === k)?.name || titleCase(k);
  const roleOptions = data.roles.filter((r) => isSuper || r.key !== 'super_admin').map((r) => ({ value: r.key, label: r.name }));

  const act = async (fn, msg) => {
    setBusy(true);
    setErrors({});
    try {
      const r = await fn();
      if (msg) toast(msg);
      reload();
      return r || true;
    } catch (err) {
      setErrors(err.data?.fields || {});
      toast(err.message, 'critical');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const r = await act(() => post('/admin-users', add), 'Admin added');
    if (r) {
      setAdd(null);
      if (r.tempPassword) setTemp(r.tempPassword);
      else toast('They already had an account, so they keep their current password.');
    }
  };
  const saveEdit = async () => {
    if (await act(() => put(`/admin-users/${edit.id}`, { role: edit.role, status: edit.status }), 'Admin updated')) setEdit(null);
  };
  const remove = async (u) => {
    if (!(await confirm({ title: `Remove admin access for ${u.name}?`, message: 'They are signed out. Their account stays as a normal customer account.', danger: true, confirmLabel: 'Remove' }))) return;
    if (await act(() => del(`/admin-users/${u.id}`), 'Admin access removed')) setEdit(null);
  };
  const resetPw = async (u) => {
    if (!(await confirm({ title: `Reset password for ${u.name}?`, message: 'Their current password stops working and they are signed out everywhere.', confirmLabel: 'Reset' }))) return;
    const r = await act(() => post(`/admin-users/${u.id}/reset-password`));
    if (r?.tempPassword) {
      setEdit(null);
      setTemp(r.tempPassword);
    }
  };
  const saveRole = async () => {
    if (await act(() => put(`/admin-roles/${role.key}`, { name: role.name, permissions: role.permissions }), 'Role saved')) setRole(null);
  };

  return (
    <>
      <PageHeader title="Admin Users" subtitle="Who can sign in to this admin and what they can do" actions={<Btn variant="primary" icon="fa-user-plus" onClick={() => { setErrors({}); setAdd({ email: '', name: '', role: 'manager' }); }}>Add admin</Btn>} />
      <Card pad={false} title="People">
        <Table
          rows={data.users}
          onRowClick={(u) => u.id !== admin.id && setEdit({ ...u })}
          columns={[
            { key: 'name', label: 'Name', render: (u) => <div className="adm-cell-main"><span className="adm-avatar">{u.name.slice(0, 1).toUpperCase()}</span><div><strong>{u.name}{u.id === admin.id ? ' (you)' : ''}</strong><small>{u.email}</small></div></div> },
            { key: 'role', label: 'Role', render: (u) => roleName(u.role) },
            { key: 'totp_enabled', label: '2FA', render: (u) => (u.totp_enabled ? <Status value="active" label="On" /> : <Status value="draft" label="Off" />) },
            { key: 'last_seen', label: 'Last active', render: (u) => fmtDate(u.last_seen || u.last_login_at) },
            { key: 'status', label: 'Status', render: (u) => (u.locked_until && new Date(u.locked_until) > new Date() ? <Status value="pending" label="Locked" /> : <Status value={u.status} />) },
          ]}
        />
      </Card>

      <Card title="Roles & permissions" subtitle={isSuper ? 'Click a role to change what it can access.' : 'Only a Super Admin can change roles.'} pad={false}>
        <Table
          rowKey="key"
          rows={data.roles}
          onRowClick={isSuper ? (r) => !r.is_system && setRole({ ...r, permissions: [...r.permissions] }) : undefined}
          columns={[
            { key: 'name', label: 'Role', render: (r) => <strong>{r.name}</strong> },
            { key: 'permissions', label: 'Access', render: (r) => (r.permissions.includes('*') ? 'Everything' : r.permissions.map(titleCase).join(', ') || 'Nothing') },
            { key: 'n', label: 'People', align: 'right', render: (r) => data.users.filter((u) => u.role === r.key).length },
          ]}
        />
      </Card>

      <Modal open={Boolean(add)} title="Add admin" onClose={() => setAdd(null)} footer={<><Btn onClick={() => setAdd(null)}>Cancel</Btn><Btn variant="primary" loading={busy} onClick={create}>Add</Btn></>}>
        {add && (
          <>
            <Field label="Name" error={errors.name}><Input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field>
            <Field label="Email" error={errors.email}><Input type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} /></Field>
            <Field label="Role" error={errors.role}><Select value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })} options={roleOptions} /></Field>
            <p className="adm-muted" style={{ fontSize: 13 }}>A temporary password is created and shown once.</p>
          </>
        )}
      </Modal>

      <Modal open={Boolean(edit)} title={edit ? `Edit ${edit.name}` : ''} onClose={() => setEdit(null)}
        footer={<><Btn variant="danger" icon="fa-user-minus" onClick={() => remove(edit)}>Remove access</Btn><span className="adm-spacer" /><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn variant="primary" loading={busy} onClick={saveEdit}>Save</Btn></>}>
        {edit && (
          <>
            <p className="adm-muted">{edit.email}</p>
            <Field label="Role"><Select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} options={edit.role === 'super_admin' && !isSuper ? [{ value: 'super_admin', label: 'Super Admin' }] : roleOptions} /></Field>
            <Field label="Status"><Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })} options={[{ value: 'active', label: 'Active' }, { value: 'blocked', label: 'Disabled' }]} /></Field>
            {isSuper && <Btn size="sm" icon="fa-key" onClick={() => resetPw(edit)}>Reset password</Btn>}
          </>
        )}
      </Modal>

      <Modal open={Boolean(role)} title={role ? `Role: ${role.name}` : ''} onClose={() => setRole(null)} footer={<><Btn onClick={() => setRole(null)}>Cancel</Btn><Btn variant="primary" loading={busy} onClick={saveRole}>Save</Btn></>}>
        {role && (
          <>
            <Field label="Name"><Input value={role.name} onChange={(e) => setRole({ ...role, name: e.target.value })} /></Field>
            <div className="adm-grid cols-2" style={{ gap: 8 }}>
              {data.permissions.map((p) => (
                <label key={p} className="adm-row" style={{ gap: 8 }}>
                  <input type="checkbox" checked={role.permissions.includes(p)} onChange={(e) => setRole({ ...role, permissions: e.target.checked ? [...role.permissions, p] : role.permissions.filter((x) => x !== p) })} />
                  {titleCase(p)}
                </label>
              ))}
            </div>
            <p className="adm-muted" style={{ fontSize: 13, marginTop: 12 }}>Changes apply right away to everyone with this role.</p>
          </>
        )}
      </Modal>
      <TempPassword value={temp} onClose={() => setTemp('')} />
    </>
  );
}
