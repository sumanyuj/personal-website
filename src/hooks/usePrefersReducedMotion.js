import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange) {
  const query = window.matchMedia(QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;

// No window during prerender; assume motion is allowed and let the client
// correct it on hydration.
const getServerSnapshot = () => false;

/**
 * Reads the OS "reduce motion" setting as a subscription rather than a
 * one-shot read, so toggling it in system settings updates the page live.
 */
export default function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
