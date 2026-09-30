import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './AuthContext.jsx';

// Guests: the cart lives in the browser (localStorage), so it is still there when they come back.
// Signed in: the cart is saved in the database ("cart_items") and follows the account across
// visits and devices. On sign-in the browser cart is merged into the saved one (like Amazon).
// Prices and stock always come from the server on the cart / checkout pages.
const KEY = 'fp_cart_v1';
const CartContext = createContext(null);

function readLocal() {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(items) ? items.filter((i) => Number.isInteger(i.variantId) && i.qty > 0) : [];
  } catch {
    return [];
  }
}
function writeLocal(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full / blocked: cart still works for this visit */
  }
}

export function CartProvider({ children }) {
  const { user, ready } = useAuth();
  const [items, setItems] = useState(readLocal);
  const [syncing, setSyncing] = useState(false);
  const userId = user?.id ?? null;
  const prevUser = useRef(undefined);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Signed in / out: load (and merge) the saved cart, or fall back to the browser cart
  useEffect(() => {
    if (!ready || prevUser.current === userId) return;
    const wasSignedIn = prevUser.current != null;
    prevUser.current = userId;

    if (userId) {
      const local = readLocal();
      setSyncing(true);
      (local.length ? api.mergeCart(local) : api.cart())
        .then((r) => {
          setItems(r.items);
          writeLocal([]); // now saved on the account
        })
        .catch(() => {})
        .finally(() => setSyncing(false));
    } else {
      // Signed out: an account's cart stays with the account, not on this device
      if (wasSignedIn) writeLocal([]);
      setItems(readLocal());
    }
  }, [ready, userId]);

  // Guests: keep the browser copy up to date (and in sync across tabs)
  useEffect(() => {
    if (!userId && ready) writeLocal(items);
  }, [items, userId, ready]);
  useEffect(() => {
    const onStorage = (e) => e.key === KEY && !userId && setItems(readLocal());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

  // Update the screen right away; for signed-in users save to the server and take its answer
  const save = useCallback(
    (variantId, qty) => {
      if (!userId) return;
      api.setCartItem(variantId, qty).then((r) => setItems(r.items)).catch(() => {});
    },
    [userId]
  );

  const add = useCallback(
    (variantId, qty = 1) => {
      const found = itemsRef.current.find((i) => i.variantId === variantId);
      const next = Math.min(99, (found?.qty || 0) + qty);
      setItems((list) =>
        list.some((i) => i.variantId === variantId)
          ? list.map((i) => (i.variantId === variantId ? { ...i, qty: next } : i))
          : [...list, { variantId, qty: next }]
      );
      save(variantId, next);
    },
    [save]
  );

  const setQty = useCallback(
    (variantId, qty) => {
      const q = Math.max(0, Math.min(99, qty));
      setItems((list) => (q < 1 ? list.filter((i) => i.variantId !== variantId) : list.map((i) => (i.variantId === variantId ? { ...i, qty: q } : i))));
      save(variantId, q);
    },
    [save]
  );

  const remove = useCallback((variantId) => setQty(variantId, 0), [setQty]);

  // After an order: the server already removed purchased items from the saved cart
  const clear = useCallback(() => {
    setItems([]);
    if (!userId) writeLocal([]);
  }, [userId]);

  const value = useMemo(
    () => ({ items, add, setQty, remove, clear, syncing, count: items.reduce((s, i) => s + i.qty, 0) }),
    [items, add, setQty, remove, clear, syncing]
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
