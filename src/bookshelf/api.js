/**
 * The API client.
 *
 * Everything is same-origin — Caddy serves the site and proxies /api to the
 * service — so the session cookie rides along without any CORS or token
 * plumbing, and the token itself is HttpOnly and never visible here.
 */

const BASE = '/api';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, raw, signal, headers = {} } = {}) {
  const init = { method, signal, headers: { ...headers }, credentials: 'same-origin' };

  if (raw) {
    init.body = raw;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${BASE}${path}`, init);
  const isJSON = response.headers.get('content-type')?.includes('application/json');
  const payload = isJSON ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    throw new ApiError(payload?.error ?? `Request failed (${response.status})`, response.status);
  }

  // The service worker marks a response it served from its own cache, which is
  // how the page can tell a live library from the last one it saw.
  if (payload && typeof payload === 'object' && response.headers.get('x-from-cache') === '1') {
    payload.fromCache = true;
  }
  return payload;
}

// MARK: - Session

export const me = () => request('/auth/me');
export const login = (username, password) =>
  request('/auth/login', { method: 'POST', body: { username, password } });
export const register = (username, password, code) =>
  request('/auth/register', { method: 'POST', body: { username, password, code } });
export const logout = () => request('/auth/logout', { method: 'POST' });

// MARK: - Library

export const fetchLibrary = () => request('/library');
export const putBook = (book) =>
  request(`/books/${encodeURIComponent(book.id)}`, { method: 'PUT', body: book });
export const deleteBook = (id) => request(`/books/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const putList = (list) =>
  request(`/lists/${encodeURIComponent(list.id)}`, { method: 'PUT', body: list });
export const deleteList = (id) => request(`/lists/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** One request for a whole library, used when an existing local one is adopted. */
export const importLibrary = (books, lists) =>
  request('/books', { method: 'POST', body: { books, lists } });

export function uploadCover(bookId, variant, blob, aspect) {
  const params = new URLSearchParams({ variant });
  if (aspect) params.set('aspect', String(aspect));
  return request(`/books/${encodeURIComponent(bookId)}/cover?${params}`, {
    method: 'PUT',
    raw: blob,
    headers: { 'content-type': blob.type || 'application/octet-stream' }
  });
}

/**
 * Cover URLs carry the etag, so the browser can cache one forever and still
 * pick up a replacement the moment the artwork changes.
 */
export const thumbURL = (book) =>
  book?.coverEtag ? `${BASE}/books/${encodeURIComponent(book.id)}/thumb?v=${book.coverEtag}` : null;

export const coverURL = (book) =>
  book?.coverEtag ? `${BASE}/books/${encodeURIComponent(book.id)}/cover?v=${book.coverEtag}` : null;
