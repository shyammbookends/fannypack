import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fmtDate, get, inr, post, titleCase } from '../api.js';
import { useAdmin } from '../AdminApp.jsx';
import { Btn, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Status, Textarea, Toggle, useAsync, useUi } from '../ui.jsx';

const NEXT = { placed: ['confirmed', 'processing', 'shipped'], confirmed: ['processing', 'shipped'], processing: ['shipped', 'delivered'], shipped: ['delivered'] };

export default function OrderDetail() {
  const { number } = useParams();
  const navigate = useNavigate();
  const { can } = useAdmin();
  const { toast, confirm } = useUi();
  const { data, error, loading, reload } = useAsync(() => get(`/orders/${encodeURIComponent(number)}`), [number]);
  const [busy, setBusy] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  const act = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const r = await fn();
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      setModal(null);
      await reload();
      return r;
    } catch (err) {
      toast(err.message, 'critical');
    } finally {
      setBusy('');
    }
  };

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { order: o, items, history, payments, refunds, shipmentEvents, customer, webhooks, tracking } = data;
  const refunded = refunds.filter((r) => r.status !== 'failed').reduce((s, r) => s + r.amount, 0);
  const canCancel = !['cancelled', 'shipped', 'delivered'].includes(o.status);
  const nextStatuses = NEXT[o.status] || [];

  return (
    <>
      <PageHeader
        back={{ label: 'Orders', onClick: (e) => { e.preventDefault(); navigate('/admin/orders'); } }}
        title={<span className="adm-row">Order {o.number} <Status value={o.status} /> <Status value={o.payment_status} /></span>}
        subtitle={`Placed ${fmtDate(o.created_at)} · ${o.payment_method === 'cod' ? 'Cash on Delivery' : 'Online payment'}`}
        actions={
          <>
            {nextStatuses.length > 0 && can('orders') && (
              <Btn icon="fa-arrow-right" onClick={() => { setForm({ status: nextStatuses[0], note: '' }); setModal('status'); }}>Update status</Btn>
            )}
            {o.payment_method === 'cod' && o.payment_status === 'cod' && can('payments') && (
              <Btn icon="fa-money-bill-wave" loading={busy === 'cod'} onClick={async () => (await confirm({ title: 'Mark cash as collected?', message: `Record ₹${o.total} as received for ${o.number}.` })) && act('cod', () => post(`/orders/${o.number}/mark-paid`), 'Marked as paid')}>COD collected</Btn>
            )}
            {can('payments') && ['paid', 'refunded'].includes(o.payment_status) && refunded < o.total && (
              <Btn icon="fa-rotate-left" onClick={() => { setForm({ amount: o.total - refunded, reason: '', restock: false }); setModal('refund'); }}>Refund</Btn>
            )}
            {canCancel && can('orders') && (
              <Btn variant="danger" icon="fa-ban" onClick={() => { setForm({ reason: '', restock: true }); setModal('cancel'); }}>Cancel order</Btn>
            )}
          </>
        }
      />

      <div className="adm-grid main-side">
        <div className="adm-stack">
          <Card title="Progress">
            <div className="adm-steps">
              {tracking.map((s) => <div key={s.key} className={`adm-step ${s.done ? 'done' : ''}`}>{s.label}</div>)}
            </div>
          </Card>

          <Card title={`Items (${items.reduce((s, i) => s + i.qty, 0)})`}>
            <table className="adm-lines">
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td style={{ width: 52 }}>{i.image ? <img className="adm-thumb" src={i.image} alt="" /> : <span className="adm-thumb"><i className="fas fa-image" /></span>}</td>
                    <td>
                      <strong>{i.name}</strong>
                      <div className="adm-muted" style={{ fontSize: 12.5 }}>{[i.option, i.sku].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="num">{inr(i.unit_price)} × {i.qty}</td>
                    <td className="num"><strong>{inr(i.line_total)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ maxWidth: 320, marginLeft: 'auto', marginTop: 10 }}>
              <div className="adm-sum"><span>Subtotal</span><span>{inr(o.subtotal)}</span></div>
              {o.discount_amount > 0 && <div className="adm-sum"><span>Discount {o.discount_code && <code>{o.discount_code}</code>}</span><span>−{inr(o.discount_amount)}</span></div>}
              <div className="adm-sum"><span>Shipping</span><span>{o.delivery ? inr(o.delivery) : 'Free'}</span></div>
              {o.tax_amount > 0 && <div className="adm-sum"><span className="adm-muted">Tax (included)</span><span className="adm-muted">{inr(o.tax_amount)}</span></div>}
              <div className="adm-sum total"><span>Grand total</span><span>{inr(o.total)}</span></div>
              {refunded > 0 && <div className="adm-sum"><span>Refunded</span><span>−{inr(refunded)}</span></div>}
            </div>
          </Card>

          <Card title="Payment">
            <dl className="adm-kv">
              <dt>Method</dt><dd>{o.payment_method === 'cod' ? 'Cash on Delivery' : 'Online (Razorpay)'}</dd>
              <dt>Status</dt><dd><Status value={o.payment_status} /></dd>
              {o.razorpay_order_id && <><dt>Razorpay order</dt><dd className="adm-mono">{o.razorpay_order_id}</dd></>}
              {o.razorpay_payment_id && <><dt>Razorpay payment</dt><dd className="adm-mono">{o.razorpay_payment_id}</dd></>}
            </dl>
            {payments.length > 0 && (
              <table className="adm-lines" style={{ marginTop: 12 }}>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="adm-mono">{p.provider_payment_id}</td>
                      <td>{p.method || p.provider}</td>
                      <td><Status value={p.status} />{p.error && <div className="adm-muted" style={{ fontSize: 12 }}>{p.error}</div>}</td>
                      <td className="num">{inr(p.amount)}</td>
                      <td className="num adm-muted">{fmtDate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {refunds.length > 0 && (
              <>
                <p className="adm-section-title" style={{ marginTop: 14 }}>Refunds</p>
                <table className="adm-lines">
                  <tbody>
                    {refunds.map((r) => (
                      <tr key={r.id}>
                        <td className="adm-mono">{r.provider_refund_id}</td>
                        <td>{r.reason || '—'}</td>
                        <td><Status value={r.status} /></td>
                        <td className="num">{inr(r.amount)}</td>
                        <td className="num adm-muted">{fmtDate(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {webhooks.length > 0 && (
              <p className="adm-muted" style={{ marginTop: 10, fontSize: 12.5 }}>
                Webhooks: {webhooks.map((w) => `${w.event_type} (${w.processing_status})`).join(', ')}
              </p>
            )}
          </Card>

          <Card
            title="Shipment"
            actions={
              can('shipping') && o.status !== 'cancelled' && (
                <>
                  {!o.shiprocket_order_id && o.status !== 'delivered' && (o.payment_method === 'cod' || o.payment_status === 'paid') && (
                    <Btn size="sm" variant="primary" icon="fa-truck-fast" loading={busy === 'ship'} onClick={() => act('ship', () => post(`/orders/${o.number}/shipment`), 'Shipment created in Shiprocket')}>Create shipment</Btn>
                  )}
                  {(o.awb_code || o.shipment_id) && o.shiprocket_order_id && (
                    <Btn size="sm" icon="fa-rotate" loading={busy === 'sync'} onClick={() => act('sync', () => post(`/orders/${o.number}/shipment/sync`), (r) => `Tracking refreshed: ${titleCase(r.shipmentStatus || 'no change')}`)}>Refresh tracking</Btn>
                  )}
                  {!o.awb_code && o.status !== 'delivered' && (
                    <Btn size="sm" icon="fa-pen" onClick={() => { setForm({ courier: '', awb: '', tracking_url: '' }); setModal('manual'); }}>Add tracking manually</Btn>
                  )}
                </>
              )
            }
          >
            {o.fulfilment_error && <div className="adm-alert warning" style={{ marginBottom: 12 }}><i className="fas fa-triangle-exclamation" /><div>{o.fulfilment_error}</div></div>}
            <dl className="adm-kv">
              <dt>Shipping status</dt><dd><Status value={o.shipment_status || 'not_shipped'} /></dd>
              <dt>Shiprocket order</dt><dd className="adm-mono">{o.shiprocket_order_id || '—'}</dd>
              <dt>Shipment ID</dt><dd className="adm-mono">{o.shipment_id || '—'}</dd>
              <dt>AWB</dt><dd className="adm-mono">{o.awb_code || '—'}</dd>
              <dt>Courier</dt><dd>{o.courier_name || '—'}</dd>
              <dt>Pickup</dt><dd>{o.pickup_status || '—'}</dd>
              <dt>Expected delivery</dt><dd>{o.expected_delivery ? fmtDate(o.expected_delivery, false) : '—'}</dd>
              <dt>Tracking</dt><dd>{o.tracking_url ? <a href={o.tracking_url} target="_blank" rel="noreferrer" style={{ color: 'var(--series-1)' }}>Open tracking page <i className="fas fa-arrow-up-right-from-square" /></a> : '—'}</dd>
              <dt>Last sync</dt><dd>{fmtDate(o.shipping_synced_at)}</dd>
            </dl>
            {shipmentEvents.length > 0 && (
              <>
                <p className="adm-section-title" style={{ margin: '14px 0 8px' }}>Tracking events</p>
                <ul className="adm-timeline">
                  {shipmentEvents.map((e) => (
                    <li key={e.id}>
                      <strong>{e.status}</strong>
                      {(e.description || e.location) && <span>{[e.description, e.location].filter(Boolean).join(' · ')}</span>}
                      <small>{fmtDate(e.event_time || e.created_at)}</small>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>

        <div className="adm-stack">
          <Card title="Customer">
            {customer ? (
              <div className="adm-stack" style={{ gap: 6 }}>
                <Link to={`/admin/customers/${customer.id}`} style={{ color: 'var(--series-1)', fontWeight: 600 }}>{customer.name}</Link>
                <span className="adm-muted">{customer.orders} order{customer.orders === 1 ? '' : 's'} · {inr(customer.spent)} spent</span>
              </div>
            ) : <span className="adm-muted">Guest</span>}
            <dl className="adm-kv" style={{ marginTop: 12 }}>
              <dt>Email</dt><dd>{o.email}</dd>
              <dt>Phone</dt><dd>{o.phone}</dd>
            </dl>
          </Card>
          <Card title="Shipping address">
            <p>{o.name}<br />{o.address_line}<br />{o.city}, {o.state} {o.pin}<br />India</p>
            <p className="adm-muted" style={{ marginTop: 8, fontSize: 12.5 }}>Billing address: same as shipping</p>
          </Card>
          <Card title="Internal note">
            <NoteEditor number={o.number} value={o.admin_note} onSaved={reload} />
          </Card>
          <Card title="Timeline">
            <ul className="adm-timeline">
              {[...history].reverse().map((h) => (
                <li key={h.id}>
                  <strong>{titleCase(h.status)}</strong>
                  {h.note && <span>{h.note}</span>}
                  <small>{fmtDate(h.created_at)} · {h.admin_email || h.source}</small>
                </li>
              ))}
              {!history.length && <li><strong>Order created</strong><small>{fmtDate(o.created_at)}</small></li>}
            </ul>
          </Card>
        </div>
      </div>

      {/* status */}
      <Modal open={modal === 'status'} title="Update status" onClose={() => setModal(null)}
        footer={<><Btn onClick={() => setModal(null)}>Cancel</Btn><Btn variant="primary" loading={busy === 'status'} onClick={() => act('status', () => post(`/orders/${o.number}/status`, form), 'Status updated')}>Save</Btn></>}>
        <Field label="New status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={nextStatuses.map((s) => ({ value: s, label: titleCase(s) }))} /></Field>
        <Field label="Note (optional)"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      </Modal>

      {/* cancel */}
      <Modal open={modal === 'cancel'} title={`Cancel ${o.number}?`} onClose={() => setModal(null)}
        footer={<><Btn onClick={() => setModal(null)}>Keep order</Btn><Btn variant="danger" loading={busy === 'cancel'} onClick={() => act('cancel', () => post(`/orders/${o.number}/cancel`, form), (r) => (r.refundNeeded ? 'Cancelled. This order was paid online - issue a refund.' : 'Order cancelled'))}>Cancel order</Btn></>}>
        {o.payment_status === 'paid' && <div className="adm-alert warning"><i className="fas fa-triangle-exclamation" /><div>This order was paid online. Cancelling does not refund automatically - use Refund afterwards.</div></div>}
        <Field label="Reason"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Customer asked to cancel" /></Field>
        <Toggle checked={form.restock} onChange={(v) => setForm({ ...form, restock: v })} label="Put the items back in stock" />
      </Modal>

      {/* refund */}
      <Modal open={modal === 'refund'} title="Refund" onClose={() => setModal(null)}
        footer={<><Btn onClick={() => setModal(null)}>Cancel</Btn><Btn variant="primary" loading={busy === 'refund'} onClick={() => act('refund', () => post(`/orders/${o.number}/refund`, form), (r) => `Refund of ₹${r.amount} ${o.payment_method === 'cod' ? 'recorded' : 'sent to Razorpay'}`)}>Refund {inr(form.amount)}</Btn></>}>
        <p className="adm-muted">{o.payment_method === 'cod' ? 'Cash on Delivery: this records a refund you paid back manually.' : 'The money goes back to the customer through Razorpay.'} Up to {inr(o.total - refunded)} can be refunded.</p>
        <Field label="Amount (₹)"><Input type="number" min="1" max={o.total - refunded} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
        <Field label="Reason"><Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
        <Toggle checked={form.restock} onChange={(v) => setForm({ ...form, restock: v })} label="Put the items back in stock" />
      </Modal>

      {/* manual tracking */}
      <Modal open={modal === 'manual'} title="Add tracking manually" onClose={() => setModal(null)}
        footer={<><Btn onClick={() => setModal(null)}>Cancel</Btn><Btn variant="primary" loading={busy === 'manual'} onClick={() => act('manual', () => post(`/orders/${o.number}/shipment/manual`, form), 'Marked as shipped')}>Mark as shipped</Btn></>}>
        <p className="adm-muted">Use this when you ship outside Shiprocket (own courier or hand delivery).</p>
        <Field label="Courier"><Input value={form.courier} onChange={(e) => setForm({ ...form, courier: e.target.value })} placeholder="e.g. Delhivery" /></Field>
        <Field label="AWB / tracking number (optional)"><Input value={form.awb} onChange={(e) => setForm({ ...form, awb: e.target.value })} /></Field>
        <Field label="Tracking link (optional)"><Input value={form.tracking_url} onChange={(e) => setForm({ ...form, tracking_url: e.target.value })} placeholder="https://" /></Field>
      </Modal>
    </>
  );
}

function NoteEditor({ number, value, onSaved }) {
  const { toast } = useUi();
  const [note, setNote] = useState(value || '');
  const [busy, setBusy] = useState(false);
  const dirty = note !== (value || '');
  return (
    <div className="adm-stack" style={{ gap: 8 }}>
      <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only visible to admins" />
      {dirty && (
        <Btn size="sm" variant="primary" loading={busy} onClick={async () => {
          setBusy(true);
          try {
            await post(`/orders/${number}/note`, { note });
            toast('Note saved');
            onSaved();
          } catch (e) {
            toast(e.message, 'critical');
          } finally {
            setBusy(false);
          }
        }}>Save note</Btn>
      )}
    </div>
  );
}
