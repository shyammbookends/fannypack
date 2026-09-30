import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isPhoto, loadProducts, rupees, searchProducts } from '../shop/api.js';
import { useSite } from '../shop/SiteContext.jsx';
import { lockBody } from '../utils.js';

// Full-screen search: live results as you type, Enter opens the full results page
export default function SearchOverlay({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { categories } = useSite();

  useEffect(() => {
    if (!open) return;
    lockBody(true);
    loadProducts().then(setProducts).catch(() => setProducts([]));
    const t = setTimeout(() => inputRef.current?.focus(), 220);
    return () => {
      clearTimeout(t);
      lockBody(false);
    };
  }, [open]);

  const go = (to) => {
    onClose();
    navigate(to);
  };
  const submit = (e) => {
    e.preventDefault();
    const q = query.trim();
    go(q ? `/search?q=${encodeURIComponent(q)}` : '/shop');
  };

  const results = products && query.trim() ? searchProducts(products, query).slice(0, 6) : [];
  const trending = products ? products.filter((p) => p.in_stock).slice(0, 6) : [];

  return (
    <div id="searchOv" className={open ? 'open' : ''} onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Search products" hidden={!open}>
      <button className="sovclose" id="searchClose" onClick={onClose} aria-label="Close search"><i className="fas fa-times"></i></button>
      <div className="sovbox">
        <h4>What are you craving today?</h4>
        <form className="sovinput" onSubmit={submit} role="search">
          <input
            type="search"
            id="searchInput"
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sauces, chilli crisp, lemonade, merch…"
            autoComplete="off"
            aria-label="Search products"
          />
          <button type="submit" aria-label="Search"><i className="fas fa-search"></i></button>
        </form>

        {query.trim() && products && (
          <div className="sov-results">
            {results.length === 0 && <p className="sov-empty">No products match “{query.trim()}”.</p>}
            {results.map((p) => (
              <Link key={p.id} to={`/product/${p.slug}`} className="sov-result" onClick={onClose}>
                <span className={'sov-img' + (isPhoto(p.images[0]) ? ' photo' : '')}>{p.images[0] ? <img src={p.images[0]} alt="" /> : <i className="fas fa-image"></i>}</span>
                <span className="sov-name">{p.name}<small>{p.category.name}</small></span>
                <span className="sov-price">{rupees(p.price_from)}</span>
              </Link>
            ))}
            {results.length > 0 && <button type="button" className="sov-all" onClick={submit}>See all results <i className="fas fa-arrow-right"></i></button>}
          </div>
        )}

        {/* Collections */}
        <div className="sovcats">
          <div className="sovcat" role="button" tabIndex={0} onClick={() => go('/shop')}>All Products</div>
          {categories.map((c) => (
            <div key={c.id} className="sovcat" role="button" tabIndex={0} onClick={() => go(`/shop?category=${encodeURIComponent(c.id)}`)}>
              {c.name}
            </div>
          ))}
        </div>
        {!query.trim() && trending.length > 0 && (
          <div className="sovtrend">
            <p><i className="fas fa-fire me-1" style={{ color: 'var(--secondary)' }}></i>Popular right now</p>
            {trending.map((p) => (
              <span className="ttag" key={p.id} role="button" tabIndex={0} onClick={() => go(`/product/${p.slug}`)}>{p.name}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
