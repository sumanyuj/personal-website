import { useSyncExternalStore } from 'react';

function subscribe(onChange) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

const getSnapshot = () => navigator.onLine;
const getServerSnapshot = () => true;

/**
 * Whether the browser thinks it has a network.
 *
 * `navigator.onLine` only knows whether an interface is up, so it can say yes
 * on a captive portal or a dead uplink. It is right often enough to drive the
 * UI, and a request that fails anyway is caught where it is made — this decides
 * what to *offer*, not what is true.
 */
export default function useOnline() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
