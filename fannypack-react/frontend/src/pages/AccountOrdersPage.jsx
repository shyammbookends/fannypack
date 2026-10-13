import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, rupees } from '../shop/api.js';
import { useAuth } from '../shop/AuthContext.jsx';
import { useSeo } from '../shop/useSeo.js';
import { paymentLabel, STATUS } from './OrderPage.jsx';

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

export default function AccountOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  useSeo('Your Orders', { noindex: true });

  useEffect(() => {
    api.myOrders().then(setOrders, (err) => setError(err.message));
  }, []);

  return (
    <main className="shop-page container">
      <nav className="policy-crumbs"><Link to="/account">Your Account</Link><i className="fas fa-chevron-right"></i><span>Your Orders</span></nav>
      <h1 className="shop-h1">Your Orders</h1>
      <p className="orders-hello">Signed in as <strong>{user.name}</strong> ({user.email}{user.phone ? ` · ${user.phone}` : ''})</p>
      {error && <div className="shop-alert">{error}</div>}
      {!orders && !error && <div className="shop-loading"><span className="shop-spinner"></span>Loading your orders…</div>}
      {orders && orders.length === 0 && (
        <div className="cart-empty">
          <i className="fas fa-box-open"></i>
          <h2>No orders yet</h2>
          <p>When you place an order it will show up here.</p>
          <Link to="/shop" className="btn-red"><i className="fas fa-store"></i>Start shopping</Link>
        </div>
      )}
      {orders?.map((o) => (
        <div className={'order-card' + (o.status === 'cancelled' ? ' is-cancelled' : '')} key={o.number}>
          <div className="order-card-head">
            <div><span>Order placed</span><strong>{fmtDate(o.createdAt)}</strong></div>
            <div><span>Total</span><strong>{rupees(o.total)}</strong></div>
            <div><span>Payment</span><strong>{paymentLabel(o)}</strong></div>
            <div className="ms-auto text-end"><span>Order # {o.number}</span><Link to={`/order/${o.number}`}>View order details</Link></div>
          </div>
          <div className="order-card-body">
            <div className="order-card-status">
              {STATUS[o.status] || o.status}
              {o.tracking?.courier && o.status === 'shipped' && <small> · {o.tracking.courier}{o.tracking.awb ? ` (AWB ${o.tracking.awb})` : ''}</small>}
            </div>
            {o.items.map((i, k) => (
              <div className="order-card-item" key={k}>
                <span>{i.slug ? <Link to={`/product/${i.slug}`}>{i.name}</Link> : i.name}{i.option ? ` · ${i.option}` : ''}</span>
                <span className="text-muted">Qty {i.qty}</span>
                <strong>{rupees(i.lineTotal)}</strong>
              </div>
            ))}
            <div className="order-card-actions">
              <Link to={`/order/${o.number}`} className="pd-btn pd-btn-cart">{o.status === 'shipped' ? 'Track package' : 'Order details'}</Link>
              {o.canCancel && <Link to={`/order/${o.number}`} className="pd-btn pd-btn-cart">Cancel order</Link>}
              {o.status !== 'pending_payment' && o.status !== 'cancelled' && <Link to={`/order/${o.number}/invoice`} className="pd-btn pd-btn-cart">Invoice</Link>}
              {o.status === 'delivered' && o.items[0]?.slug && <Link to={`/product/${o.items[0].slug}#reviews`} className="pd-btn pd-btn-cart">Write a review</Link>}
            </div>
          </div>
        </div>
      ))}
    </main>
  );
}
