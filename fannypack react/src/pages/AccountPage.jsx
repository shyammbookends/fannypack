import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../shop/api.js';
import { useAuth } from '../shop/AuthContext.jsx';
import { useSeo } from '../shop/useSeo.js';
import AddressFields, { EMPTY_ADDRESS } from '../shop/AddressForm.jsx';
import { PasswordInput } from './AuthPages.jsx';

function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '' });
  const [fields, setFields] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setFields({});
    try {
      const r = await api.updateProfile(form);
      setUser(r.user);
      setMsg({ ok: true, text: 'Your details were saved.' });
    } catch (err) {
      setFields(err.data?.fields || {});
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="co-card">
      <h2>Your details</h2>
      <form onSubmit={save} noValidate className="row g-3">
        <div className="col-sm-6">
          <label className="co-label" htmlFor="pf-name">Name</label>
          <input id="pf-name" className={'co-input' + (fields.name ? ' invalid' : '')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
          {fields.name && <div className="co-err">{fields.name}</div>}
        </div>
        <div className="col-sm-6">
          <label className="co-label" htmlFor="pf-phone">Mobile number</label>
          <input id="pf-phone" className={'co-input' + (fields.phone ? ' invalid' : '')} value={form.phone} inputMode="numeric" onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
          {fields.phone && <div className="co-err">{fields.phone}</div>}
        </div>
        <div className="col-12">
          <label className="co-label">Email</label>
          <div className="acct-static">{user.email}</div>
        </div>
        <div className="col-12 d-flex align-items-center gap-3 flex-wrap">
          <button className="pd-btn pd-btn-buy acct-btn" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>
          {msg && <span className={msg.ok ? 'acct-ok' : 'cart-err'}>{msg.text}</span>}
        </div>
      </form>
    </section>
  );
}

function ChangePassword() {
  const [form, setForm] = useState({ current: '', password: '', confirm: '' });
  const [fields, setFields] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setMsg(null);
    const local = {};
    if (!form.current) local.current = 'Enter your current password.';
    if (form.password.length < 8) local.password = 'Passwords must be at least 8 characters.';
    if (form.password !== form.confirm) local.confirm = 'Passwords do not match.';
    setFields(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await api.changePassword(form.current, form.password);
      setForm({ current: '', password: '', confirm: '' });
      setMsg({ ok: true, text: 'Password changed. Other devices have been signed out.' });
    } catch (err) {
      setFields(err.data?.fields || {});
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="co-card">
      <h2>Change password</h2>
      <form onSubmit={save} noValidate className="row g-3">
        <div className="col-12">
          <label className="co-label" htmlFor="cp-current">Current password</label>
          <PasswordInput id="cp-current" value={form.current} onChange={set('current')} autoComplete="current-password" invalid={fields.current} />
          {fields.current && <div className="co-err">{fields.current}</div>}
          <Link to="/forgot-password" className="acct-small-link">Forgot your current password?</Link>
        </div>
        <div className="col-sm-6">
          <label className="co-label" htmlFor="cp-new">New password</label>
          <PasswordInput id="cp-new" value={form.password} onChange={set('password')} autoComplete="new-password" invalid={fields.password} placeholder="At least 8 characters" />
          {fields.password && <div className="co-err">{fields.password}</div>}
        </div>
        <div className="col-sm-6">
          <label className="co-label" htmlFor="cp-confirm">Re-enter new password</label>
          <PasswordInput id="cp-confirm" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" invalid={fields.confirm} />
          {fields.confirm && <div className="co-err">{fields.confirm}</div>}
        </div>
        <div className="col-12 d-flex align-items-center gap-3 flex-wrap">
          <button className="pd-btn pd-btn-cart acct-btn" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
          {msg && <span className={msg.ok ? 'acct-ok' : 'cart-err'}>{msg.text}</span>}
        </div>
      </form>
    </section>
  );
}

function Addresses() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState(null); // { id?, ...address, is_default }
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.addresses().then(setList, (err) => setError(err.message)), []);
  useEffect(() => {
    load();
  }, [load]);
  const onChange = useCallback((v) => setEdit((e) => ({ ...e, ...v })), []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFields({});
    try {
      const { id, ...body } = edit;
      if (id) await api.updateAddress(id, body);
      else await api.addAddress(body);
      setEdit(null);
      await load();
    } catch (err) {
      setFields(err.data?.fields || {});
      setError(err.data?.fields ? '' : err.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (a) => {
    if (!window.confirm('Delete this address?')) return;
    try {
      await api.deleteAddress(a.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };
  const makeDefault = async (a) => {
    try {
      const { id, is_default, ...body } = a;
      await api.updateAddress(id, { ...body, is_default: true });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="co-card">
      <div className="acct-head">
        <h2>Your addresses</h2>
        {!edit && <button type="button" className="acct-link-btn" onClick={() => { setFields({}); setEdit({ ...EMPTY_ADDRESS, is_default: false }); }}><i className="fas fa-plus"></i> Add address</button>}
      </div>
      {error && <div className="shop-alert">{error}</div>}
      {edit && (
        <form onSubmit={save} noValidate className="acct-addr-form">
          <AddressFields value={edit} onChange={onChange} errors={fields} idPrefix="addr" />
          <label className="acct-check"><input type="checkbox" checked={Boolean(edit.is_default)} onChange={(e) => setEdit({ ...edit, is_default: e.target.checked })} /> Use as my default address</label>
          <div className="d-flex gap-2 mt-3">
            <button className="pd-btn pd-btn-buy acct-btn" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button>
            <button type="button" className="pd-btn pd-btn-cart acct-btn" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </form>
      )}
      {!list && !error && <div className="shop-loading"><span className="shop-spinner"></span>Loading…</div>}
      {list?.length === 0 && !edit && <p className="pd-muted">No saved addresses yet. Addresses you use at checkout are saved here automatically.</p>}
      <div className="acct-addrs">
        {list?.map((a) => (
          <div className={'acct-addr' + (a.is_default ? ' default' : '')} key={a.id}>
            {a.is_default && <span className="acct-badge">Default</span>}
            <strong>{a.name}</strong>
            <span>{a.address_line}</span>
            <span>{a.city}, {a.state} - {a.pin}</span>
            <span>Phone: {a.phone}</span>
            <div className="acct-addr-actions">
              <button type="button" onClick={() => { setFields({}); setEdit({ ...a }); }}>Edit</button>
              <button type="button" onClick={() => remove(a)}>Delete</button>
              {!a.is_default && <button type="button" onClick={() => makeDefault(a)}>Set as default</button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  const location = useLocation();
  useSeo('Your Account', { noindex: true });

  return (
    <main className="shop-page container">
      <h1 className="shop-h1">Your Account</h1>
      {location.state?.notice && <div className="auth-ok mb-3"><i className="fas fa-circle-check"></i>{location.state.notice}</div>}
      <div className="acct-tiles">
        <Link to="/account/orders" className="acct-tile"><i className="fas fa-box"></i><strong>Your Orders</strong><span>Track, cancel or view invoices</span></Link>
        <Link to="/account/wishlist" className="acct-tile"><i className="fas fa-heart"></i><strong>Your Wishlist</strong><span>Products you saved</span></Link>
        <Link to="/contact" className="acct-tile"><i className="fas fa-headset"></i><strong>Help &amp; Contact</strong><span>Questions about an order</span></Link>
      </div>
      <p className="orders-hello">Signed in as <strong>{user.name}</strong> ({user.email})</p>
      <div className="acct-grid">
        <Profile />
        <ChangePassword />
      </div>
      <Addresses />
    </main>
  );
}
