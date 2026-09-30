import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, rupees } from '../shop/api.js';
import { useCart } from '../shop/CartContext.jsx';
import { useSite } from '../shop/SiteContext.jsx';
import { useSeo } from '../shop/useSeo.js';

export default function CartPage() {
  const cart = useCart();
  const { config } = useSite();
  const navigate = useNavigate();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  useSeo('Your Cart', { noindex: true });

  // Re-price the cart from the server whenever it changes
  useEffect(() => {
    if (!cart.items.length) {
      setQuote(null);
      return;
    }
    let alive = true;
    setError('');
    api.quote(cart.items).then(
      (q) => alive && setQuote(q),
      (err) => alive && setError(err.message)
    );
    return () => {
      alive = false;
    };
  }, [cart.items]);

  if (!cart.items.length) {
    return (
      <main className="shop-page container">
        <div className="cart-empty">
          <i className="fas fa-cart-shopping"></i>
          <h1>Your cart is empty</h1>
          <p>Explore Ghaslet hot sauces, Chilli Crisp, DK's Boom Boom Lemonde and merch.</p>
          <Link to="/shop" className="btn-red"><i className="fas fa-store"></i>Continue shopping</Link>
        </div>
      </main>
    );
  }

  const lines = quote?.lines || [];
  const blocked = lines.some((l) => l.error);
  const freeAbove = config?.shipping?.freeAbove || 0;
  const toFree = quote && quote.delivery > 0 && freeAbove ? freeAbove - (quote.subtotal - quote.discountAmount) : 0;

  return (
    <main className="shop-page container">
      <h1 className="shop-h1">Shopping Cart</h1>
      {error && <div className="shop-alert">{error}</div>}
      <div className="cart-layout">
        <div className="cart-lines">
          {!quote && !error && <div className="shop-loading"><span className="shop-spinner"></span>Checking prices…</div>}
          {lines.map((l) => {
            const img = l.image ? <img src={l.image} alt={l.name} /> : <i className="fas fa-image"></i>;
            const max = Math.min(99, l.stock ?? 99);
            return (
              <div className={'cart-line' + (l.error ? ' has-error' : '')} key={l.variantId}>
                {l.slug ? <Link to={`/product/${l.slug}`} className="cart-img">{img}</Link> : <div className="cart-img">{img}</div>}
                <div className="cart-info">
                  {l.slug ? <Link to={`/product/${l.slug}`} className="cart-name">{l.name}</Link> : <span className="cart-name">{l.name || 'Unavailable product'}</span>}
                  {l.option && <div className="cart-opt">Option: {l.option}</div>}
                  {l.error ? (
                    <div className="cart-err">{l.error}</div>
                  ) : (
                    <div className={l.stock <= 5 ? 'cart-low' : 'cart-ok'}>{l.stock <= 5 ? `Only ${l.stock} left` : 'In stock'}</div>
                  )}
                  <div className="cart-actions">
                    <div className="qty-stepper">
                      <button onClick={() => cart.setQty(l.variantId, l.qty - 1)} aria-label={l.qty === 1 ? 'Remove' : 'Decrease quantity'}>
                        <i className={'fas ' + (l.qty === 1 ? 'fa-trash' : 'fa-minus')}></i>
                      </button>
                      <span aria-live="polite">{l.qty}</span>
                      <button onClick={() => cart.setQty(l.variantId, l.qty + 1)} disabled={Boolean(l.error) || l.qty >= max} aria-label="Increase quantity">
                        <i className="fas fa-plus"></i>
                      </button>
                    </div>
                    <button className="cart-remove" onClick={() => cart.remove(l.variantId)}>Remove</button>
                  </div>
                </div>
                <div className="cart-price">{l.error ? '-' : rupees(l.lineTotal)}</div>
              </div>
            );
          })}
        </div>

        <aside className="cart-summary">
          {quote && (
            <>
              <div className="sum-row"><span>Subtotal ({cart.count} item{cart.count > 1 ? 's' : ''})</span><strong>{rupees(quote.subtotal)}</strong></div>
              <div className="sum-row"><span>Delivery</span><strong>{quote.delivery ? rupees(quote.delivery) : 'Free'}</strong></div>
              <div className="sum-row sum-total"><span>Total</span><strong>{rupees(quote.total)}</strong></div>
              {toFree > 0 && <p className="sum-note"><i className="fas fa-truck"></i> Add {rupees(toFree)} more for free delivery.</p>}
              <p className="sum-note"><i className="fas fa-tag"></i> Have a coupon? Apply it at checkout.</p>
            </>
          )}
          <button className="pd-btn pd-btn-buy w-100" disabled={!quote || blocked} onClick={() => navigate('/checkout')}>
            Proceed to Buy
          </button>
          {blocked && <p className="cart-err mt-2">Remove or update the items marked in red to continue.</p>}
          <Link to="/shop" className="cart-continue"><i className="fas fa-arrow-left"></i> Continue shopping</Link>
        </aside>
      </div>
    </main>
  );
}
