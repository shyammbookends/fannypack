import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, isPhoto, rupees } from '../shop/api.js';
import { useCart } from '../shop/CartContext.jsx';
import { useAuth } from '../shop/AuthContext.jsx';
import { useSite } from '../shop/SiteContext.jsx';
import { HeartButton } from '../shop/WishlistContext.jsx';
import { useSeo } from '../shop/useSeo.js';
import ShopCard from '../shop/ShopCard.jsx';
import Reviews, { Stars } from '../shop/Reviews.jsx';
import NotFoundPage from './NotFoundPage.jsx';

const MAX_QTY = 10;

function Gallery({ images, name, tone }) {
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(null);
  const [ratios, setRatios] = useState({}); // photo width / height, known once loaded
  const main = images[idx];
  // square / tall photos (e.g. the 30 ml bottle shots) get a square frame so nothing is cropped
  const square = isPhoto(main) && ratios[main] !== undefined && ratios[main] < 1.3;

  // Hover zoom (desktop): follow the mouse with the transform origin
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setZoom(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <div className="pd-gallery">
      {images.length > 1 && (
        <div className="pd-thumbs">
          {images.map((src, i) => (
            <button key={src} className={'pd-thumb' + (i === idx ? ' active' : '')} onMouseEnter={() => setIdx(i)} onClick={() => setIdx(i)} aria-label={`Photo ${i + 1}`}>
              <img src={src} alt={`${name} ${i + 1}`} />
            </button>
          ))}
        </div>
      )}
      <div
        className={'pd-main' + (isPhoto(main) ? ' photo' : '') + (square ? ' square' : '') + (zoom ? ' zooming' : '')}
        style={{ '--tone': tone }}
        onMouseMove={main ? onMove : undefined}
        onMouseLeave={() => setZoom(null)}
      >
        {main ? (
          <img
            src={main}
            alt={name}
            style={zoom ? { transformOrigin: zoom } : undefined}
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
              if (h) setRatios((r) => (r[main] === w / h ? r : { ...r, [main]: w / h }));
            }}
          />
        ) : (
          <div className="pd-noimg"><i className="fas fa-image"></i><span>Photo coming soon</span></div>
        )}
      </div>
    </div>
  );
}

// "Notify me" for an out-of-stock option
function NotifyMe({ variantId }) {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [state, setState] = useState(null); // null | 'busy' | 'done' | error text
  useEffect(() => setState(null), [variantId]);

  const submit = async (e) => {
    e.preventDefault();
    setState('busy');
    try {
      await api.stockAlert(variantId, email.trim());
      setState('done');
    } catch (err) {
      setState(err.message);
    }
  };
  if (state === 'done') return <div className="pd-notify done"><i className="fas fa-bell"></i> We'll email {email.trim()} when it's back in stock.</div>;
  return (
    <form className="pd-notify" onSubmit={submit} noValidate>
      <label htmlFor="notify-email"><i className="fas fa-bell"></i> Get an email when it's back</label>
      <div className="pd-notify-row">
        <input id="notify-email" type="email" className="co-input" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <button className="pd-btn pd-btn-cart" disabled={state === 'busy' || !email.trim()}>Notify me</button>
      </div>
      {state && state !== 'busy' && <div className="cart-err">{state}</div>}
    </form>
  );
}

export default function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const { config } = useSite();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [variantId, setVariantId] = useState(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const addedTimer = useRef(null);
  const p = data?.product;
  useSeo(p ? p.seo_title || p.name : error?.status === 404 ? 'Product not found' : undefined, {
    description: p ? (p.seo_description || p.short_description || p.description || '').slice(0, 160) : undefined,
    image: p?.og_image || p?.images?.[0],
    noindex: error?.status === 404,
  });

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    setQty(1);
    setAdded(false);
    api.product(slug).then(
      (d) => {
        if (!alive) return;
        setData(d);
        const firstInStock = d.product.variants.find((v) => v.stock > 0) || d.product.variants[0];
        setVariantId(firstInStock?.id ?? null);
      },
      (err) => alive && setError(err)
    );
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => () => clearTimeout(addedTimer.current), []);

  if (error?.status === 404) return <NotFoundPage what="product" />;
  if (error) {
    return (
      <main className="shop-page container">
        <div className="shop-alert text-center">
          <h3>{error.message}</h3>
          <Link to="/shop" className="btn-red mt-3"><i className="fas fa-arrow-left"></i>Back to shop</Link>
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="shop-page container">
        <div className="shop-loading"><span className="shop-spinner"></span>Loading product…</div>
      </main>
    );
  }

  const { sameCategory, moreProducts } = data;
  const variant = p.variants.find((v) => v.id === variantId);
  const hasOptions = p.variants.length > 1 || (p.variants[0] && p.variants[0].option);
  const stock = variant?.stock ?? 0;
  const gallery = variant?.image ? [variant.image, ...p.images.filter((i) => i !== variant.image)] : p.images;
  const maxQty = Math.min(MAX_QTY, stock);
  const catLink = `/shop?category=${encodeURIComponent(p.category.id)}`;
  const closed = config && config.storeOpen === false;
  const cod = config ? config.cod !== false : true;
  const online = Boolean(config?.razorpay);
  const discountPct = variant?.compare_at_price > variant?.price ? Math.round((1 - variant.price / variant.compare_at_price) * 100) : 0;
  const isFood = !['tshirt', 'jacket', 'pendent'].includes(p.kind);

  const addToCart = () => {
    if (!variant || stock < 1) return;
    cart.add(variant.id, qty);
    setAdded(true);
    clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(false), 4000);
  };
  const buyNow = () => {
    if (!variant || stock < 1) return;
    navigate(`/checkout?buy=${variant.id}x${qty}`);
  };

  const stockText = stock < 1 ? 'Out of stock' : stock <= 5 ? `Only ${stock} left in stock - order soon.` : 'In stock';

  return (
    <main className="shop-page">
      <div className="container">
        {/* Breadcrumb */}
        <nav className="pd-crumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <i className="fas fa-chevron-right"></i>
          <Link to={catLink}>{p.category.name}</Link>
          <i className="fas fa-chevron-right"></i>
          <span>{p.name}</span>
        </nav>

        <div className="pd-top">
          {/* the chosen option's own photo comes first; remounts (back to photo 1) when it changes */}
          <Gallery key={variant?.image || 'base'} images={gallery} name={variant?.option ? `${p.name} ${variant.option}` : p.name} tone={p.color} />

          {/* Details */}
          <div className="pd-info">
            <Link to={catLink} className="pd-cat">{p.category.name}</Link>
            <h1 className="pd-title">{p.name}</h1>
            {p.rating?.count > 0 && (
              <a href="#reviews" className="pd-rating"><Stars value={p.rating.average} size="sm" /> {p.rating.average.toFixed(1)} · {p.rating.count} rating{p.rating.count > 1 ? 's' : ''}</a>
            )}
            {p.category.note && <p className="pd-tagline">{p.category.note}</p>}
            <hr />
            <div className="pd-price">
              {discountPct > 0 && <span className="pd-price-off">-{discountPct}%</span>}
              <span className="pd-price-cur">{rupees(variant?.price ?? p.price_from)}</span>
              {hasOptions && variant?.option && <span className="pd-price-for">for {variant.option}</span>}
            </div>
            {discountPct > 0 && <div className="pd-mrp">M.R.P.: <s>{rupees(variant.compare_at_price)}</s></div>}
            <div className="pd-taxnote">{config?.taxInclusive === false ? 'GST extra, added at checkout' : 'Inclusive of all taxes'}</div>

            {hasOptions && (
              <div className="pd-options">
                <div className="pd-options-label">
                  {p.kind === 'bottle' ? 'Size' : 'Option'}: <strong>{variant?.option}</strong>
                </div>
                <div className="pd-chips">
                  {p.variants.map((v) => (
                    <button
                      key={v.id}
                      className={'pd-chip' + (v.id === variantId ? ' active' : '') + (v.stock < 1 ? ' oos' : '')}
                      aria-pressed={v.id === variantId}
                      onClick={() => {
                        setVariantId(v.id);
                        setQty(1);
                      }}
                    >
                      <span>{v.option}</span>
                      <small>{v.stock < 1 ? 'Out of stock' : rupees(v.price)}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(p.short_description || p.description) && <p className="pd-desc">{p.short_description || p.description}</p>}

            {p.features?.length > 0 && (
              <div className="pd-about">
                <h3>About this item</h3>
                <ul>
                  {p.features.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* Buy box */}
          <aside className="pd-buybox">
            <div className="pd-bb-price">{rupees((variant?.price ?? 0) * qty)}</div>
            {qty > 1 && <div className="pd-bb-each">{rupees(variant?.price)} each</div>}
            <div className={'pd-bb-stock' + (stock < 1 ? ' out' : stock <= 5 ? ' low' : '')}>{stockText}</div>
            {config?.deliveryNote && <div className="pd-bb-note"><i className="fas fa-truck"></i> {config.deliveryNote}</div>}

            {stock > 0 && (
              <label className="pd-bb-qty">
                Quantity:
                <select value={qty} onChange={(e) => setQty(Number(e.target.value))}>
                  {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            )}

            {closed && <div className="shop-alert"><i className="fas fa-store-slash"></i> {config.closedMessage || 'We are not taking orders right now.'}</div>}
            <button className="pd-btn pd-btn-cart" disabled={stock < 1} onClick={addToCart}>
              <i className="fas fa-cart-plus"></i>Add to Cart
            </button>
            <button className="pd-btn pd-btn-buy" disabled={stock < 1 || closed} onClick={buyNow}>
              <i className="fas fa-bolt"></i>Buy Now
            </button>
            <HeartButton productId={p.id} className="pd-wish" label="Add to wishlist" />

            {stock < 1 && variant && <NotifyMe variantId={variant.id} />}

            {added && (
              <div className="pd-added" role="status">
                <i className="fas fa-circle-check"></i> Added to cart.
                <Link to="/cart">Go to cart</Link>
              </div>
            )}

            <ul className="pd-bb-perks">
              {cod && <li><i className="fas fa-money-bill-wave"></i>Cash on Delivery available</li>}
              {online && <li><i className="fas fa-lock"></i>Secure online payment (Razorpay)</li>}
              <li><i className="fas fa-rotate-left"></i><Link to="/refund-policy">Returns &amp; refund policy</Link></li>
              <li><i className="fas fa-store"></i>Sold by Bookends Fanny Pack</li>
            </ul>
          </aside>
        </div>

        {/* Details below the fold */}
        <section className="pd-sections">
          {p.description && (
            <div className="pd-block">
              <h2>Product description</h2>
              <p className="pd-longdesc">{p.description}</p>
            </div>
          )}

          {isFood && (
            <div className="pd-block">
              <h2>Ingredients</h2>
              {p.ingredients?.length ? (
                <ul className="pd-ingredients">
                  {p.ingredients.map((i) => <li key={i}>{i}</li>)}
                </ul>
              ) : (
                <p className="pd-muted">Please see the label on the pack for the full ingredient list, allergen information and best-before date.</p>
              )}
            </div>
          )}

          {p.specifications?.length > 0 && (
            <div className="pd-block">
              <h2>Product information</h2>
              <table className="pd-specs">
                <tbody>
                  {p.specifications.map(([k, v]) => (
                    <tr key={k}>
                      <th>{k}</th>
                      <td>{v}</td>
                    </tr>
                  ))}
                  {!p.specifications.some(([k]) => /collection|category/i.test(k)) && (
                    <tr>
                      <th>Collection</th>
                      <td>{p.category.name}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <Reviews slug={p.slug} />
        </section>

        {/* More products */}
        {sameCategory.length > 0 && (
          <section className="pd-related">
            <h2>More from {p.category.name}</h2>
            <div className="pd-row">
              {sameCategory.map((o) => <ShopCard key={o.id} product={o} />)}
            </div>
          </section>
        )}
        {moreProducts.length > 0 && (
          <section className="pd-related">
            <h2>You may also like</h2>
            <div className="pd-grid">
              {moreProducts.map((o) => <ShopCard key={o.id} product={o} />)}
            </div>
          </section>
        )}
      </div>

      {/* Mobile: sticky buy bar */}
      <div className="pd-sticky">
        <div className="pd-sticky-price">{rupees((variant?.price ?? 0) * qty)}</div>
        <button className="pd-btn pd-btn-cart" disabled={stock < 1} onClick={addToCart}>Add to Cart</button>
        <button className="pd-btn pd-btn-buy" disabled={stock < 1 || closed} onClick={buyNow}>Buy Now</button>
      </div>
    </main>
  );
}
