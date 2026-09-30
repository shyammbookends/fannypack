import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

// Who is signed in. The session itself is an HttpOnly cookie backed by the
// "sessions" table, so a returning visitor is recognised automatically.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  const login = useCallback(async (identifier, password) => {
    const r = await api.login(identifier, password);
    setUser(r.user);
    return r.user;
  }, []);

  const signup = useCallback(async (data) => {
    const r = await api.signup(data);
    setUser(r.user);
    return r.user;
  }, []);

  // Reset link: the server signs the user in with the new password
  const resetPassword = useCallback(async (token, password) => {
    const r = await api.resetPassword(token, password);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, signup, resetPassword, logout, setUser }),
    [user, ready, login, signup, resetPassword, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
