import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AOS from 'aos';

import Navbar from './components/Navbar.jsx';
import AnnouncementBar from './components/AnnouncementBar.jsx';
import SearchOverlay from './components/SearchOverlay.jsx';
import Footer from './components/Footer.jsx';
import BackToTop from './components/BackToTop.jsx';
import Home from './pages/Home.jsx';
import { RequireAuth } from './pages/RequireAuth.jsx';

// Every page except the homepage is its own chunk, downloaded only when it is opened
const ProductPage = lazy(() => import('./pages/ProductPage.jsx'));
const CartPage = lazy(() => import('./pages/CartPage.jsx'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage.jsx'));
const OrderPage = lazy(() => import('./pages/OrderPage.jsx'));
const InvoicePage = lazy(() => import('./pages/InvoicePage.jsx'));
const AccountPage = lazy(() => import('./pages/AccountPage.jsx'));
const AccountOrdersPage = lazy(() => import('./pages/AccountOrdersPage.jsx'));
const WishlistPage = lazy(() => import('./pages/WishlistPage.jsx'));
const ShopPage = lazy(() => import('./pages/ShopPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));
const auth = () => import('./pages/AuthPages.jsx');
const SignInPage = lazy(() => auth().then((m) => ({ default: m.SignInPage })));
const SignUpPage = lazy(() => auth().then((m) => ({ default: m.SignUpPage })));
const ForgotPasswordPage = lazy(() => auth().then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => auth().then((m) => ({ default: m.ResetPasswordPage })));
const policies = () => import('./pages/PolicyPages.jsx');
const ContactPage = lazy(() => import('./pages/ContactPage.jsx'));
const PrivacyPage = lazy(() => policies().then((m) => ({ default: m.PrivacyPage })));
const RefundPage = lazy(() => policies().then((m) => ({ default: m.RefundPage })));
const ShippingPage = lazy(() => policies().then((m) => ({ default: m.ShippingPage })));
const TermsPage = lazy(() => policies().then((m) => ({ default: m.TermsPage })));

function PageLoading() {
  return (
    <main className="shop-page container">
      <div className="shop-loading"><span className="shop-spinner"></span>Loading…</div>
    </main>
  );
}
import { CartProvider } from './shop/CartContext.jsx';
import { AuthProvider } from './shop/AuthContext.jsx';
import { SiteProvider } from './shop/SiteContext.jsx';
import { WishlistProvider } from './shop/WishlistContext.jsx';
import { closeMobileNav, scrollToSection } from './utils.js';

// Admin panel is a separate chunk: shoppers never download it
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

export default function App() {
  const location = useLocation();
  if (location.pathname === '/admin' || location.pathname.startsWith('/admin/')) {
    return (
      <Suspense fallback={null}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
        </Routes>
      </Suspense>
    );
  }
  return <Storefront />;
}

function Storefront() {
  const [filter, setFilter] = useState('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    AOS.init({ duration: 680, once: true, offset: 55 });
  }, []);

  // New page (not a "#section" jump): start at the top, close search / mobile menu
  useEffect(() => {
    closeMobileNav();
    setSearchOpen(false);
    if (!location.hash) window.scrollTo(0, 0);
  }, [location.pathname]);

  /* SMOOTH SCROLL + MOBILE NAV CLOSE for every in-page "#" link.
     On other pages the section doesn't exist, so go to the homepage section instead. */
  useEffect(() => {
    const onClick = (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const href = a.getAttribute('href');
      e.preventDefault();
      if (href === '#') return;
      const id = href.slice(1);
      closeMobileNav();
      if (document.getElementById(id)) {
        setTimeout(() => scrollToSection(id), 50);
      } else {
        navigate(`/${href}`);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [navigate]);

  /* ESC key closes the search overlay */
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setSearchOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <SiteProvider>
    <AuthProvider>
    <CartProvider>
    <WishlistProvider>
      <AnnouncementBar />
      <Navbar onSearch={() => setSearchOpen(true)} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<Home filter={filter} setFilter={setFilter} />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/search" element={<ShopPage search />} />
        <Route path="/product/:slug" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
        <Route path="/account/orders" element={<RequireAuth><AccountOrdersPage /></RequireAuth>} />
        <Route path="/account/wishlist" element={<WishlistPage />} />
        <Route path="/order/:number" element={<OrderPage />} />
        <Route path="/order/:number/invoice" element={<InvoicePage />} />
        <Route path="/privacy-policy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/refund-policy" element={<RefundPage />} />
        <Route path="/shipping-policy" element={<ShippingPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
      <Footer />
      <BackToTop />
    </WishlistProvider>
    </CartProvider>
    </AuthProvider>
    </SiteProvider>
  );
}
