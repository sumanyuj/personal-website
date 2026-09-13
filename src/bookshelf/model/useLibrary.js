import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../api.js';
import useOnline from '../hooks/useOnline.js';
import { makeBook, makeList, visibleBooks } from './book.js';
import { saveCover, uploadExistingCover } from './covers.js';
import { discardLegacyLibrary, readLegacyLibrary } from './legacy.js';

/**
 * The library, and everything that changes it.
 *
 * The server is the source of truth — that is the whole point of having
 * accounts — so every change is written through and the local copy is updated
 * optimistically rather than waiting on a round trip. A failed write puts the
 * error on screen rather than leaving the two quietly disagreeing.
 */
export default function useLibrary(user) {
  const online = useOnline();
  const [books, setBooks] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  /** True while the shelf is showing what the cache had rather than the server. */
  const [stale, setStale] = useState(false);

  /**
   * Writes are refused rather than queued. The server is the source of truth,
   * and replaying an edit made hours ago over a newer one from another device
   * is a worse outcome than being told to reconnect.
   */
  const requireOnline = useCallback(() => {
    if (!online) throw new Error('You are offline — the shelf is read-only until you reconnect.');
  }, [online]);

  /**
   * Cover URLs are derived, not stored: each carries the etag the server
   * assigned, so the browser caches one indefinitely and still picks up a
   * replacement.
   */
  const coverURLs = useMemo(() => {
    const map = new Map();
    for (const book of books) {
      const url = api.thumbURL(book);
      if (url) map.set(book.id, url);
    }
    return map;
  }, [books]);

  const load = useCallback(async () => {
    const library = await api.fetchLibrary();
    setBooks(library.books);
    setLists(library.lists);
    setStale(Boolean(library.fromCache));
    return library;
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const library = await load();
        if (cancelled) return;

        // A device that used the app before there were accounts still has its
        // books in IndexedDB. Only offered into an empty account, so this can
        // never overwrite a library that is already up here — and never from a
        // cached read, which would mistake "offline" for "empty".
        if (library.books.length === 0 && !library.fromCache && online) {
          const legacy = await readLegacyLibrary();
          if (legacy && !cancelled) {
            setImporting(true);
            await api.importLibrary(legacy.books, legacy.lists);
            for (const book of legacy.books) {
              const master = legacy.covers.get(book.id);
              if (!master) continue;
              await uploadExistingCover(
                book.id,
                master,
                legacy.thumbs.get(book.id),
                book.coverAspect
              ).catch(() => {});
            }
            await discardLegacyLibrary();
            if (!cancelled) await load();
          }
        }
      } catch (cause) {
        if (!cancelled) setError(cause);
      } finally {
        if (!cancelled) {
          setImporting(false);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, load]);

  // A reconnect should catch up with whatever the other devices did.
  useEffect(() => {
    if (!user || !online) return;
    load().catch(() => {});
  }, [user, online, load]);

  // MARK: Books

  const addBook = useCallback(
    async (result) => {
      requireOnline();
      const book = makeBook({
        title: result.title,
        subtitle: result.subtitle ?? null,
        authors: result.authors ?? [],
        publisher: result.publisher ?? null,
        publishedDate: result.publishedDate ?? null,
        pageCount: result.pageCount ?? null,
        isbn13: result.isbn13 ?? null,
        isbn10: result.isbn10 ?? null,
        language: result.language ?? null,
        description: result.summary ?? null,
        subjects: result.subjects ?? [],
        source: result.source || 'manual',
        sortIndex: Date.now()
      });

      // The book reaches the shelf immediately with a cloth stand-in; the cover
      // arrives a moment later rather than holding up the whole add.
      const saved = (await api.putBook(book)).book;
      setBooks((current) => [...current, saved]);

      const coverSource = result.coverMasterURL ?? result.coverURL;
      if (coverSource) {
        const stored = await saveCover(book.id, coverSource, {
          fallbackURL: result.coverURL
        }).catch(() => null);
        if (stored) {
          setBooks((current) =>
            current.map((b) =>
              b.id === book.id ? { ...b, coverAspect: stored.aspect, coverEtag: stored.etag } : b
            )
          );
        }
      }
      return saved;
    },
    [requireOnline]
  );

  const updateBook = useCallback(async (id, changes) => {
    requireOnline();
    let updated;
    setBooks((current) =>
      current.map((b) => {
        if (b.id !== id) return b;
        updated = { ...b, ...changes };
        return updated;
      })
    );
    if (updated) await api.putBook(updated).catch(setError);
  }, []);

  const removeBooks = useCallback(async (ids) => {
    requireOnline();
    const set = new Set(ids);
    setBooks((current) => current.filter((b) => !set.has(b.id)));
    await Promise.all([...set].map((id) => api.deleteBook(id).catch(setError)));
  }, []);

  // MARK: Collections

  const createList = useCallback(
    async (name) => {
      requireOnline();
      const list = makeList(name, lists.length);
      setLists((current) => [...current, list]);
      await api.putList(list).catch(setError);
      return list;
    },
    [lists.length]
  );

  const renameList = useCallback(async (id, name) => {
    requireOnline();
    let updated;
    setLists((current) =>
      current.map((l) => {
        if (l.id !== id) return l;
        updated = { ...l, name };
        return updated;
      })
    );
    if (updated) await api.putList(updated).catch(setError);
  }, []);

  const removeList = useCallback(async (id) => {
    requireOnline();
    setLists((current) => current.filter((l) => l.id !== id));

    // Membership lives on the book, so dropping a collection has to clean up
    // every book that referenced it or they keep a dangling id forever.
    let affected = [];
    setBooks((current) => {
      affected = current
        .filter((b) => b.listIds?.includes(id))
        .map((b) => ({ ...b, listIds: b.listIds.filter((l) => l !== id) }));
      const byId = new Map(affected.map((b) => [b.id, b]));
      return current.map((b) => byId.get(b.id) ?? b);
    });

    await api.deleteList(id).catch(setError);
    await Promise.all(affected.map((b) => api.putBook(b).catch(setError)));
  }, []);

  const setMembership = useCallback(async (bookIds, listId, member) => {
    requireOnline();
    let affected = [];
    setBooks((current) => {
      const ids = new Set(bookIds);
      affected = current
        .filter((b) => ids.has(b.id))
        .map((b) => {
          const listIds = new Set(b.listIds ?? []);
          if (member) listIds.add(listId);
          else listIds.delete(listId);
          return { ...b, listIds: [...listIds] };
        });
      const byId = new Map(affected.map((b) => [b.id, b]));
      return current.map((b) => byId.get(b.id) ?? b);
    });
    await Promise.all(affected.map((b) => api.putBook(b).catch(setError)));
  }, []);

  return {
    books,
    lists,
    coverURLs,
    loading,
    importing,
    error,
    online,
    stale,
    readOnly: !online,
    addBook,
    updateBook,
    removeBooks,
    createList,
    renameList,
    removeList,
    setMembership
  };
}

/** Filter + sort, memoised so the shelf only re-lays-out when inputs change. */
export function useVisibleBooks(books, { listId, query, sortOrder }) {
  return useMemo(
    () => visibleBooks(books, { listId, query, sortOrder }),
    [books, listId, query, sortOrder]
  );
}
