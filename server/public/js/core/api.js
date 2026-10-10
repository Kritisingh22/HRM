/* Thin wrapper over the portal's authenticated fetch (window.hrApi: bearer token,
 * automatic one-shot refresh on 401). Role pages never build auth headers and never
 * send an employee id for authorisation: the server derives identity from the token. */
export class ApiError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    Object.assign(this, extra || {});
  }
}

const DEFAULT_MSG = {
  401: 'Your session has expired. Please sign in again.',
  403: "You don't have permission to view this.",
  404: 'Not found.',
  429: 'Too many requests. Please wait a moment.',
};

export async function api(path, { method = 'GET', body, query } = {}) {
  if (typeof window.hrApi !== 'function') throw new ApiError(0, 'Portal is not ready yet.');
  let url = path;
  if (query) {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && qs.set(k, v));
    const s = qs.toString();
    if (s) url += (url.includes('?') ? '&' : '?') + s;
  }
  const opts = { method, headers: {} };
  if (body instanceof FormData) {
    opts.body = body;                       // browser sets the multipart boundary
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await window.hrApi(url, opts);
  } catch (e) {
    throw new ApiError(0, 'Network error. Check your connection and try again.', { network: true });
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || DEFAULT_MSG[res.status] || 'Request failed (' + res.status + ').';
    throw new ApiError(res.status, msg, { details: data && data.details });
  }
  return data || {};
}

export const get = (p, query) => api(p, { query });
export const post = (p, body) => api(p, { method: 'POST', body });
export const put = (p, body) => api(p, { method: 'PUT', body });
export const del = (p) => api(p, { method: 'DELETE' });

/* Authenticated file download (the token is a header, so a plain <a href> would 401). */
export async function download(path, filename) {
  const res = await window.hrApi(path);
  if (!res.ok) throw new ApiError(res.status, DEFAULT_MSG[res.status] || 'Download failed.');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename || 'download'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
