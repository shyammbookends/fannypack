import { useEffect, useState } from 'react';
import { get, put } from '../api.js';
import { Btn, Card, ErrorBox, Field, ImageField, Input, ListInput, PageHeader, Spinner, Tabs, Textarea, Toggle, useAsync, useUi } from '../ui.jsx';

const TABS = [
  { key: 'store', label: 'Store' },
  { key: 'shipping', label: 'Shipping fee' },
  { key: 'delivery', label: 'Delivery area' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'seo', label: 'SEO' },
];

export default function Settings() {
  const { toast } = useUi();
  const { data, error, loading, reload } = useAsync(() => get('/settings'), []);
  const [s, setS] = useState(null);
  const [tab, setTab] = useState('store');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (data) setS(data);
  }, [data]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!s) return null;

  const cur = s[tab];
  const set = (k, v) => setS((x) => ({ ...x, [tab]: { ...x[tab], [k]: v } }));
  const b = (k) => ({ value: cur[k] ?? '', onChange: (e) => set(k, e.target.value) });
  const dirty = JSON.stringify(cur) !== JSON.stringify(data[tab]);

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const saved = await put(`/settings/${tab}`, cur);
      setS((x) => ({ ...x, [tab]: saved }));
      toast('Settings saved');
      reload();
    } catch (err) {
      setErrors(err.data?.fields || {});
      toast(err.message, 'critical');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" actions={<Btn variant="primary" icon="fa-floppy-disk" loading={busy} disabled={!dirty} onClick={save}>Save</Btn>} />
      <Tabs tabs={TABS} value={tab} onChange={(t) => { setTab(t); setErrors({}); }} />

      {tab === 'store' && (
        <div className="adm-grid cols-2" style={{ alignItems: 'start' }}>
          <Card title="Store details">
            <Field label="Store name"><Input {...b('name')} /></Field>
            <Field label="Contact email" error={errors.contact_email}><Input type="email" {...b('contact_email')} /></Field>
            <Field label="Phone"><Input {...b('phone')} /></Field>
            <Field label="Support hours" hint="e.g. Mon–Sat, 10am–7pm"><Input {...b('support_hours')} /></Field>
            <ImageField label="Logo" value={cur.logo} onChange={(v) => set('logo', v)} />
            <ImageField label="Favicon" value={cur.favicon} onChange={(v) => set('favicon', v)} />
          </Card>
          <Card title="Business & legal" subtitle="Shown in the footer, Contact page and on invoices. Required for selling food online in India.">
            <Field label="Registered business name"><Input {...b('legal_name')} /></Field>
            <Field label="Registered address"><Textarea rows={3} {...b('address')} /></Field>
            <Field label="GSTIN" error={errors.gstin} hint="15 characters, e.g. 24ABCDE1234F1Z5"><Input {...b('gstin')} /></Field>
            <Field label="FSSAI licence number" error={errors.fssai} hint="14 digits"><Input inputMode="numeric" {...b('fssai')} /></Field>
            <Field label="Grievance officer name"><Input {...b('grievance_officer')} /></Field>
            <Field label="Grievance officer email" error={errors.grievance_email}><Input type="email" {...b('grievance_email')} /></Field>
            <Field label="Grievance officer phone"><Input {...b('grievance_phone')} /></Field>
          </Card>

          <div className="adm-stack">
            <Card title="Ordering">
              <div className="adm-stack">
                <Toggle checked={cur.store_open} onChange={(v) => set('store_open', v)} label="Store is open for orders" />
                {!cur.store_open && <Field label="Message shown while closed"><Textarea rows={2} {...b('closed_message')} /></Field>}
                <Toggle checked={cur.cod_enabled} onChange={(v) => set('cod_enabled', v)} label="Allow Cash on Delivery" />
                <Field label="Note shown at checkout (optional)"><Textarea rows={2} {...b('order_notes')} /></Field>
              </div>
            </Card>
            <Card title="Tax">
              <Toggle checked={cur.tax_inclusive} onChange={(v) => set('tax_inclusive', v)} label="Prices include tax" />
              <Field label="Default tax rate (%)" hint="Used for products without their own tax rate. Currency is INR."><Input type="number" min="0" max="28" step="0.01" {...b('default_tax_rate')} /></Field>
            </Card>
          </div>
        </div>
      )}

      {tab === 'shipping' && (
        <Card title="Shipping fee charged to customers">
          <div className="adm-form-grid">
            <Field label="Flat shipping fee (₹)" hint="0 = free shipping"><Input type="number" min="0" {...b('fee')} /></Field>
            <Field label="Free shipping above (₹)" hint="0 = no threshold"><Input type="number" min="0" {...b('free_above')} /></Field>
          </div>
        </Card>
      )}

      {tab === 'delivery' && (
        <Card title="Where you deliver" subtitle="Checked at checkout and again on the server when an order is placed">
          <div className="adm-stack">
            <Toggle checked={cur.gujarat_only} onChange={(v) => set('gujarat_only', v)} label="Deliver only within Gujarat (PIN codes 36xxxx–39xxxx)" />
            <Field label="Allowed states" hint="Press Enter after each state."><ListInput value={cur.allowed_states} onChange={(v) => set('allowed_states', v)} placeholder="Add state…" /></Field>
            <Field label="Only these PIN codes (optional)" error={errors.allowed_pincodes} hint="Empty = every PIN in the allowed states. Use 3800* for a prefix."><ListInput value={cur.allowed_pincodes} onChange={(v) => set('allowed_pincodes', v)} placeholder="380001" /></Field>
            <Field label="Blocked PIN codes" error={errors.blocked_pincodes}><ListInput value={cur.blocked_pincodes} onChange={(v) => set('blocked_pincodes', v)} placeholder="PIN code" /></Field>
            <Field label="Message when an address is outside the area"><Textarea rows={2} {...b('message')} /></Field>
          </div>
        </Card>
      )}

      {tab === 'notifications' && (
        <Card title="Notifications">
          <div className="adm-stack">
            <Field label="Admin email" error={errors.admin_email} hint="New orders and alerts are emailed here (needs SMTP set up in the server .env)."><Input type="email" {...b('admin_email')} /></Field>
            <Toggle checked={cur.email_new_order} onChange={(v) => set('email_new_order', v)} label="Email me for every new order" />
            <Toggle checked={cur.low_stock_alerts} onChange={(v) => set('low_stock_alerts', v)} label="Low-stock alerts" />
            <Toggle checked={cur.customer_emails} onChange={(v) => set('customer_emails', v)} label="Email customers about their orders (confirmation, shipped, delivered, cancelled, refunds)" />
          </div>
        </Card>
      )}

      {tab === 'seo' && (
        <Card title="Search engines & sharing">
          <Field label="Homepage title"><Input {...b('title')} /></Field>
          <Field label="Meta description" hint={`${(cur.description || '').length} / 160 characters`}><Textarea rows={3} {...b('description')} /></Field>
          <ImageField label="Share image (Open Graph)" value={cur.og_image} onChange={(v) => set('og_image', v)} />
        </Card>
      )}
    </>
  );
}
