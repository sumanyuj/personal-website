import { useLayoutEffect, useState } from 'react';

/**
 * Tracks an element's content box, returning a ref callback to attach to it.
 *
 * A callback rather than a ref object on purpose. With `useRef` the effect's
 * dependency is the ref itself, which never changes, so an element that is not
 * in the tree on the first render is never observed — and the app does not
 * render the case until the session check has finished. That left the shelf
 * laying out against a zero-sized measurement and clamping every book to its
 * minimum height.
 *
 * A ResizeObserver rather than window resize: the case also changes size when
 * the edit bar appears, which fires no window event.
 */
export default function useElementSize() {
  const [node, setNode] = useState(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!node) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      setSize((current) =>
        Math.abs(current.width - box.width) < 1 && Math.abs(current.height - box.height) < 1
          ? current
          : { width: box.width, height: box.height }
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, size, node];
}
