import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadProducts } from '../shop/api.js';
import { useWishlist } from '../shop/WishlistContext.jsx';
import { useSeo } from '../shop/useSeo.js';
import ShopCard from '../shop/ShopCard.jsx';

export default function WishlistPage() {
  const { ids } = useWishlist();
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');
  useSeo('Your Wishlist', { noindex: true });

  useEffect(() => {
    loadProducts().then(setProducts, (err) => setError(err.message));
  }, []);

  const list = products ? ids.map((id) => products.find((p) => p.id === id)).filter(Boolean) : [];

  return (
    <main className="shop-page container">
      <nav className="policy-crumbs"><Link to="/account">Your Account</Link><i className="fas fa-chevron-right"></i><span>Wishlist</span></nav>
      <h1 className="shop-h1">Your Wishlist</h1>
      {error && <div className="shop-alert">{error}</div>}
      {!products && !error && <div className="shop-loading"><span className="shop-spinner"></span>Loading…</div>}
      {products && list.length === 0 && (
        <div className="cart-empty">
          <i className="far fa-heart"></i>
          <h2>Your wishlist is empty</h2>
          <p>Tap the heart on any product to save it here.</p>
          <Link to="/shop" className="btn-red"><i className="fas fa-store"></i>Browse products</Link>
        </div>
      )}
      <div className="pd-grid shop-grid">
        {list.map((p) => <ShopCard key={p.id} product={p} />)}
      </div>
    </main>
  );
}
