import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isPhoto, loadProducts, rupees } from '../shop/api.js';
import { Highlighted, useSite } from '../shop/SiteContext.jsx';
import { HeartButton } from '../shop/WishlistContext.jsx';

// Every card that can appear in the grid: one "group" card per grouped collection
// (display mode "group" in Admin -> Collections), followed by that collection's products.
// Cards are always rendered and hidden with the "gone" class so AOS keeps working.
function buildCards(categories, products) {
  return categories.flatMap((cat) => {
    const grouped = cat.display_mode === 'group';
    const items = products
      .filter((p) => p.category.id === cat.id)
      .map((p) => ({ type: 'product', key: p.id, cat, grouped, product: p }));
    if (!items.length) return [];
    return grouped ? [{ type: 'group', key: 'group-' + cat.id, cat, grouped, count: items.length }, ...items] : items;
  });
}

function isVisible(card, filter) {
  if (filter === 'all') return card.type === 'group' || !card.grouped;
  return card.type === 'product' && card.cat.id === filter;
}

function CardImage({ img, alt, children, banner }) {
  return (
    <div className={'mimg' + (img ? (banner ? ' mimg-banner' : ' mimg-product') : ' mimg-blank')}>
      {img ? <img src={img} alt={alt} loading="lazy" /> : <i className="fas fa-image"></i>}
      {children}
    </div>
  );
}

function GroupCard({ card, onOpen }) {
  const { cat, count } = card;
  const img = cat.banner || cat.image;
  const label = (cat.variant_label || 'Products').trim();
  return (
    <div className="mcard" role="button" tabIndex={0} onClick={() => onOpen(cat.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(cat.id)}>
      <CardImage img={img} alt={cat.name} banner={isPhoto(img)}>
        <div className="mbdg">{count} {label}</div>
      </CardImage>
      <div className="mbody">
        <div className="mcat">{cat.name}</div>
        <div className="mtit">{cat.name}</div>
        <div className="mfoot">
          <div className="mgroup-link">Explore {count} {label}</div>
          <button
            className="madd"
            title={'View ' + label}
            aria-label={`View ${cat.name} ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(cat.id);
            }}
          >
            <i className="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductCard({ product, catLabel }) {
  const navigate = useNavigate();
  const open = () => navigate(`/product/${product.slug}`);

  return (
    <div className="mcard" role="link" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
      <CardImage img={product.images[0]} alt={product.name} banner={isPhoto(product.images[0])}>
        {!product.in_stock && <div className="mbdg">Out of stock</div>}
        <HeartButton productId={product.id} />
      </CardImage>
      <div className="mbody">
        <div className="mcat">{catLabel}</div>
        <div className="mtit">{product.name}</div>
        <div className="mfoot">
          <div className="mprice">
            {product.variants.length > 1 && <small className="mfrom">From </small>}
            {rupees(product.price_from)}
          </div>
          <button
            className="madd"
            title="View Details"
            aria-label={`View ${product.name}`}
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
          >
            <i className="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Menu({ filter, onFilter }) {
  const { content, categories } = useSite();
  const s = content.menu_section || {};
  const wrapRefs = useRef([]);
  const firstRun = useRef(true);
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    loadProducts().then(setProducts, (err) => setError(err.message));
  };
  useEffect(load, []);

  // Fade/slide visible cards back in whenever the filter changes
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timers = [];
    wrapRefs.current.forEach((w) => {
      if (!w || w.classList.contains('gone')) return;
      w.style.opacity = '0';
      w.style.transform = 'translateY(16px)';
      timers.push(
        setTimeout(() => {
          w.style.transition = 'opacity .38s,transform .38s';
          w.style.opacity = '1';
          w.style.transform = 'translateY(0)';
        }, 60)
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [filter]);

  const openGroup = (catId) => {
    onFilter(catId);
    window.scrollTo({ top: document.getElementById('menu').offsetTop - 80, behavior: 'smooth' });
  };

  const cards = products ? buildCards(categories, products) : [];
  // unknown collection in the URL: show everything
  const active = filter === 'all' || categories.some((c) => c.id === filter) ? filter : 'all';
  const shown = cards.filter((c) => isVisible(c, active)).length;

  return (
    <section id="menu">
      <div className="container">
        <div className="text-center mb-5" data-aos="fade-up">
          {s.label && <span className="slbl">{s.label}</span>}
          <h2 className="stitle"><Highlighted text={s.title} highlight={s.highlight} /></h2>
          <div className="sline"></div>
        </div>
        <div className="text-center mb-4 mfilters" data-aos="fade-up">
          <button className={'filtbtn' + (active === 'all' ? ' active' : '')} onClick={() => onFilter('all')}>All</button>
          {categories.map((c) => (
            <button key={c.id} className={'filtbtn' + (active === c.id ? ' active' : '')} onClick={() => onFilter(c.id)}>
              {c.name}
            </button>
          ))}
        </div>

        {error && (
          <div className="shop-alert text-center">
            <p>{error}</p>
            <button className="btn-red" onClick={load}><i className="fas fa-rotate-right"></i>Try again</button>
          </div>
        )}
        {!products && !error && <div className="shop-loading"><span className="shop-spinner"></span>Loading products…</div>}
        {products && shown === 0 && <p className="text-center pd-muted">No products in this collection yet.</p>}

        <div className="row g-4" id="mgrid">
          {cards.map((card, i) => (
            <div
              key={card.key}
              ref={(el) => (wrapRefs.current[i] = el)}
              className={'col-sm-6 col-lg-4 mwrap' + (isVisible(card, active) ? '' : ' gone')}
              data-aos="fade-up"
            >
              {card.type === 'group' ? (
                <GroupCard card={card} onOpen={openGroup} />
              ) : (
                <ProductCard product={card.product} catLabel={card.cat.name} />
              )}
            </div>
          ))}
        </div>
        <div className="text-center mt-5 d-flex gap-2 justify-content-center flex-wrap">
          {active !== 'all' && <button className="btn-red" onClick={() => onFilter('all')}><i className="fas fa-arrow-left"></i>All Products</button>}
          <Link to={active !== 'all' ? `/shop?category=${encodeURIComponent(active)}` : '/shop'} className="btn-line">View as list <i className="fas fa-list"></i></Link>
        </div>
      </div>
    </section>
  );
}
