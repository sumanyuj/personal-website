import { useCallback, useState } from 'react';

/**
 * State mirrored into localStorage. Used for display preferences the reader sets
 * once and expects to stay put — the zoom level, the view mode — and nothing
 * that matters enough to belong in the database.
 */
export default function useStoredState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initial : JSON.parse(stored);
    } catch {
      return initial;
    }
  });

  const update = useCallback(
    (next) => {
      setValue((current) => {
        const resolved = typeof next === 'function' ? next(current) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Private browsing, or a full quota. The setting simply won't persist.
        }
        return resolved;
      });
    },
    [key]
  );

  return [value, update];
}
