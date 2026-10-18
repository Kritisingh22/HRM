/* ============================================================
   Auth context — session bootstrap, login, logout, permissions
   and the live login-session snapshot for the topbar.

   The session is restored from storage on boot (remember me),
   validated against the API, and mirrored into React state.
   ============================================================ */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { LoginSessionRecord, SessionActivity, SessionUser } from '@/types';
import { api, clearSession, readSession } from '@/api/client';
import { canManagePeople, canSeeSalary, canVisit } from '@/data/nav';
import { captureLocation } from '@/lib/geo';
import { useApp } from '@/store/AppContext';

type AuthStatus = 'booting' | 'authenticated' | 'guest';

/**
 * The live login-session snapshot shown in the topbar: the backend's
 * activity payload plus the clock skew measured when it arrived.
 * Running work time = `Date.now() + skewMs − session.loginAt`, so the
 * counter ticks locally but stays anchored to server time.
 */
export interface SessionSnapshot extends SessionActivity {
  skewMs: number;
}

interface AuthContextValue {
  user: SessionUser | null;
  status: AuthStatus;
  /** live login-session data for the navbar panel (null until loaded) */
  activity: SessionSnapshot | null;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  /** ends the session; resolves with the closed login-session record */
  logout: () => Promise<LoginSessionRecord | null>;
  /** role-based helpers, derived once for the current user */
  canVisitPage: (page: string) => boolean;
  canSeeSalary: boolean;
  canManage: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { logLocation, apiMode, enableApiSession, disableApiSession } = useApp();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('booting');
  const [activity, setActivity] = useState<SessionSnapshot | null>(null);

  /* Load the navbar session panel data. Failures just leave the
     panel hidden — auth state itself is owned by `me()` / `login()`. */
  const refreshActivity = useCallback(async (accessToken: string) => {
    try {
      const payload = await api.sessionActivity(accessToken);
      setActivity({ ...payload, skewMs: payload.serverNow - Date.now() });
    } catch {
      /* no panel this round */
    }
  }, []);

  /* ---- restore an existing session on boot ---- */
  useEffect(() => {
    let cancelled = false;
    const stored = readSession();
    if (!stored) {
      setStatus('guest');
      return;
    }
    api
      .me(stored.accessToken)
      .then((fresh) => {
        if (cancelled) return;
        setUser(fresh);
        setStatus('authenticated');
        if (stored.source === 'api') {
          enableApiSession({
            role: fresh.role,
            employeeId: fresh.employeeId ?? null,
            name: fresh.name,
            email: fresh.email,
          });
        }
        void refreshActivity(stored.accessToken);
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
        setStatus('guest');
      });
    return () => {
      cancelled = true;
    };
  }, [refreshActivity, enableApiSession]);

  const login = useCallback(
    async (email: string, password: string, remember: boolean) => {
      /* One-shot location capture runs alongside the credential check.
         The browser may prompt; a refusal or timeout never blocks the
         sign-in — it just means no location record is stored. */
      const capture = captureLocation();
      const session = await api.login(email, password, remember);
      setUser(session.user);
      setStatus('authenticated');
      if (session.source === 'api') {
        /* Real accounts get the real workspace — official server data. */
        enableApiSession({
          role: session.user.role,
          employeeId: session.user.employeeId ?? null,
          name: session.user.name,
          email: session.user.email,
        });
      } else if (apiMode) {
        /* A demo sign-in after a real session: wipe server data first. */
        disableApiSession();
      }
      void refreshActivity(session.accessToken);

      void capture.then(({ point }) => {
        if (!point) return;
        logLocation({
          kind: 'login',
          ref: session.sessionId,
          employeeId: session.user.employeeId ?? null,
          email: session.user.email,
          ...point,
        });
      });
    },
    [logLocation, refreshActivity, enableApiSession, disableApiSession, apiMode],
  );

  const logout = useCallback(async (): Promise<LoginSessionRecord | null> => {
    const stored = readSession();
    let closed: LoginSessionRecord | null = null;
    if (stored) {
      try {
        /* The backend closes the login-session row with server time
           and hands it back for the sign-out confirmation. */
        closed = await api.logout(stored.accessToken);
      } catch {
        clearSession();
      }
    }
    setUser(null);
    setActivity(null);
    setStatus('guest');
    if (stored?.source === 'api') {
      /* Never leave server data (or the API-mode store) behind a
         signed-out screen. */
      disableApiSession();
    }
    return closed;
  }, [disableApiSession]);

  const value = useMemo<AuthContextValue>(() => {
    const role = user?.role;
    return {
      user,
      status,
      activity,
      login,
      logout,
      canVisitPage: (page: string) => {
        if (!role) return false;
        if (user?.nav && user.nav.length) return user.nav.includes(page);
        return canVisit(role, page);
      },
      canSeeSalary: role ? canSeeSalary(role) : false,
      canManage: role ? canManagePeople(role) : false,
    };
  }, [user, status, activity, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
