import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../shop/AuthContext.jsx';

// Amazon-style "Hello, sign in / Account & Orders" entry in the navbar
export default function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!user) {
    const next = ['/signin', '/signup', '/forgot-password', '/reset-password'].includes(location.pathname) ? '/' : location.pathname + location.search;
    return (
      <Link to={`/signin?next=${encodeURIComponent(next)}`} className="nav-acct">
        <small>Hello, sign in</small>
        <strong>Account &amp; Orders</strong>
      </Link>
    );
  }

  const signOut = async () => {
    setOpen(false);
    await logout();
    navigate('/');
  };

  return (
    <div className="nav-acct-wrap" ref={ref}>
      <button type="button" className="nav-acct" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <small>Hello, {user.name.split(' ')[0]}</small>
        <strong>Account &amp; Orders <i className="fas fa-caret-down"></i></strong>
      </button>
      {open && (
        <div className="nav-acct-menu">
          <div className="nav-acct-head">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <Link to="/account"><i className="fas fa-user"></i>Your Account</Link>
          <Link to="/account/orders"><i className="fas fa-box"></i>Your Orders</Link>
          <Link to="/account/wishlist"><i className="fas fa-heart"></i>Your Wishlist</Link>
          <Link to="/cart"><i className="fas fa-cart-shopping"></i>Your Cart</Link>
          <button type="button" onClick={signOut}><i className="fas fa-right-from-bracket"></i>Sign out</button>
        </div>
      )}
    </div>
  );
}
