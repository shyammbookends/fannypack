// Small wrapper around the Express API (proxied to /api by Vite in development).

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Cannot reach the server. Please check your connection and try again.'), { status: 0 });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // No JSON body on a 5xx = the API itself did not answer (e.g. the server is not running)
    const down = !data && res.status >= 500;
    const message = down
      ? import.meta.env.DEV
        ? 'The backend server is not running. Start everything with "npm run dev".'
        : 'Our server is not responding right now. Please try again in a moment.'
      : data?.error || `Request failed (${res.status})`;
    throw Object.assign(new Error(message), { status: res.status, data: data || {} });
  }
  return data;
}

const enc = encodeURIComponent;

export const api = {
  config: () => request('/config'),
  content: () => request('/content'),
  categories: () => request('/categories'),
  products: () => request('/products'),
  product: (slug) => request(`/products/${enc(slug)}`),
  quote: (items, code) => request('/checkout/quote', { method: 'POST', body: { items, code: code || undefined } }),
  serviceability: (state, pin) => request('/checkout/serviceability', { method: 'POST', body: { state, pin } }),
  placeOrder: (payload) => request('/orders', { method: 'POST', body: payload }),
  verifyPayment: (number, payload) => request(`/orders/${enc(number)}/verify`, { method: 'POST', body: payload }),
  cancelPayment: (number, token, failure) => request(`/orders/${enc(number)}/cancel`, { method: 'POST', body: { token, ...(failure || {}) } }),
  order: (number, token) => request(`/orders/${enc(number)}${token ? `?token=${enc(token)}` : ''}`),
  invoice: (number, token) => request(`/orders/${enc(number)}/invoice${token ? `?token=${enc(token)}` : ''}`),

  // accounts (session cookie is sent automatically)
  me: () => request('/auth/me'),
  login: (identifier, password) => request('/auth/login', { method: 'POST', body: { identifier, password } }),
  signup: (data) => request('/auth/signup', { method: 'POST', body: data }),
  forgotPassword: (email) => request('/auth/forgot', { method: 'POST', body: { email } }),
  resetPassword: (token, password) => request('/auth/reset', { method: 'POST', body: { token, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  updateProfile: (data) => request('/account/profile', { method: 'PUT', body: data }),
  changePassword: (current, password) => request('/account/password', { method: 'POST', body: { current, password } }),
  addresses: () => request('/account/addresses'),
  addAddress: (a) => request('/account/addresses', { method: 'POST', body: a }),
  updateAddress: (id, a) => request(`/account/addresses/${id}`, { method: 'PUT', body: a }),
  deleteAddress: (id) => request(`/account/addresses/${id}`, { method: 'DELETE' }),
  myOrders: () => request('/account/orders'),
  cancelOrder: (number, reason) => request(`/account/orders/${enc(number)}/cancel`, { method: 'POST', body: { reason } }),
  lastAddress: () => request('/account/last-address'),

  // saved cart for signed-in users
  cart: () => request('/cart'),
  setCartItem: (variantId, qty) => request('/cart/items', { method: 'PUT', body: { variantId, qty } }),
  mergeCart: (items) => request('/cart/merge', { method: 'POST', body: { items } }),
  clearCart: () => request('/cart', { method: 'DELETE' }),

  // wishlist (product ids)
  wishlist: () => request('/wishlist'),
  addWishlist: (productId) => request(`/wishlist/${enc(productId)}`, { method: 'PUT' }),
  removeWishlist: (productId) => request(`/wishlist/${enc(productId)}`, { method: 'DELETE' }),
  mergeWishlist: (items) => request('/wishlist/merge', { method: 'POST', body: { items } }),

  // reviews + stock alerts
  reviews: (slug) => request(`/products/${enc(slug)}/reviews`),
  saveReview: (slug, review) => request(`/products/${enc(slug)}/reviews`, { method: 'POST', body: review }),
  deleteReview: (slug) => request(`/products/${enc(slug)}/reviews/mine`, { method: 'DELETE' }),
  stockAlert: (variantId, email) => request('/stock-alerts', { method: 'POST', body: { variantId, email } }),
};

// Full photos / posters (jpg) fill their frame; cut-out product shots (png) are shown whole
export const isPhoto = (src) => Boolean(src) && !/\.png$/i.test(src);

export const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Load the catalogue once and share it between pages
let productsPromise;
export function loadProducts() {
  if (!productsPromise) {
    productsPromise = api.products().catch((err) => {
      productsPromise = undefined; // allow a retry
      throw err;
    });
  }
  return productsPromise;
}

// Search products by name, collection, tags, description
export function searchProducts(products, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return products;
  return products
    .map((p) => {
      const name = p.name.toLowerCase();
      const hay = [p.name, p.category?.name, ...(p.tags || []), p.short_description, p.description, ...p.variants.map((v) => v.option)]
        .filter(Boolean).join(' ').toLowerCase();
      if (!words.every((w) => hay.includes(w))) return null;
      return { p, score: words.reduce((s, w) => s + (name.includes(w) ? 2 : 1), 0) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}
