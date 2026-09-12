import { useLayoutEffect, useState } from 'react';

/**
 * Tracks an element's content box. The shelf derives every dimension from this,
 * so a ResizeObserver is used rather than window resize: the case also changes
 * size when the edit bar appears, which never fires a window event.
 */
export default function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      setSize((current) =>
        Math.abs(current.width - box.width) < 1 && Math.abs(current.height - box.height) < 1
          ? current
          : { width: box.width, height: box.height }
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
