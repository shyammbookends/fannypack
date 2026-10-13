import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../shop/AuthContext.jsx';

// Guard: pages that need a signed-in user (checkout, account)
export function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <main className="shop-page container">
        <div className="shop-loading"><span className="shop-spinner"></span>Loading…</div>
      </main>
    );
  }
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}
