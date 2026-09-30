import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { loadProducts, searchProducts } from '../shop/api.js';
import { useSite } from '../shop/SiteContext.jsx';
import { useSeo } from '../shop/useSeo.js';
import ShopCard from '../shop/ShopCard.jsx';

const SORTS = {
  featured: { label: 'Featured', fn: null },
  'price-asc': { label: 'Price: low to high', fn: (a, b) => a.price_from - b.price_from },
  'price-desc': { label: 'Price: high to low', fn: (a, b) => b.price_from - a.price_from },
  rating: { label: 'Customer rating', fn: (a, b) => (b.rating?.average || 0) - (a.rating?.average || 0) },
  name: { label: 'Name A-Z', fn: (a, b) => a.name.localeCompare(b.name) },
};

// /shop (all products, ?category=) and /search?q=
export default function ShopPage({ search = false }) {
  const [params, setParams] = useSearchParams();
  const { categories } = useSite();
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const sort = SORTS[params.get('sort')] ? params.get('sort') : 'featured';
  const inStockOnly = params.get('stock') === '1';
  const cat = categories.find((c) => c.id === category);
  useSeo(search ? (q ? `Search: ${q}` : 'Search') : cat ? cat.seo_title || cat.name : 'Shop all products', {
    description: cat?.seo_description || cat?.description || undefined,
    noindex: search,
  });

  const load = () => {
    setError('');
    loadProducts().then(setProducts, (err) => setError(err.message));
  };
  useEffect(load, []);

  const list = useMemo(() => {
    if (!products) return [];
    let out = search ? searchProducts(products, q) : products;
    if (category) out = out.filter((p) => p.category.id === category);
    if (inStockOnly) out = out.filter((p) => p.in_stock);
    if (SORTS[sort].fn) out = [...out].sort(SORTS[sort].fn);
    return out;
  }, [products, search, q, category, inStockOnly, sort]);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <main className="shop-page container">
      <nav className="policy-crumbs"><Link to="/">Home</Link><i className="fas fa-chevron-right"></i>{cat ? <><Link to="/shop">Shop</Link><i className="fas fa-chevron-right"></i><span>{cat.name}</span></> : <span>{search ? 'Search' : 'Shop'}</span>}</nav>
      <h1 className="shop-h1">
        {search ? (q ? <>Results for “{q}”</> : 'Search') : cat ? cat.name : 'Shop all products'}
      </h1>
      {cat?.description && !search && <p className="shop-lead">{cat.description}</p>}

      {search && (
        <form className="shop-search" role="search" onSubmit={(e) => { e.preventDefault(); setParam('q', new FormData(e.currentTarget).get('q').trim()); }}>
          <input name="q" key={q} defaultValue={q} className="co-input" placeholder="Search sauces, chilli crisp, merch…" aria-label="Search products" autoFocus={!q} />
          <button className="pd-btn pd-btn-buy"><i className="fas fa-search"></i> Search</button>
        </form>
      )}

      <div className="shop-bar">
        <div className="shop-chips" role="group" aria-label="Collections">
          <button className={'filtbtn' + (!category ? ' active' : '')} onClick={() => setParam('category', '')}>All</button>
          {categories.map((c) => (
            <button key={c.id} className={'filtbtn' + (category === c.id ? ' active' : '')} onClick={() => setParam('category', c.id)}>{c.name}</button>
          ))}
        </div>
        <div className="shop-tools">
          <label className="acct-check"><input type="checkbox" checked={inStockOnly} onChange={(e) => setParam('stock', e.target.checked ? '1' : '')} /> In stock only</label>
          <select className="co-input" value={sort} onChange={(e) => setParam('sort', e.target.value === 'featured' ? '' : e.target.value)} aria-label="Sort by">
            {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="shop-alert text-center">
          <p>{error}</p>
          <button className="btn-red" onClick={load}><i className="fas fa-rotate-right"></i>Try again</button>
        </div>
      )}
      {!products && !error && <div className="shop-loading"><span className="shop-spinner"></span>Loading products…</div>}
      {products && (
        <p className="shop-count">{list.length} product{list.length === 1 ? '' : 's'}</p>
      )}
      {products && list.length === 0 && (
        <div className="cart-empty">
          <i className="fas fa-magnifying-glass"></i>
          <h2>No products found</h2>
          <p>{search && q ? 'Try a different word, like “ghaslet”, “chilli” or “jacket”.' : 'Nothing matches these filters.'}</p>
          <Link to="/shop" className="btn-red">See all products</Link>
        </div>
      )}
      <div className="pd-grid shop-grid">
        {list.map((p) => <ShopCard key={p.id} product={p} />)}
      </div>
    </main>
  );
}
