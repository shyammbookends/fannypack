import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './AuthContext.jsx';

// Wishlist of product ids. Guests: kept in the browser; signed in: saved on the account
// (the browser list is merged in on sign-in, like the cart).
const KEY = 'fp_wishlist_v1';
const WishlistContext = createContext(null);

function readLocal() {
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(ids) ? ids.filter((x) => typeof x === 'string').slice(0, 100) : [];
  } catch {
    return [];
  }
}
function writeLocal(ids) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* storage blocked: the list still works for this visit */
  }
}

export function WishlistProvider({ children }) {
  const { user, ready } = useAuth();
  const [ids, setIds] = useState(readLocal);
  const userId = user?.id ?? null;
  const prevUser = useRef(undefined);

  useEffect(() => {
    if (!ready || prevUser.current === userId) return;
    const wasSignedIn = prevUser.current != null;
    prevUser.current = userId;
    if (userId) {
      const local = readLocal();
      (local.length ? api.mergeWishlist(local) : api.wishlist())
        .then((r) => {
          setIds(r.items);
          writeLocal([]);
        })
        .catch(() => {});
    } else {
      if (wasSignedIn) writeLocal([]);
      setIds(readLocal());
    }
  }, [ready, userId]);

  useEffect(() => {
    if (ready && !userId) writeLocal(ids);
  }, [ids, userId, ready]);

  const toggle = useCallback(
    (productId) => {
      const on = !ids.includes(productId);
      setIds((list) => (on ? [productId, ...list.filter((x) => x !== productId)] : list.filter((x) => x !== productId)));
      if (userId) {
        (on ? api.addWishlist(productId) : api.removeWishlist(productId))
          .then((r) => setIds(r.items))
          .catch(() => setIds((list) => (on ? list.filter((x) => x !== productId) : [productId, ...list])));
      }
      return on;
    },
    [ids, userId]
  );

  const value = useMemo(() => ({ ids, has: (id) => ids.includes(id), toggle, count: ids.length }), [ids, toggle]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export const useWishlist = () => useContext(WishlistContext);

// Heart button used on product cards and the product page
export function HeartButton({ productId, className = 'mhrt', label }) {
  const { has, toggle } = useWishlist();
  const on = has(productId);
  return (
    <button
      type="button"
      className={className + (on ? ' on' : '')}
      aria-pressed={on}
      aria-label={on ? 'Remove from wishlist' : 'Add to wishlist'}
      title={on ? 'Remove from wishlist' : 'Add to wishlist'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(productId);
      }}
    >
      <i className={(on ? 'fas' : 'far') + ' fa-heart'}></i>
      {label && <span>{on ? 'Saved' : label}</span>}
    </button>
  );
}
