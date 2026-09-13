/*
 * Offline support for the bookshelf.
 *
 * Two separate problems: the page has to load at all without a network, and
 * the library has to be there once it does. Runtime caching covers both — the
 * shell and the covers are cached as they are used, so there is no build-time
 * asset manifest to keep in step with Vite's hashed filenames.
 *
 * Offline is deliberately read-only. Writes are never queued or replayed: the
 * server is the source of truth, and a replayed edit from a week ago silently
 * overwriting a newer one from another device is worse than being told to
 * reconnect.
 */

const VERSION = 'v1';
const SHELL = `bookshelf-shell-${VERSION}`;
/** The library and who is signed in. Private: cleared on sign-out. */
const DATA = `bookshelf-data-${VERSION}`;
/** Cover art. Also private, and capped because it is the one cache that grows. */
const MEDIA = `bookshelf-media-${VERSION}`;

const PRIVATE_CACHES = [DATA, MEDIA];
const MEDIA_LIMIT = 400;

const SHELL_URL = '/bookshelf/';

self.addEventListener('install', (event) => {
  // The shell is worth having before it is asked for; everything else arrives
  // through normal use.
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add(SHELL_URL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, DATA, MEDIA]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith('bookshelf-') && !keep.has(name)).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

/** Sign-out has to take the cached library and covers with it. */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'clear-private') {
    event.waitUntil(Promise.all(PRIVATE_CACHES.map((name) => caches.delete(name))));
  }
});

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  // Oldest first, which for the Cache API is insertion order.
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key)));
}

async function cacheFirst(request, cacheName, { limit } = {}) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    if (limit) trim(cacheName, limit);
  }
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    // Only successes are worth keeping: caching a 401 would leave the app
    // convinced it was signed out for as long as it stayed offline.
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) {
      // Marked so the page can tell a cached library from a live one.
      const headers = new Headers(hit.headers);
      headers.set('x-from-cache', '1');
      return new Response(await hit.blob(), {
        status: hit.status,
        statusText: hit.statusText,
        headers
      });
    }
    throw error;
  }
}

/** Serve from cache immediately and refresh in the background. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return hit ?? (await network) ?? Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // Writes go to the network or fail. Nothing is queued.
  if (request.method !== 'GET') return;

  // The page itself, so the app opens with no network at all.
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, SHELL).catch(() =>
        caches.match(SHELL_URL, { ignoreSearch: true }).then((hit) => hit ?? Response.error())
      )
    );
    return;
  }

  // Cover art is addressed by etag, so a hit can never be stale.
  if (/^\/api\/books\/[^/]+\/(thumb|cover)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, MEDIA, { limit: MEDIA_LIMIT }));
    return;
  }

  // The library and the session: live when possible, last known otherwise.
  if (url.pathname === '/api/library' || url.pathname === '/api/auth/me') {
    event.respondWith(networkFirst(request, DATA));
    return;
  }

  // Everything else under /api is a write or a search; no offline story.
  if (url.pathname.startsWith('/api/')) return;

  // Build output is content-hashed, so it is safe to serve from cache first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, SHELL));
    return;
  }

  if (url.pathname.startsWith('/bookshelf/')) {
    event.respondWith(staleWhileRevalidate(request, SHELL));
  }
});
