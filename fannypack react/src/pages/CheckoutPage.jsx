import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, rupees } from '../shop/api.js';
import { useCart } from '../shop/CartContext.jsx';
import { useAuth } from '../shop/AuthContext.jsx';
import { useSite } from '../shop/SiteContext.jsx';
import { useSeo } from '../shop/useSeo.js';
import AddressFields, { EMPTY_ADDRESS } from '../shop/AddressForm.jsx';

// Load Razorpay's checkout script once
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// "?buy=12x2" -> [{ variantId: 12, qty: 2 }]  (Buy Now skips the cart)
function parseBuy(param) {
  const m = /^(\d+)x(\d+)$/.exec(param || '');
  return m ? [{ variantId: Number(m[1]), qty: Math.min(99, Math.max(1, Number(m[2]))) }] : null;
}

export function SummaryRows({ q }) {
  return (
    <>
      <div className="sum-row"><span>Subtotal</span><strong>{rupees(q.subtotal)}</strong></div>
      {q.discount > 0 && (
        <div className="sum-row sum-discount"><span>Discount{q.discountCode ? ` (${q.discountCode})` : ''}</span><strong>-{rupees(q.discount)}</strong></div>
      )}
      <div className="sum-row"><span>Delivery</span><strong>{q.delivery ? rupees(q.delivery) : 'Free'}</strong></div>
      {q.tax > 0 && !q.taxInclusive && <div className="sum-row"><span>GST</span><strong>{rupees(q.tax)}</strong></div>}
      <div className="sum-row sum-total"><span>Order total</span><strong>{rupees(q.total)}</strong></div>
      {q.tax > 0 && q.taxInclusive && <div className="sum-note">Includes {rupees(q.tax)} GST</div>}
    </>
  );
}

export default function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const cart = useCart();
  const { user } = useAuth();
  const { config } = useSite();
  const buyNow = useMemo(() => parseBuy(params.get('buy')), [params]);
  const items = buyNow || cart.items;
  useSeo('Checkout', { noindex: true });

  const [quote, setQuote] = useState(null);
  const [addr, setAddr] = useState({ ...EMPTY_ADDRESS, name: user?.name || '', phone: user?.phone || '' });
  const [email, setEmail] = useState(user?.email || '');
  const [saved, setSaved] = useState([]);
  const [pickedId, setPickedId] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [pinCheck, setPinCheck] = useState(null); // { ok, message }
  const [method, setMethod] = useState(null);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const orderRef = useRef(null);

  const cod = config ? config.cod !== false : false;
  const online = Boolean(config?.razorpay);

  // default payment method once we know what is on offer
  useEffect(() => {
    if (!config || method) return;
    setMethod(online ? 'online' : cod ? 'cod' : null);
  }, [config, online, cod, method]);

  // Saved addresses (default first); fall back to the last order's address
  useEffect(() => {
    api.addresses().then((list) => {
      setSaved(list);
      const first = list[0];
      if (first) {
        setPickedId(first.id);
        setAddr({ name: first.name, phone: first.phone, address_line: first.address_line, city: first.city, state: first.state, pin: first.pin });
      } else {
        api.lastAddress().then(({ address }) => {
          if (!address) return;
          setAddr((f) => ({ ...f, ...Object.fromEntries(Object.entries(address).filter(([k, v]) => v && k in EMPTY_ADDRESS)) }));
          if (address.email) setEmail((e) => e || address.email);
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  // Price the order (again whenever the items or coupon change)
  useEffect(() => {
    if (!items.length) return;
    let alive = true;
    api.quote(items, coupon).then(
      (q) => alive && setQuote(q),
      (err) => alive && setError(err.message)
    );
    return () => {
      alive = false;
    };
  }, [items, coupon]);

  const checkPin = useCallback((state, pin) => {
    if (!/^[1-9]\d{5}$/.test(pin || '')) return setPinCheck(null);
    api.serviceability(state, pin).then(setPinCheck).catch(() => setPinCheck(null));
  }, []);
  // re-check when a saved address is picked or the state changes
  useEffect(() => {
    checkPin(addr.state, addr.pin);
  }, [addr.state, pickedId, checkPin]); // eslint-disable-line react-hooks/exhaustive-deps

  const onAddrChange = useCallback((next, key) => {
    setAddr(next);
    if (key) setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
    if (key === 'pin') setPinCheck(null);
  }, []);

  if (!items.length) {
    return (
      <main className="shop-page container">
        <div className="cart-empty">
          <i className="fas fa-cart-shopping"></i>
          <h1>Nothing to check out</h1>
          <Link to="/shop" className="btn-red"><i className="fas fa-store"></i>Shop now</Link>
        </div>
      </main>
    );
  }

  const blocked = quote?.lines.some((l) => l.error);
  const closed = config && config.storeOpen === false;
  const noMethod = config && !online && !cod;
  const discount = quote?.discount;
  const summary = quote && {
    subtotal: quote.subtotal, discount: quote.discountAmount, discountCode: discount && !discount.error ? discount.code : null,
    delivery: quote.delivery, tax: quote.tax, taxInclusive: quote.taxInclusive, total: quote.total,
  };

  const applyCoupon = (e) => {
    e.preventDefault();
    setCoupon(couponInput.trim().toUpperCase());
  };
  const removeCoupon = () => {
    setCoupon('');
    setCouponInput('');
  };

  const pickSaved = (a) => {
    setPickedId(a.id);
    setAddr({ name: a.name, phone: a.phone, address_line: a.address_line, city: a.city, state: a.state, pin: a.pin });
    setFieldErrors({});
  };

  const finish = (number, token) => {
    if (!buyNow) cart.clear();
    navigate(`/order/${number}?t=${token}`, { replace: true });
  };

  const placeOrder = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    if (!method) return setError('Choose a payment method.');
    if (pinCheck && !pinCheck.ok) {
      setFieldErrors({ pin: pinCheck.message });
      return setError(pinCheck.message);
    }
    setBusy(true);
    try {
      const res = await api.placeOrder({
        items,
        customer: { ...addr, email },
        paymentMethod: method,
        fromCart: !buyNow,
        code: coupon && discount && !discount.error ? coupon : undefined,
      });
      orderRef.current = res;
      if (res.paymentMethod === 'cod') {
        finish(res.number, res.token);
        return;
      }
      // Online payment with Razorpay
      const ok = await loadRazorpay();
      if (!ok) {
        await api.cancelPayment(res.number, res.token, { error: 'Checkout script could not load' }).catch(() => {});
        throw new Error('Could not load the payment window. Please check your connection' + (cod ? ' or choose Cash on Delivery.' : ' and try again.'));
      }
      let lastFailure = null;
      const rp = new window.Razorpay({
        key: res.razorpay.keyId,
        amount: res.razorpay.amount,
        currency: res.razorpay.currency,
        order_id: res.razorpay.orderId,
        name: 'Bookends Fanny Pack',
        description: `Order ${res.number}`,
        prefill: res.razorpay.prefill,
        theme: { color: '#e8281a' },
        handler: async (payment) => {
          try {
            await api.verifyPayment(res.number, { token: res.token, ...payment });
            finish(res.number, res.token);
          } catch (err) {
            setError(err.message);
            setBusy(false);
          }
        },
        modal: {
          ondismiss: async () => {
            await api.cancelPayment(res.number, res.token, lastFailure).catch(() => {});
            setError(lastFailure ? `Payment failed: ${lastFailure.error}. Your order was not placed - you can try again.` : 'Payment was cancelled. Your order was not placed - you can try again.');
            setBusy(false);
          },
        },
      });
      rp.on('payment.failed', (resp) => {
        lastFailure = { error: resp?.error?.description || 'Payment failed', paymentId: resp?.error?.metadata?.payment_id };
        setError(`${lastFailure.error}. You can try again in the payment window.`);
      });
      rp.open();
    } catch (err) {
      if (err.data?.fields) setFieldErrors(err.data.fields);
      if (err.data?.quote) setQuote(err.data.quote);
      setError(err.message);
      setBusy(false);
    }
  };

  const placeLabel = !quote ? 'Place order' : method === 'online' ? `Pay ${rupees(quote.total)}` : 'Place order (Cash on Delivery)';

  return (
    <main className="shop-page container">
      <h1 className="shop-h1">Checkout</h1>
      {closed && <div className="shop-alert mb-3"><i className="fas fa-store-slash"></i> {config.closedMessage || 'The store is not taking orders right now.'}</div>}
      <form className="checkout-layout" onSubmit={placeOrder} noValidate>
        <div>
          <section className="co-card">
            <h2><span>1</span>Delivery address</h2>
            {config?.deliveryNote && <p className="co-note"><i className="fas fa-truck"></i> {config.deliveryNote}</p>}
            {saved.length > 0 && (
              <div className="co-saved">
                {saved.map((a) => (
                  <label key={a.id} className={'co-saved-addr' + (pickedId === a.id ? ' active' : '')}>
                    <input type="radio" name="saved-addr" checked={pickedId === a.id} onChange={() => pickSaved(a)} />
                    <span><strong>{a.name}</strong> {a.address_line}, {a.city}, {a.state} - {a.pin} · {a.phone}</span>
                  </label>
                ))}
                <label className={'co-saved-addr' + (pickedId === 'new' ? ' active' : '')}>
                  <input type="radio" name="saved-addr" checked={pickedId === 'new'} onChange={() => { setPickedId('new'); setAddr({ ...EMPTY_ADDRESS, name: user?.name || '', phone: user?.phone || '' }); setPinCheck(null); }} />
                  <span><i className="fas fa-plus"></i> Deliver to a new address</span>
                </label>
              </div>
            )}
            {(saved.length === 0 || pickedId === 'new' || Object.keys(fieldErrors).length > 0) && (
              <AddressFields
                value={addr}
                onChange={(next, key) => { onAddrChange(next, key); if (key && pickedId !== 'new' && saved.length) setPickedId('new'); }}
                errors={fieldErrors}
                onPinBlur={() => checkPin(addr.state, addr.pin)}
                idPrefix="co"
              />
            )}
            {pinCheck && (
              <div className={pinCheck.ok ? 'co-pin-ok' : 'co-err'} role="status">
                <i className={'fas ' + (pinCheck.ok ? 'fa-circle-check' : 'fa-circle-exclamation')}></i> {pinCheck.ok ? `We deliver to ${addr.pin}.` : pinCheck.message}
              </div>
            )}
            <div className="row g-3 mt-1">
              <div className="col-sm-6">
                <label className="co-label" htmlFor="co-email">Email for order updates</label>
                <input id="co-email" type="email" className={'co-input' + (fieldErrors.email ? ' invalid' : '')} value={email} onChange={(e) => { setEmail(e.target.value); setFieldErrors((f) => ({ ...f, email: undefined })); }} autoComplete="email" />
                {fieldErrors.email && <div className="co-err">{fieldErrors.email}</div>}
              </div>
            </div>
          </section>

          <section className="co-card">
            <h2><span>2</span>Payment method</h2>
            {!config && <div className="shop-loading"><span className="shop-spinner"></span>Loading…</div>}
            {config && (
              <>
                <label className={'co-pay' + (method === 'online' ? ' active' : '') + (!online ? ' disabled' : '')}>
                  <input type="radio" name="pay" value="online" checked={method === 'online'} disabled={!online} onChange={() => setMethod('online')} />
                  <div>
                    <strong><i className="fas fa-credit-card"></i> Pay online - UPI, Cards, Netbanking</strong>
                    <small>{online ? 'Secure payment by Razorpay' : 'Online payment is not available right now'}</small>
                  </div>
                </label>
                <label className={'co-pay' + (method === 'cod' ? ' active' : '') + (!cod ? ' disabled' : '')}>
                  <input type="radio" name="pay" value="cod" checked={method === 'cod'} disabled={!cod} onChange={() => setMethod('cod')} />
                  <div>
                    <strong><i className="fas fa-money-bill-wave"></i> Cash on Delivery</strong>
                    <small>{cod ? 'Pay when your order arrives' : 'Cash on Delivery is not available right now'}</small>
                  </div>
                </label>
                {noMethod && <div className="shop-alert mt-2">Ordering is paused right now. Please check back soon.</div>}
              </>
            )}
            {config?.orderNote && <p className="co-note mt-3"><i className="fas fa-circle-info"></i> {config.orderNote}</p>}
          </section>
        </div>

        <aside className="co-summary">
          <h2>Order summary</h2>
          {!quote && !error && <div className="shop-loading"><span className="shop-spinner"></span>Loading…</div>}
          {quote?.lines.map((l) => (
            <div className="co-line" key={l.variantId}>
              <div className="co-line-img">{l.image ? <img src={l.image} alt="" /> : <i className="fas fa-image"></i>}<span>{l.qty}</span></div>
              <div className="co-line-name">
                {l.name}
                {l.option && <small>{l.option}</small>}
                {l.error && <small className="cart-err">{l.error}</small>}
              </div>
              <div className="co-line-price">{l.error ? '-' : rupees(l.lineTotal)}</div>
            </div>
          ))}

          {quote && (
            <div className="co-coupon">
              {coupon && discount && !discount.error ? (
                <div className="co-coupon-ok">
                  <span><i className="fas fa-tag"></i> <strong>{discount.code}</strong> applied{discount.description ? ` - ${discount.description}` : ''}</span>
                  <button type="button" onClick={removeCoupon}>Remove</button>
                </div>
              ) : (
                <div className="co-coupon-row">
                  <input
                    className="co-input"
                    placeholder="Coupon code"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && applyCoupon(e)}
                    aria-label="Coupon code"
                    maxLength={40}
                  />
                  <button type="button" onClick={applyCoupon} disabled={!couponInput.trim()}>Apply</button>
                </div>
              )}
              {coupon && discount?.error && <div className="co-err">{discount.error}</div>}
            </div>
          )}

          {summary && <SummaryRows q={summary} />}
          {error && <div className="shop-alert mt-3" role="alert">{error}</div>}
          <button type="submit" className="pd-btn pd-btn-buy w-100 mt-3" disabled={busy || !quote || blocked || closed || !method || noMethod}>
            {busy ? <><span className="shop-spinner sm"></span>Please wait…</> : placeLabel}
          </button>
          {blocked && <p className="cart-err mt-2">Some items are unavailable. <Link to="/cart">Update your cart</Link>.</p>}
          <p className="co-legal">
            By placing your order you agree to our <Link to="/terms">Terms</Link>, <Link to="/refund-policy">Refund Policy</Link> and <Link to="/privacy-policy">Privacy Policy</Link>.
          </p>
        </aside>
      </form>
    </main>
  );
}
