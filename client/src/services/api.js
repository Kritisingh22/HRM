/* Centralised API service. Holds the short-lived access token in memory (never
 * localStorage) and transparently refreshes it once on a 401 using the httpOnly
 * refresh cookie. This is the single place that talks to the backend. */
let accessToken = null;
export const setAccessToken = (t) => { accessToken = t; };
export const getAccessToken = () => accessToken;

// Called when a protected request is 401 and the refresh attempt fails — i.e. the
// session can no longer be trusted. AuthContext registers this to clear user state
// and let the route guards redirect to /login.
let onAuthFailure = null;
export const setOnAuthFailure = (fn) => { onAuthFailure = fn; };

async function request(path, { method = 'GET', body, _retry } = {}) {
  const headers = {};
  if (accessToken) headers.Authorization = 'Bearer ' + accessToken;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, {
    method, headers, credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined
  });

  // one automatic refresh attempt on expiry
  if (res.status === 401 && !_retry && path !== '/api/auth/refresh' && path !== '/api/auth/login') {
    const ok = await refresh();
    if (ok) return request(path, { method, body, _retry: true });
    // refresh failed → the session is dead; drop the in-memory token and notify AuthContext
    accessToken = null;
    if (onAuthFailure) onAuthFailure();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

// De-duped refresh: concurrent callers (React StrictMode's double-invoked effects,
// multiple 401s in flight, several tabs) share ONE in-flight refresh. Without this,
// two refreshes racing on the same token trip the backend's refresh-token reuse
// detection and revoke the whole session.
let refreshing = null;
export function refresh() {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
        if (!res.ok) return false;
        const data = await res.json();
        accessToken = data.accessToken;
        return true;
      } catch { return false; }
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

export const api = {
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' })
};
