import { Link } from 'react-router-dom';
import { isPhoto, rupees } from './api.js';
import { HeartButton } from './WishlistContext.jsx';
import { Stars } from './Reviews.jsx';

// Compact product tile (shop, search, wishlist, "more products")
export default function ShopCard({ product }) {
  return (
    <div className="shopcard-wrap">
      <Link to={`/product/${product.slug}`} className="shopcard">
        <div className={'shopcard-img' + (isPhoto(product.images[0]) ? ' photo' : '')} style={{ '--tone': product.color }}>
          {product.images[0] ? <img src={product.images[0]} alt={product.name} loading="lazy" /> : <i className="fas fa-image"></i>}
        </div>
        <div className="shopcard-body">
          <span className="shopcard-cat">{product.category.name}</span>
          <span className="shopcard-name">{product.name}</span>
          {product.rating?.count > 0 && (
            <span className="shopcard-rating"><Stars value={product.rating.average} size="sm" /> {product.rating.count}</span>
          )}
          <span className="shopcard-price">
            {product.variants.length > 1 && <small>From </small>}
            {rupees(product.price_from)}
          </span>
          {!product.in_stock && <span className="shopcard-oos">Out of stock</span>}
        </div>
      </Link>
      <HeartButton productId={product.id} className="shopcard-heart" />
    </div>
  );
}
