import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, rupees } from '../shop/api.js';
import { useAuth } from '../shop/AuthContext.jsx';
import { useSeo } from '../shop/useSeo.js';
import { SummaryRows } from './CheckoutPage.jsx';

export const STATUS = {
  placed: 'Order placed',
  confirmed: 'Confirmed',
  processing: 'Being packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  pending_payment: 'Waiting for payment',
};

export const paymentLabel = (o) =>
  o.paymentMethod === 'cod'
    ? o.paymentStatus === 'paid' ? 'Cash on Delivery (paid)' : 'Cash on Delivery'
    : { paid: 'Paid online', refunded: 'Refunded', pending: 'Payment pending', failed: 'Payment not completed' }[o.paymentStatus] || o.paymentStatus;

const fmtDateTime = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' });

function Hero({ order }) {
  const first = order.name.split(' ')[0];
  if (order.status === 'cancelled') {
    return (
      <div className="order-hero cancelled">
        <i className="fas fa-circle-xmark"></i>
        <h1>Order cancelled</h1>
        <p>
          Order <strong>{order.number}</strong> was cancelled{order.cancelReason ? ` (${order.cancelReason})` : ''}.
          {order.paymentStatus === 'refunded' && ' Your refund has been issued to the original payment method.'}
          {order.paymentStatus === 'paid' && ' Your refund is being processed and usually reaches you in 5-7 working days.'}
        </p>
      </div>
    );
  }
  if (order.status === 'pending_payment') {
    return (
      <div className="order-hero pending">
        <i className="fas fa-hourglass-half"></i>
        <h1>Waiting for your payment</h1>
        <p>We have not received the payment for order <strong>{order.number}</strong> yet. If money was taken from your account, it will be confirmed here shortly.</p>
      </div>
    );
  }
  if (order.status === 'delivered') {
    return (
      <div className="order-hero">
        <i className="fas fa-box-open"></i>
        <h1>Delivered - enjoy, {first}!</h1>
        <p>Order <strong>{order.number}</strong> has been delivered. Tell others what you thought by rating the products below.</p>
      </div>
    );
  }
  return (
    <div className="order-hero">
      <i className="fas fa-circle-check"></i>
      <h1>Thank you, {first}!</h1>
      <p>
        Your order <strong>{order.number}</strong> {['shipped'].includes(order.status) ? 'is on its way' : 'has been placed'}.
        {' '}We send order updates to {order.email}.
      </p>
    </div>
  );
}

function Tracking({ order }) {
  const t = order.tracking;
  if (order.status === 'cancelled' || order.status === 'pending_payment') return null;
  const current = t.steps.filter((s) => s.done).length - 1;
  return (
    <div className="co-card">
      <h2>Track your order</h2>
      <ol className="track-steps">
        {t.steps.map((s, i) => (
          <li key={s.key} className={(s.done ? 'done' : '') + (i === current ? ' current' : '')}>
            <span className="track-dot">{s.done ? <i className="fas fa-check"></i> : null}</span>
            <span className="track-label">{s.label}</span>
          </li>
        ))}
      </ol>
      {(t.courier || t.awb || t.expectedDelivery) && (
        <div className="track-info">
          {t.courier && <div><span>Courier</span><strong>{t.courier}</strong></div>}
          {t.awb && <div><span>Tracking number (AWB)</span><strong>{t.awb}</strong></div>}
          {t.expectedDelivery && order.status !== 'delivered' && <div><span>Expected delivery</span><strong>{fmtDate(t.expectedDelivery)}</strong></div>}
          {t.url && <a href={t.url} target="_blank" rel="noreferrer" className="pd-btn pd-btn-cart">Track on courier website <i className="fas fa-arrow-up-right-from-square"></i></a>}
        </div>
      )}
      {t.events?.length > 0 && (
        <ul className="track-events">
          {t.events.map((e, i) => (
            <li key={i}>
              <strong>{e.description || e.status}</strong>
              <span>{[e.location, e.time && fmtDateTime(e.time)].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
      {!t.courier && !t.awb && <p className="pd-muted mb-0">Shipping details will appear here once your parcel is handed to the courier.</p>}
    </div>
  );
}

function CancelBox({ order, onDone }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.cancelOrder(order.number, reason || 'Changed my mind');
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  if (!open) {
    return <button type="button" className="pd-btn order-cancel-btn w-100 mt-2" onClick={() => setOpen(true)}><i className="fas fa-ban"></i> Cancel order</button>;
  }
  return (
    <div className="order-cancel">
      <label className="co-label" htmlFor="cancel-reason">Why are you cancelling? (optional)</label>
      <select id="cancel-reason" className="co-input" value={reason} onChange={(e) => setReason(e.target.value)}>
        <option value="">Choose a reason…</option>
        <option>Ordered by mistake</option>
        <option>Want to change items or quantity</option>
        <option>Want to change the delivery address</option>
        <option>Delivery is taking too long</option>
        <option>Found a better price</option>
        <option>Other</option>
      </select>
      {order.paymentStatus === 'paid' && <p className="pd-muted">You paid online, so the full amount will be refunded to your original payment method.</p>}
      {error && <div className="cart-err">{error}</div>}
      <div className="d-flex gap-2 mt-2">
        <button type="button" className="pd-btn pd-btn-buy" disabled={busy} onClick={submit}>{busy ? 'Cancelling…' : 'Yes, cancel order'}</button>
        <button type="button" className="pd-btn pd-btn-cart" onClick={() => setOpen(false)}>Keep order</button>
      </div>
    </div>
  );
}

export default function OrderPage() {
  const { number } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const token = params.get('t') || ''; // owners can also open it while signed in
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  useSeo(`Order ${number}`, { noindex: true });

  const load = useCallback(() => api.order(number, token).then(setOrder, (err) => setError(err.message)), [number, token]);
  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <main className="shop-page container">
        <div className="shop-alert text-center">
          <h3>{error}</h3>
          {!user && <p>If this is your order, <Link to={`/signin?next=${encodeURIComponent(`/order/${number}`)}`}>sign in</Link> to see it.</p>}
          <Link to="/" className="btn-red mt-3">Go to homepage</Link>
        </div>
      </main>
    );
  }
  if (!order) {
    return (
      <main className="shop-page container">
        <div className="shop-loading"><span className="shop-spinner"></span>Loading your order…</div>
      </main>
    );
  }

  const invoiceOk = order.status !== 'pending_payment' && order.status !== 'cancelled';
  const owner = Boolean(user);
  return (
    <main className="shop-page container">
      <Hero order={order} />

      <div className="cart-layout">
        <div>
          <Tracking order={order} />
          <div className="co-card">
            <h2>Items</h2>
            {order.items.map((i, k) => (
              <div className="co-line no-img" key={k}>
                <div className="co-line-name">
                  {i.slug ? <Link to={`/product/${i.slug}`}>{i.name}</Link> : i.name}
                  {i.option && <small>{i.option}</small>}
                  <small>Qty {i.qty} × {rupees(i.unitPrice)}</small>
                  {order.status === 'delivered' && i.slug && owner && <Link to={`/product/${i.slug}#reviews`} className="order-review-link"><i className="fas fa-star"></i> Rate this product</Link>}
                </div>
                <div className="co-line-price">{rupees(i.lineTotal)}</div>
              </div>
            ))}
            <SummaryRows q={{ subtotal: order.subtotal, discount: order.discount, discountCode: order.discountCode, delivery: order.delivery, tax: order.tax, taxInclusive: order.total === order.subtotal - order.discount + order.delivery, total: order.total }} />
          </div>
        </div>

        <aside className="co-summary">
          <h2>Details</h2>
          <div className="order-kv"><span>Status</span><strong>{STATUS[order.status] || order.status}</strong></div>
          <div className="order-kv"><span>Placed on</span><strong>{fmtDateTime(order.createdAt)}</strong></div>
          <div className="order-kv"><span>Payment</span><strong>{paymentLabel(order)}</strong></div>
          <div className="order-kv">
            <span>Deliver to</span>
            <strong>
              {order.name}<br />
              {order.address.line}<br />
              {order.address.city}, {order.address.state} - {order.address.pin}<br />
              {order.phone}
            </strong>
          </div>
          {invoiceOk && (
            <Link to={`/order/${order.number}/invoice${token ? `?t=${token}` : ''}`} className="pd-btn pd-btn-cart w-100 mt-3">
              <i className="fas fa-file-invoice"></i> View / print invoice
            </Link>
          )}
          {order.canCancel && owner && <CancelBox order={order} onDone={load} />}
          {order.canCancel && !owner && (
            <p className="pd-muted mt-2"><Link to={`/signin?next=${encodeURIComponent(`/order/${order.number}`)}`}>Sign in</Link> to cancel this order.</p>
          )}
          {owner && <Link to="/account/orders" className="cart-continue"><i className="fas fa-box"></i> All your orders</Link>}
          <Link to="/shop" className="cart-continue"><i className="fas fa-arrow-left"></i> Continue shopping</Link>
          <Link to="/contact" className="cart-continue"><i className="fas fa-headset"></i> Need help with this order?</Link>
        </aside>
      </div>
    </main>
  );
}
