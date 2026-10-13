import { Link } from 'react-router-dom';
import { useSeo } from '../shop/useSeo.js';

export default function NotFoundPage({ what = 'page' }) {
  useSeo(what === 'product' ? 'Product not found' : 'Page not found', { noindex: true });
  return (
    <main className="shop-page container">
      <div className="cart-empty notfound">
        <i className="fas fa-pepper-hot"></i>
        <h1>{what === 'product' ? 'We could not find that product' : 'Page not found'}</h1>
        <p>{what === 'product' ? 'It may have been renamed or is no longer sold.' : 'The link may be broken, or the page may have moved.'}</p>
        <div className="d-flex gap-2 justify-content-center flex-wrap">
          <Link to="/shop" className="btn-red"><i className="fas fa-store"></i>Shop all products</Link>
          <Link to="/" className="btn-line">Go to homepage</Link>
        </div>
      </div>
    </main>
  );
}
