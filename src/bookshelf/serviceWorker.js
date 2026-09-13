/**
 * Registration for the offline cache.
 *
 * Scoped to /bookshelf/ by virtue of where the script is served from, so the
 * homepage is left entirely alone.
 */

const SW_URL = '/bookshelf/sw.js';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Registering after load keeps it off the critical path for first paint.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_URL).catch(() => {
      // No offline support is a degraded experience, not a broken one.
    });
  });
}

/**
 * Drops the cached library and covers. Called on sign-out: the next person to
 * open the app on this device must not find the previous one's shelf sitting
 * in the cache.
 */
export async function clearPrivateCaches() {
  try {
    const registration = await navigator.serviceWorker?.ready;
    registration?.active?.postMessage({ type: 'clear-private' });
  } catch {
    // Fall through to deleting them directly.
  }
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => n.startsWith('bookshelf-data') || n.startsWith('bookshelf-media'))
        .map((n) => caches.delete(n))
    );
  } catch {
    // Nothing to clear, or the Cache API is unavailable.
  }
}
