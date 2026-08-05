import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiLogin, apiLogout, apiMe, apiSignup } from '../client';

/**
 * Authentication state. Backed by the backend session cookie.
 * On first load, verifies the session via /api/auth/me.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiMe()
      .then((d) => active && setUser(d.user || null))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const value = useMemo(() => {
    const login = async (email, password) => {
      const d = await apiLogin(email, password);
      setUser(d.user);
      return d.user;
    };
    const signup = async (email, password) => {
      const d = await apiSignup(email, password);
      setUser(d.user);
      return d.user;
    };
    const logout = async () => {
      try { await apiLogout(); } catch { /* already signed out */ }
      setUser(null);
    };
    return { user, loading, login, signup, logout };
  }, [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}