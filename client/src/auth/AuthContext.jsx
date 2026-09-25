/* Authentication state for the React app. Restores the session on load (refresh
 * cookie → access token → /me). Exposes login/logout and role/permission helpers.
 * Note: these helpers gate UI only — the backend independently enforces access. */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setAccessToken, refresh, setOnAuthFailure } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
<<<<<<< HEAD
=======
  const [sessionKey, setSessionKey] = useState(0); // Forces remount on auth changes
>>>>>>> 0f31467 (intial Update HRM 1.1)

  // If a refresh fails mid-session, the API layer calls this: clear all auth state
  // so the route guards send the user to /login (session-expiry handling).
  useEffect(() => {
<<<<<<< HEAD
    setOnAuthFailure(() => { setAccessToken(null); setUser(null); });
=======
    setOnAuthFailure(() => { setAccessToken(null); setUser(null); setSessionKey(k => k + 1); });
>>>>>>> 0f31467 (intial Update HRM 1.1)
    return () => setOnAuthFailure(null);
  }, []);

  // restore an existing session on first load
  useEffect(() => {
    (async () => {
      if (await refresh()) {
        try { const { user } = await api.me(); setUser(user); } catch { /* not logged in */ }
      }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email, password) => {
    const { accessToken, user } = await api.login(email, password);
    setAccessToken(accessToken);
    setUser(user);
<<<<<<< HEAD
=======
    setSessionKey(k => k + 1); // Force remount of route tree
>>>>>>> 0f31467 (intial Update HRM 1.1)
    return user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setAccessToken(null);
    setUser(null);
<<<<<<< HEAD
  }, []);

  const hasRole = useCallback((...roles) => !!user && roles.includes(user.role), [user]);
=======
    setSessionKey(k => k + 1); // Force remount of route tree
  }, []);

  const hasRole = useCallback((...roles) => !!user && roles.includes(user.role), [user]);
  
  // Check permissions from user.permissions (merged role + user-specific)
>>>>>>> 0f31467 (intial Update HRM 1.1)
  const hasPermission = useCallback((perm) => {
    if (!user) return false;
    const p = user.permissions || [];
    return p.includes('*') || p.includes(perm) || p.includes(perm.split(':')[0] + ':*');
  }, [user]);

<<<<<<< HEAD
  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated: !!user, login, logout, hasRole, hasPermission }}>
=======
  // Check if user has ANY of the given permissions
  const hasAnyPermission = useCallback((perms) => {
    if (!user || !Array.isArray(perms)) return false;
    return perms.some(p => hasPermission(p));
  }, [hasPermission]);

  // Check if user has ALL of the given permissions
  const hasAllPermissions = useCallback((perms) => {
    if (!user || !Array.isArray(perms)) return false;
    return perms.every(p => hasPermission(p));
  }, [hasPermission]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      isAuthenticated: !!user, 
      login, 
      logout, 
      hasRole, 
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      sessionKey
    }}>
>>>>>>> 0f31467 (intial Update HRM 1.1)
      {children}
    </AuthContext.Provider>
  );
}

<<<<<<< HEAD
export const useAuth = () => useContext(AuthContext);
=======
export const useAuth = () => useContext(AuthContext);
>>>>>>> 0f31467 (intial Update HRM 1.1)
