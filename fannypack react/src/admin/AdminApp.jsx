import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './admin.css';
import { get, post, setUnauthorizedHandler, fmtDate } from './api.js';
import { Spinner, UiProvider, useUi } from './ui.jsx';
import { LoginPage, ForgotPage, ResetPage } from './pages/AuthPages.jsx';

// Each section is its own chunk so the admin loads fast
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Orders = lazy(() => import('./pages/Orders.jsx'));
const OrderDetail = lazy(() => import('./pages/OrderDetail.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const ProductEditor = lazy(() => import('./pages/ProductEditor.jsx'));
const Reviews = lazy(() => import('./pages/Reviews.jsx'));
const Collections = lazy(() => import('./pages/Collections.jsx'));
const Inventory = lazy(() => import('./pages/Inventory.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail.jsx'));
const Discounts = lazy(() => import('./pages/Discounts.jsx'));
const Content = lazy(() => import('./pages/Content.jsx'));
const Payments = lazy(() => import('./pages/Payments.jsx'));
const Shipping = lazy(() => import('./pages/Shipping.jsx'));
const Analytics = lazy(() => import('./pages/Analytics.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Integrations = lazy(() => import('./pages/Integrations.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const AdminUsers = lazy(() => import('./pages/AdminUsers.jsx'));
const AuditLogs = lazy(() => import('./pages/AuditLogs.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));

// ---------------- auth ----------------
const AdminCtx = createContext(null);
export const useAdmin = () => useContext(AdminCtx);

function AdminProvider({ children }) {
  const [admin, setAdmin] = useState(undefined); // undefined = loading
  const [mfaRequired, setMfa] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const r = await get('/auth/me');
      setAdmin(r.admin);
      setMfa(Boolean(r.mfaRequired));
      return r;
    } catch {
      setAdmin(null);
      return { admin: null };
    }
  }, []);
  useEffect(() => {
    refresh();
    setUnauthorizedHandler(() => setAdmin(null));
  }, [refresh]);
  const logout = async () => {
    await post('/auth/logout').catch(() => {});
    setAdmin(null);
  };
  const can = (perm) => Boolean(admin?.permissions?.includes(perm));
  return <AdminCtx.Provider value={{ admin, mfaRequired, refresh, logout, can }}>{children}</AdminCtx.Provider>;
}

// ---------------- navigation ----------------
export const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: 'fa-gauge-high', perm: 'dashboard' },
  { to: '/admin/orders', label: 'Orders', icon: 'fa-bag-shopping', perm: 'orders' },
  { to: '/admin/products', label: 'Products', icon: 'fa-tag', perm: 'products' },
  { to: '/admin/reviews', label: 'Reviews', icon: 'fa-star', perm: 'products' },
  { to: '/admin/collections', label: 'Collections', icon: 'fa-layer-group', perm: 'collections' },
  { to: '/admin/inventory', label: 'Inventory', icon: 'fa-boxes-stacked', perm: 'inventory' },
  { to: '/admin/customers', label: 'Customers', icon: 'fa-users', perm: 'customers' },
  { to: '/admin/discounts', label: 'Discounts', icon: 'fa-percent', perm: 'discounts' },
  { to: '/admin/content', label: 'Content', icon: 'fa-pen-ruler', perm: 'content' },
  { to: '/admin/payments', label: 'Payments', icon: 'fa-credit-card', perm: 'payments' },
  { to: '/admin/shipping', label: 'Shipping', icon: 'fa-truck-fast', perm: 'shipping' },
  { to: '/admin/analytics', label: 'Analytics', icon: 'fa-chart-line', perm: 'analytics' },
  { to: '/admin/reports', label: 'Reports', icon: 'fa-file-csv', perm: 'reports' },
  { to: '/admin/integrations', label: 'Integrations', icon: 'fa-plug', perm: 'integrations' },
  { to: '/admin/settings', label: 'Settings', icon: 'fa-gear', perm: 'settings' },
  { to: '/admin/users', label: 'Admin Users', icon: 'fa-user-shield', perm: 'admin_users' },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: 'fa-clipboard-list', perm: 'audit_logs' },
];

const ROLE_NAMES = { super_admin: 'Super Admin', admin: 'Admin', manager: 'Manager', content_manager: 'Content Manager', order_manager: 'Order Manager' };

function Sidebar({ open, onClose }) {
  const { can } = useAdmin();
  return (
    <>
      <aside className={`adm-side ${open ? 'open' : ''}`}>
        <Link to="/admin/dashboard" className="adm-brand" onClick={onClose}>
          <img src="/img/logo.png" alt="" />
          <div>
            <strong>FANNYPACK</strong>
            <span>Admin</span>
          </div>
        </Link>
        <nav>
          {NAV.filter((n) => can(n.perm)).map((n) => (
            <NavLink key={n.to} to={n.to} onClick={onClose} className={({ isActive }) => (isActive ? 'on' : '')}>
              <i className={`fas ${n.icon}`} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <a className="adm-side-store" href="/" target="_blank" rel="noreferrer"><i className="fas fa-store" />View store <i className="fas fa-arrow-up-right-from-square" /></a>
      </aside>
      {open && <div className="adm-side-scrim" onClick={onClose} />}
    </>
  );
}

function SearchBox() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => {
    if (q.trim().length < 2) return setRes(null);
    const t = setTimeout(() => get(`/search?q=${encodeURIComponent(q.trim())}`).then(setRes).catch(() => {}), 220);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const f = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const k = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('mousedown', f);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', f);
      document.removeEventListener('keydown', k);
    };
  }, []);
  const go = (to) => {
    setOpen(false);
    setQ('');
    navigate(to);
  };
  const empty = res && !res.orders.length && !res.products.length && !res.customers.length;
  return (
    <div className="adm-search" ref={ref}>
      <i className="fas fa-magnifying-glass" />
      <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Search orders, products, customers…" aria-label="Search" />
      <kbd>Ctrl K</kbd>
      {open && res && (
        <div className="adm-search-drop">
          {empty && <p className="adm-muted">No results for “{q}”.</p>}
          {res.orders.length > 0 && <h5>Orders</h5>}
          {res.orders.map((o) => (
            <button key={o.number} onClick={() => go(`/admin/orders/${o.number}`)}><i className="fas fa-bag-shopping" />{o.number}<span>{o.name} · ₹{o.total}</span></button>
          ))}
          {res.products.length > 0 && <h5>Products</h5>}
          {res.products.map((p) => (
            <button key={p.id} onClick={() => go(`/admin/products/${p.id}`)}><i className="fas fa-tag" />{p.name}<span>{p.status}</span></button>
          ))}
          {res.customers.length > 0 && <h5>Customers</h5>}
          {res.customers.map((c) => (
            <button key={c.id} onClick={() => go(`/admin/customers/${c.id}`)}><i className="fas fa-user" />{c.name}<span>{c.email}</span></button>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const load = useCallback(() => get('/notifications').then(setData).catch(() => {}), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    const f = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, []);
  const markAll = async () => {
    await post('/notifications/read', {});
    load();
  };
  const icon = { good: 'fa-circle-check', warning: 'fa-triangle-exclamation', critical: 'fa-circle-xmark', info: 'fa-circle-info' };
  return (
    <div className="adm-pop-wrap" ref={ref}>
      <button className="adm-icon-btn" onClick={() => setOpen((o) => !o)} aria-label={`Notifications, ${data.unread} unread`}>
        <i className="fas fa-bell" />
        {data.unread > 0 && <span className="adm-dot-count">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
      {open && (
        <div className="adm-pop notif">
          <div className="adm-pop-head">
            <strong>Notifications</strong>
            {data.unread > 0 && <button onClick={markAll}>Mark all read</button>}
          </div>
          {!data.items.length && <p className="adm-muted" style={{ padding: 16 }}>You are all caught up.</p>}
          {data.items.map((n) => (
            <button
              key={n.id}
              className={`adm-notif ${n.read_at ? '' : 'unread'} ${n.severity}`}
              onClick={() => {
                post('/notifications/read', { ids: [n.id] }).then(load);
                setOpen(false);
                if (n.link) navigate(n.link);
              }}
            >
              <i className={`fas ${icon[n.severity] || icon.info}`} />
              <div>
                <strong>{n.title}</strong>
                {n.body && <span>{n.body}</span>}
                <small>{fmtDate(n.created_at)}</small>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StoreStatus() {
  const { can } = useAdmin();
  const [s, setS] = useState(null);
  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then(setS).catch(() => {});
  }, []);
  if (!s) return null;
  const inner = (
    <span className={`adm-store-status ${s.storeOpen ? 'open' : 'closed'}`}>
      <i className={`fas ${s.storeOpen ? 'fa-circle-check' : 'fa-circle-pause'}`} />
      {s.storeOpen ? 'Store open' : 'Store closed'}
    </span>
  );
  return can('settings') ? <Link to="/admin/settings" title="Change in Settings">{inner}</Link> : inner;
}

function QuickActions() {
  const { can } = useAdmin();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const f = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, []);
  const items = [
    can('products') && { to: '/admin/products/new', icon: 'fa-plus', label: 'Add product' },
    can('discounts') && { to: '/admin/discounts?new=1', icon: 'fa-percent', label: 'Create discount' },
    can('orders') && { to: '/admin/orders?filter=pending', icon: 'fa-box-open', label: 'Orders to fulfil' },
    can('content') && { to: '/admin/content', icon: 'fa-pen-ruler', label: 'Edit homepage' },
    can('reports') && { to: '/admin/reports', icon: 'fa-file-arrow-down', label: 'Export report' },
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="adm-pop-wrap" ref={ref}>
      <button className="adm-btn primary sm" onClick={() => setOpen((o) => !o)}><i className="fas fa-bolt" /><span>Quick actions</span></button>
      {open && (
        <div className="adm-pop menu">
          {items.map((i) => (
            <Link key={i.to} to={i.to} onClick={() => setOpen(false)}><i className={`fas ${i.icon}`} />{i.label}</Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Profile() {
  const { admin, logout } = useAdmin();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    const f = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, []);
  return (
    <div className="adm-pop-wrap" ref={ref}>
      <button className="adm-profile" onClick={() => setOpen((o) => !o)}>
        <span className="adm-avatar">{admin.name.slice(0, 1).toUpperCase()}</span>
        <span className="adm-profile-txt"><strong>{admin.name}</strong><small>{ROLE_NAMES[admin.role] || admin.role}</small></span>
        <i className="fas fa-chevron-down" />
      </button>
      {open && (
        <div className="adm-pop menu right">
          <div className="adm-pop-who">{admin.email}</div>
          <Link to="/admin/account" onClick={() => setOpen(false)}><i className="fas fa-user-gear" />Account &amp; security</Link>
          <button onClick={async () => { await logout(); navigate('/admin/login'); }}><i className="fas fa-right-from-bracket" />Sign out</button>
        </div>
      )}
    </div>
  );
}

function Layout({ children }) {
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  useEffect(() => setMenu(false), [loc.pathname]);
  return (
    <div className="adm-shell">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      <div className="adm-main">
        <header className="adm-top">
          <button className="adm-icon-btn adm-burger" onClick={() => setMenu(true)} aria-label="Open menu"><i className="fas fa-bars" /></button>
          <SearchBox />
          <div className="adm-top-right">
            <StoreStatus />
            <QuickActions />
            <Notifications />
            <Profile />
          </div>
        </header>
        <main className="adm-content">
          <Suspense fallback={<Spinner />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}

// Pages that need a permission: show a friendly message instead of a broken page
function Guard({ perm, children }) {
  const { can } = useAdmin();
  if (perm && !can(perm)) {
    return (
      <div className="adm-empty">
        <i className="fas fa-lock" />
        <h4>No access</h4>
        <p>Your role does not include this section. Ask a Super Admin if you need it.</p>
      </div>
    );
  }
  return children;
}

function Protected() {
  const { admin, mfaRequired } = useAdmin();
  const loc = useLocation();
  if (admin === undefined) return <div className="adm-root adm-center"><Spinner /></div>;
  if (!admin) return <Navigate to={`/admin/login${mfaRequired ? '?mfa=1' : ''}${loc.pathname !== '/admin' && loc.pathname !== '/admin/' ? `${mfaRequired ? '&' : '?'}next=${encodeURIComponent(loc.pathname + loc.search)}` : ''}`} replace />;
  const first = NAV.find((n) => admin.permissions.includes(n.perm))?.to || '/admin/account';
  const g = (perm, el) => <Guard perm={perm}>{el}</Guard>;
  return (
    <Layout>
      <Routes>
        <Route index element={<Navigate to={first} replace />} />
        <Route path="dashboard" element={g('dashboard', <Dashboard />)} />
        <Route path="orders" element={g('orders', <Orders />)} />
        <Route path="orders/:number" element={g('orders', <OrderDetail />)} />
        <Route path="products" element={g('products', <Products />)} />
        <Route path="products/new" element={g('products', <ProductEditor />)} />
        <Route path="products/:id" element={g('products', <ProductEditor />)} />
        <Route path="reviews" element={g('products', <Reviews />)} />
        <Route path="collections" element={g('collections', <Collections />)} />
        <Route path="inventory" element={g('inventory', <Inventory />)} />
        <Route path="customers" element={g('customers', <Customers />)} />
        <Route path="customers/:id" element={g('customers', <CustomerDetail />)} />
        <Route path="discounts" element={g('discounts', <Discounts />)} />
        <Route path="content" element={g('content', <Content />)} />
        <Route path="payments" element={g('payments', <Payments />)} />
        <Route path="shipping" element={g('shipping', <Shipping />)} />
        <Route path="analytics" element={g('analytics', <Analytics />)} />
        <Route path="reports" element={g('reports', <Reports />)} />
        <Route path="integrations" element={g('integrations', <Integrations />)} />
        <Route path="settings" element={g('settings', <Settings />)} />
        <Route path="users" element={g('admin_users', <AdminUsers />)} />
        <Route path="audit-logs" element={g('audit_logs', <AuditLogs />)} />
        <Route path="account" element={<Account />} />
        <Route path="*" element={<Navigate to={first} replace />} />
      </Routes>
    </Layout>
  );
}

export default function AdminApp() {
  useEffect(() => {
    document.title = 'FANNYPACK Admin';
    document.body.classList.add('adm-body');
    return () => document.body.classList.remove('adm-body');
  }, []);
  return (
    <div className="adm-root">
      <UiProvider>
        <AdminProvider>
          <Routes>
            <Route path="login" element={<LoginPage />} />
            <Route path="forgot" element={<ForgotPage />} />
            <Route path="reset" element={<ResetPage />} />
            <Route path="*" element={<Protected />} />
          </Routes>
        </AdminProvider>
      </UiProvider>
    </div>
  );
}

export { ROLE_NAMES, useUi };
