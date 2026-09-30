import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../shop/CartContext.jsx';
import { useSite } from '../shop/SiteContext.jsx';
import { useWishlist } from '../shop/WishlistContext.jsx';
import AccountMenu from './AccountMenu.jsx';
import { closeMobileNav } from '../utils.js';

const DEFAULT_NAV = [
  { label: 'Home', href: '#hero' },
  { label: 'About', href: '#about' },
  { label: 'Menu', href: '#menu' },
  { label: 'Contact', href: '#contact' },
];

export default function Navbar({ onSearch }) {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState('hero');
  const { count } = useCart();
  const wishlist = useWishlist();
  const { content, store } = useSite();
  const location = useLocation();
  const nav = content?.nav?.length ? content.nav : DEFAULT_NAV;
  const home = location.pathname === '/';

  /* NAVBAR SCROLL & ACTIVE LINK (section links only highlight on the homepage) */
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 60);
      if (!home) return;
      document.querySelectorAll('section[id]').forEach((sec) => {
        const top = sec.offsetTop - 110;
        const bot = top + sec.offsetHeight;
        if (window.scrollY >= top && window.scrollY < bot && nav.some((l) => l.href === '#' + sec.id)) {
          setActive(sec.id);
        }
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [home, nav]);

  const isActive = (l) => (l.href.startsWith('#') ? home && active === l.href.slice(1) : location.pathname === l.href);

  return (
    <nav className={'navbar navbar-expand-lg' + (scrolled ? ' scrolled' : '')} id="nav">
      <div className="container">
        <Link
          className="navbar-brand"
          to="/"
          aria-label="Bookends Fanny Pack - home"
          onClick={() => {
            // Already on the homepage: a link to the same page does nothing, so go back to the top
            closeMobileNav();
            if (home) {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setActive('hero');
            }
          }}
        >
          <img className="blogo-img" src={store.logo || '/img/logo.png'} alt={store.name || 'Bookends Fanny Pack'} />
        </Link>
        {/* cart is always visible, also next to the hamburger on mobile */}
        <Link to="/cart" className="nav-cart ms-auto me-2 d-lg-none" aria-label={`Cart, ${count} items`}>
          <i className="fas fa-cart-shopping"></i>
          {count > 0 && <span className="nav-cart-count">{count}</span>}
        </Link>
        <button className="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#navmenu" aria-controls="navmenu" aria-label="Menu">
          <i className="fas fa-bars" style={{ color: 'var(--primary)', fontSize: '1.35rem' }}></i>
        </button>
        <div className="collapse navbar-collapse" id="navmenu">
          <ul className="navbar-nav mx-auto">
            {nav.map((l) => (
              <li className="nav-item" key={l.href + l.label}>
                {l.href.startsWith('/') ? (
                  <Link className={'nav-link' + (isActive(l) ? ' active' : '')} to={l.href}>{l.label}</Link>
                ) : (
                  <a className={'nav-link' + (isActive(l) ? ' active' : '')} href={l.href}>{l.label}</a>
                )}
              </li>
            ))}
            <li className="nav-item"><Link className={'nav-link' + (location.pathname === '/shop' ? ' active' : '')} to="/shop">Shop</Link></li>
          </ul>
          <div className="d-flex align-items-center gap-1">
            <button id="navSearchBtn" title="Search" aria-label="Search" onClick={onSearch}><i className="fas fa-search"></i></button>
            <Link to="/account/wishlist" className="nav-cart nav-wish" aria-label={`Wishlist, ${wishlist.count} items`} title="Wishlist">
              <i className="far fa-heart"></i>
              {wishlist.count > 0 && <span className="nav-cart-count">{wishlist.count}</span>}
            </Link>
            <AccountMenu />
            <Link to="/cart" className="nav-cart d-none d-lg-inline-flex" aria-label={`Cart, ${count} items`}>
              <i className="fas fa-cart-shopping"></i>
              {count > 0 && <span className="nav-cart-count">{count}</span>}
            </Link>
            <Link to="/shop" className="nav-link nav-cta"><i className="fas fa-shopping-bag me-1"></i>Order Now</Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
