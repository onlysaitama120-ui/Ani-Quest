/**
 * ANIQUEST — client for the backend API (auth + watchlist sync).
 * Same-origin requests; session is carried by an HttpOnly cookie.
 */

async function request(path, options = {}) {
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* ---------------- Auth ---------------- */
export const apiSignup = (email, password) =>
  request('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) });

export const apiLogin = (email, password) =>
  request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const apiLogout = () =>
  request('/api/auth/logout', { method: 'POST' });

export const apiMe = () =>
  request('/api/auth/me');

/* ---------------- Watchlist ---------------- */
export const apiGetWatchlist = () =>
  request('/api/watchlist');

export const apiPutWatchlist = (items) =>
  request('/api/watchlist', { method: 'PUT', body: JSON.stringify({ items }) });

export const apiAddWatchlistItem = (item, kind) =>
  request('/api/watchlist', { method: 'POST', body: JSON.stringify({ ...item, kind }) });

export const apiRemoveWatchlistItem = (mal_id, kind) =>
  request(`/api/watchlist/${kind}/${mal_id}`, { method: 'DELETE' });