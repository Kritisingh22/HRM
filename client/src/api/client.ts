/* ============================================================
   API client — the only module the app talks to.

   Two backends answer the same calls:
     · the real HRM API (`/api/*`: JWT access token + httpOnly
       refresh cookie) — used whenever the server is reachable and
       the account is real;
     · the built-in demo backend (`mockServer`) — used for the
       seeded demo credentials, offline previews and any account
       the API does not know.

   Sign-in tries the real API first: real accounts get a real
   session (so official server data — e.g. payslip PDFs — is
   available), otherwise the demo answers and the session is
   flagged `demo` so feature modules can pick the right source.
   ============================================================ */
import type { LocationRecord, LoginSessionRecord, SessionActivity, SessionUser } from '@/types';
import { ApiError } from '@/api/mockServer';

const REMEMBER_KEY = 'cyethackHRM.session.remembered';
const SESSION_KEY = 'cyethackHRM.session';
/** api-session profile only — never the access token. */
const USER_KEY = 'cyethackHRM.user';

/** Which backend issued a stored session. */
export type SessionSource = 'api' | 'demo';

export interface LoginPayload {
  accessToken: string;
  sessionId: string;
  user: SessionUser;
  issuedAt: number;
  expiresAt: number;
}

export interface StoredSession extends LoginPayload {
  /**
   * `'api'` — a real HRM-API session: official server data and
   * documents (payslip PDFs) are available.
   * `'demo'` — the built-in demo backend.
   */
  source: SessionSource;
}

/** The live api-session access token lives only in memory (this tab) and in
 *  the httpOnly refresh cookie — it is never written to localStorage. */
let currentSession: StoredSession | null = null;

/** The access-token-bearing session for this tab (api or demo). */
export function getCurrentSession(): StoredSession | null {
  return currentSession;
}

function readRaw(key: string, area: 'local' | 'session'): string | null {
  try {
    return area === 'local' ? window.localStorage.getItem(key) : window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Parse a stored session payload, validating the minimum fields. */
function parseStored(raw: string): StoredSession | null {
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.expiresAt) return null;
    const source: SessionSource = parsed.source === 'api' ? 'api' : 'demo';
    if (parsed.expiresAt < Date.now() && source === 'demo') {
      // Demo tokens cannot be renewed — an expired one is dead.
      return null;
    }
    return { ...parsed, source };
  } catch {
    return null;
  }
}

/** The current session: in-memory api session wins this tab, then sessionStorage
 *  (demo), then a localStorage remember-me marker. For api sessions the marker
 *  holds only the user profile (USER_KEY) — never the access token — so the
 *  durable session is the httpOnly refresh cookie, not localStorage. */
export function readSession(): StoredSession | null {
  if (currentSession) return currentSession;
  try {
    const raw = readRaw(SESSION_KEY, 'session');
    if (raw) {
      const parsed = parseStored(raw);
      if (parsed) return parsed;
    }
  } catch {
    /* fall through to the remember-me marker */
  }
  try {
    if (window.localStorage.getItem(REMEMBER_KEY) === '1') {
      const demo = readRaw(SESSION_KEY, 'local');
      if (demo) {
        const parsed = parseStored(demo);
        if (parsed) return parsed;
      }
      const userRaw = readRaw(USER_KEY, 'local');
      if (userRaw) {
        const { user } = JSON.parse(userRaw) as { user?: SessionUser };
        if (user) {
          return {
            source: 'api',
            user,
            accessToken: '', // minted from the refresh cookie on first use
            expiresAt: 1, // truthy but in the past
            issuedAt: 0,
            sessionId: '',
          };
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Persist a session: api sessions keep the token in memory only (never
 *  localStorage); demo sessions live in sessionStorage. A remember-me api
 *  session stores a marker + profile in localStorage — the token itself is
 *  re-minted from the httpOnly refresh cookie. */
export function writeSession(payload: LoginPayload & { source?: SessionSource }, remember: boolean): void {
  const stored: StoredSession = { ...payload, source: payload.source === 'api' ? 'api' : 'demo' };
  currentSession = stored;
  if (stored.source === 'demo') {
    try {
      if (remember) {
        window.localStorage.setItem(REMEMBER_KEY, '1');
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
        window.sessionStorage.removeItem(SESSION_KEY);
      } else {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
        window.localStorage.removeItem(SESSION_KEY);
        window.localStorage.removeItem(REMEMBER_KEY);
      }
    } catch {
      /* storage blocked — the session still lives in React state */
    }
    return;
  }
  /* api session: never persist the access token to localStorage */
  try {
    if (remember) {
      window.localStorage.setItem(REMEMBER_KEY, '1');
      window.localStorage.setItem(USER_KEY, JSON.stringify({ user: stored.user }));
      window.localStorage.removeItem(SESSION_KEY);
    } else {
      window.localStorage.removeItem(REMEMBER_KEY);
      window.localStorage.removeItem(USER_KEY);
      window.localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* storage blocked — the session still lives in React state */
  }
}

export function clearSession(): void {
  try {
    currentSession = null;
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(REMEMBER_KEY);
    window.localStorage.removeItem(USER_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Replace the stored session (token renewal). api sessions stay in memory only;
 *  demo sessions are rewritten to sessionStorage. */
function persistStored(stored: StoredSession): void {
  currentSession = stored;
  if (stored.source !== 'api') {
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    } catch {
      /* storage blocked — the in-memory copy is still updated by callers */
    }
  }
}

/** True when the current session belongs to the real HRM API. */
export function isApiSession(): boolean {
  return readSession()?.source === 'api';
}

/* ---------------- real HRM API plumbing ---------------- */

function parseTtl(value: unknown, fallbackMs: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value * 1000;
  const m = /^(\d+)\s*([smhd])?$/i.exec(String(value ?? '').trim());
  if (!m) return fallbackMs;
  const unit = (m[2] || 's').toLowerCase();
  const factor = unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : unit === 'd' ? 86_400_000 : 1_000;
  return Number(m[1]) * factor;
}

/** Parse the safe error payload of a non-OK API response. */
async function errorFromResponse(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status}).`;
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error) message = body.error;
  } catch {
    /* non-JSON error body — keep the generic message */
  }
  return new ApiError(res.status, message);
}

/** One fetch against the real HRM API (same-origin, cookies included). */
async function realApi(path: string, init: RequestInit = {}): Promise<Response> {
  await acquire();
  try {
    let res: Response;
    try {
      const timeoutMs = init.timeoutMs ?? 15_000; // 15s default timeout
      const ctrl = new AbortController();
      const id = setTimeout(() => ctrl.abort(), timeoutMs);
      res = await fetch(path, { credentials: 'same-origin', ...init, signal: ctrl.signal });
      clearTimeout(id);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw new ApiError(0, 'Request timed out. Please try again.');
      throw err;
    }
    if (!res.ok) throw await errorFromResponse(res);
    return res;
  } finally {
    release();
  }
}

function bearer(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/** The public reference (`SESS-…`) of the fresh token's login-session row. */
async function fetchSessionRef(accessToken: string): Promise<string> {
  try {
    const res = await fetch('/api/sessions/me', {
      credentials: 'same-origin',
      headers: bearer(accessToken),
    });
    if (!res.ok) return '';
    const body = (await res.json()) as { session?: { id?: string } | null };
    return body.session?.id ? String(body.session.id) : '';
  } catch {
    return '';
  }
}

interface ApiSessionRow {
  id: string;
  employeeId: string | null;
  role: SessionUser['role'];
  loginAt: string;
  logoutAt: string | null;
  status: 'Active' | 'LoggedOut';
  durationSeconds: number | null;
}

function mapApiSession(row: ApiSessionRow, self: SessionUser | null): LoginSessionRecord {
  return {
    id: String(row.id),
    userId: self?.id ?? '',
    employeeId: row.employeeId ?? null,
    name: self?.name ?? '',
    email: self?.email ?? '',
    role: row.role,
    loginAt: Date.parse(row.loginAt),
    logoutAt: row.logoutAt ? Date.parse(row.logoutAt) : null,
    durationMs: row.durationSeconds != null ? row.durationSeconds * 1000 : null,
    status: row.status === 'Active' ? 'Active' : 'Logged Out',
  };
}

/** Try the real API login. Returns null when the API is unreachable or
    the credentials are not a real account (the demo then answers). */
async function tryRealLogin(email: string, password: string): Promise<StoredSession | null> {
  let res: Response;
  try {
    res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return null; // API not running / offline → the demo answers instead
  }
  if (!res.ok) {
    // Surface HTTP errors as ApiError so the caller can show the right message
    // (wrong password, rate limited, server error) instead of "server unreachable".
    throw await errorFromResponse(res);
  }
  try {
    const body = (await res.json()) as { accessToken?: string; expiresIn?: string; user?: SessionUser };
    if (!body.accessToken || !body.user) return null;
    const issuedAt = Date.now();
    return {
      accessToken: body.accessToken,
      sessionId: await fetchSessionRef(body.accessToken),
      user: body.user,
      issuedAt,
      expiresAt: issuedAt + parseTtl(body.expiresIn, 15 * 60 * 1000),
      source: 'api',
    };
  } catch {
    return null;
  }
}

let realSessionRenewal: Promise<StoredSession | null> | null = null;

/** Mint a fresh access token from the httpOnly refresh cookie. Persists
    the renewed session; returns null when the cookie is gone/expired.
    Concurrent 401 responses share one refresh because refresh tokens rotate
    on every use and replaying the old token revokes the whole token family.

    On 429 (rate-limited refresh), respect Retry-After and retry once with
    exponential backoff jitter so many tabs don't thundering-herd. */
async function renewRealSessionWithBackoff(attempt = 0): Promise<StoredSession | null> {
  if (realSessionRenewal) return realSessionRenewal;

  // Max 2 attempts total (original + one retry)
  if (attempt >= 2) return null;

  realSessionRenewal = (async () => {
    let res: Response;
    try {
      res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    } catch {
      return null;
    }

    // Handle 429 with Retry-After and jitter backoff
    if (res.status === 429 && attempt < 2) {
      const retryAfter = res.headers.get('Retry-After')
        ? Math.max(1000, Number(res.headers.get('Retry-After')) * 1000)
        : 5_000; // default 5s jittered backoff
      const jitter = Math.random() * 2000; // +0-2s jitter
      await new Promise(r => setTimeout(r, retryAfter + jitter));
      // Single retry with backoff — after this, give up so the caller can
      // show a clean "session expired" UI rather than endless retry loops.
      return renewRealSessionWithBackoff(attempt + 1);
    }

    if (!res.ok) return null;
    try {
      const body = (await res.json()) as { accessToken?: string; expiresIn?: string; user?: SessionUser };
      if (!body.accessToken || !body.user) return null;
      const issuedAt = Date.now();
      const renewed: StoredSession = {
        accessToken: body.accessToken,
        sessionId: readSession()?.sessionId ?? '',
        user: body.user,
        issuedAt,
        expiresAt: issuedAt + parseTtl(body.expiresIn, 15 * 60 * 1000),
        source: 'api',
      };
      persistStored(renewed);
      return renewed;
    } catch {
      return null;
    }
  })().finally(() => {
    realSessionRenewal = null;
  });

  return realSessionRenewal;
}

/** Mint a fresh access token from the httpOnly refresh cookie. Persists
    the renewed session; returns null when the cookie is gone/expired. */
export { renewRealSessionWithBackoff as renewRealSession };

/* ============================================================
   Global request semaphore — limits concurrent API requests
   to prevent browser resource exhaustion (ERR_INSUFFICIENT_RESOURCES).
   ============================================================ */

let concurrentRequests = 0;
const MAX_CONCURRENT = 6; // browser-friendly limit

function acquire(): Promise<void> {
  return new Promise(resolve => {
    if (concurrentRequests < MAX_CONCURRENT) {
      concurrentRequests++;
      resolve();
    } else {
      // Wait for a slot to open
      setTimeout(() => acquire().then(resolve), 10);
    }
  });
}

function release(): void {
  concurrentRequests = Math.max(0, concurrentRequests - 1);
}

/* ============================================================
   Request in-flight tracking — prevents obsolete requests
   from completing after the component has unmounted or data
   has been refreshed.
   ============================================================ */

const inflightSlots = new Map<string, AbortController>();

function trackInflight(key: string, controller: AbortController): void {
  inflightSlots.set(key, controller);
}

function clearInflight(key: string): void {
  const controller = inflightSlots.get(key);
  if (controller) {
    controller.abort();
    inflightSlots.delete(key);
  }
}

function clearAllInflight(): void {
  inflightSlots.forEach(controller => controller.abort());
  inflightSlots.clear();
}

/* ============================================================
   Parse the safe error payload of a non-OK API response.
   ============================================================ */

interface CacheSlot {
  json: unknown;
  expires: number;
  inflight?: Promise<unknown>;
}

const getCache = new Map<string, CacheSlot>();

function cacheKey(method: string, url: string): string | null {
  return method === 'GET' ? `${method} ${url}` : null;
}

/** Clear every cached GET — call after any mutation. */
export function invalidateGetCache(): void {
  getCache.clear();
}

function cachedResponse(json: unknown): Response {
  return new Response(JSON.stringify(json), {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
  });
}

async function getCached(path: string, init: RequestInit): Promise<Response> {
  const key = cacheKey(init.method ?? 'GET', path);
  if (!key) return realApi(path, init);

  const now = Date.now();
  const slot = getCache.get(key);

  /* Cache hit — return a fresh Response from the stored JSON. */
  if (slot && slot.expires > now) return cachedResponse(slot.json);

  /* Dedupe: an identical request is already in flight — wait on it. */
  if (slot?.inflight) return slot.inflight.then((json) => cachedResponse(json));

  const promise = (async (): Promise<unknown> => {
    const res = await realApi(path, init);
    return res.json();
  })();

  getCache.set(key, { json: undefined as unknown, expires: 0, inflight: promise });

  const json = await promise;
  getCache.set(key, { json, expires: now + GET_CACHE_TTL_MS, inflight: undefined });
  return cachedResponse(json);
}

/**
 * Authenticated request against the real HRM API for feature modules
 * (official payslips, documents …). Renews a lapsed access token once
 * via the httpOnly refresh cookie and throws `ApiError` carrying the
 * server's safe message on failure.
 *
 * GET requests are de-duplicated and short-lived cached; mutations
 * invalidate the cache.
 */
export async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const session = readSession();
  if (!session || session.source !== 'api') {
    throw new ApiError(401, 'Sign in with your work account to open official documents.');
  }

  const attempt = async (token: string): Promise<Response> => {
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    let res: Response;
    try {
      res = init.method && init.method !== 'GET'
        ? await fetch(path, { credentials: 'same-origin', ...init, headers })
        : await getCached(path, { credentials: 'same-origin', ...init, headers });
    } catch {
      throw new ApiError(0, 'The HR server is unreachable. Check that it is running and try again.');
    }
    if (!res.ok) throw await errorFromResponse(res);
    return res;
  };

  /* A remember-me marker carries no access token — mint one from the
   * httpOnly refresh cookie before the first request. */
  let token = session.accessToken;
  if (!token) {
    const renewed = await renewRealSession();
    if (!renewed) {
      clearSession();
      throw new ApiError(401, 'Your session has expired — please sign in again.');
    }
    token = renewed.accessToken;
  }

  try {
    return await attempt(token);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    const latestSession = readSession();
    if (
      latestSession?.source === 'api' &&
      latestSession.accessToken &&
      latestSession.accessToken !== session.accessToken
    ) {
      return attempt(latestSession.accessToken);
    }
    const renewed = await renewRealSession();
    if (!renewed) {
      clearSession();
      throw new ApiError(401, 'Your session has expired — please sign in again.');
    }
    return attempt(renewed.accessToken);
  }
}

/**
 * Lightweight bootstrap: current user, permissions, unread notification
 * count and dashboard KPIs in one round trip. Used for the first paint
 * so the shell is never blocked on the full per-collection hydrate.
 */
export async function bootstrap(accessToken: string): Promise<{
  user: SessionUser;
  unreadCount: number;
  dashboard: unknown;
}> {
  const res = await realApi('/api/bootstrap', {
    credentials: 'same-origin',
    headers: bearer(accessToken),
  });
  return (await res.json()) as { user: SessionUser; unreadCount: number; dashboard: unknown };
}

export const api = {
  async login(email: string, password: string, remember: boolean): Promise<StoredSession> {
    const real = await tryRealLogin(email, password);
    if (!real) throw new ApiError(0, 'The HR server is unreachable. Please check your connection and try again.');
    writeSession(real, remember);
    return real;
  },

  async me(accessToken: string): Promise<SessionUser> {
    const stored = readSession();
    if (stored?.source === 'api') {
      const token = stored.accessToken || accessToken;
      try {
        const res = await realApi('/api/auth/me', { headers: bearer(token) });
        return ((await res.json()) as { user: SessionUser }).user;
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 401) throw err;
        const renewed = await renewRealSession();
        if (!renewed) {
          clearSession();
          throw new ApiError(401, 'Session expired — please sign in again.');
        }
        const res = await realApi('/api/auth/me', { headers: bearer(renewed.accessToken) });
        return ((await res.json()) as { user: SessionUser }).user;
      }
    }
    throw new ApiError(401, 'No valid session — please sign in again.');
  },

  /**
   * The caller's live login session (plus recent history and the
   * server clock) for the topbar session panel.
   */
  async sessionActivity(accessToken: string): Promise<SessionActivity> {
    const stored = readSession();
    if (!(stored?.source === 'api')) throw new ApiError(401, 'No valid session — please sign in again.');
    const token = stored.accessToken || accessToken;

    // Current session — the source of truth for UI session panel
    const meRes = await realApi('/api/sessions/me', { headers: bearer(token) });
    const meBody = (await meRes.json()) as { session: ApiSessionRow | null };
    if (!meBody.session) throw new ApiError(404, 'Session record not found.');

    // Recent sessions list — optional, best-effort (with client-side cache, 30s TTL)
    const listKey = '/api/sessions';
    let listBody: { sessions?: ApiSessionRow[] } = {};
    try {
      const listRes = await realApi(listKey, { headers: bearer(token) }).catch(() => null);
      listBody = listRes ? ((await listRes.json()) as { sessions?: ApiSessionRow[] }) : {};
    } catch {}

    // Health check — lightweight, zero DB, instant 200 (cached per-tab for 30s to avoid redundant pings)
    const healthCache = (sessionActivity as any).__healthCache || new Map<string, { expires: number; time?: string }>();
    const now = Date.now();
    const cachedHealth = healthCache.get('health') || {};
    if (cachedHealth.expires > now) {
      health = cachedHealth.time ? { time: cachedHealth.time } : null;
    } else {
      try {
        const healthRes = await realApi('/api/health').catch(() => null);
        const healthJson = healthRes ? await healthRes.json() : null;
        health = healthJson?.time ? { time: String(healthJson.time) } : null;
        // Store in cache with 30s TTL
        healthCache.set('health', { expires: now + 30_000, time: String(healthJson?.time ?? '') });
        ;(sessionActivity as any).__healthCache = healthCache;
      } catch {
        health = null;
        ;(sessionActivity as any).__healthCache = healthCache;
      }
    }

    const current = mapApiSession(meBody.session, stored.user);
    const recent = (listBody.sessions ?? []).slice(0, 5).map((r) => mapApiSession(r, stored.user));
    return {
      session: current,
      recent: recent.some((r) => r.id === current.id) ? recent : [current, ...recent].slice(0, 5),
      serverNow: health?.time ? Date.parse(health.time) : Date.now(),
    };
  },

  /**
   * Store one GPS capture (sign-in / check-in / check-out) on the
   * backend. Real sessions attach it to their active login-session
   * row; the demo stores the document as received.
   */
  async recordLocation(record: LocationRecord): Promise<LocationRecord> {
    const stored = readSession();
    if (!(stored?.source === 'api')) throw new ApiError(401, 'No valid session — please sign in again.');
    await apiRequest('/api/sessions/me/location', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: record.lat,
        longitude: record.lng,
        accuracy: record.accuracy,
      }),
    });
    return record;
  },

  /**
   * End the session. The backend closes the login-session row with
   * server time; the closed row is then read back so the UI can show
   * the recorded logout time and final duration.
   */
  async logout(accessToken: string): Promise<LoginSessionRecord | null> {
    const stored = readSession();
    if (!(stored?.source === 'api')) throw new ApiError(401, 'No valid session — please sign in again.');
    const token = stored.accessToken || accessToken;
    try {
      await realApi('/api/auth/logout', { method: 'POST', headers: bearer(token) });
    } catch {
      /* logout endpoint may already be invalidated; proceed to clear local state */
    }
    // The access token stays valid for its short lifetime, so the
    // now-closed row can be read back with server-computed duration.
    let closed: LoginSessionRecord | null = null;
    try {
      const res = await realApi('/api/sessions/me', { headers: bearer(token) });
      const body = (await res.json()) as { session: ApiSessionRow | null };
      if (body.session) closed = mapApiSession(body.session, stored.user);
    } catch {
      /* the confirmation row is optional */
    }
    clearSession();
    return closed;
  },
};
