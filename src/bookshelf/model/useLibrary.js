import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as db from './db.js';
import { makeBook, makeList, visibleBooks } from './book.js';
import { saveCover } from './covers.js';

/**
 * The library and everything that mutates it.
 *
 * State is held in React and written through to IndexedDB, rather than re-read
 * from it after every change: the store is the source of truth on disk, but a
 * round trip per keystroke in the detail editor would be felt.
 */
export default function useLibrary() {
  const [books, setBooks] = useState([]);
  const [lists, setLists] = useState([]);
  const [coverURLs, setCoverURLs] = useState(() => new Map());
  const [loading, setLoading] = useState(true);

  // Object URLs must be revoked or the blobs stay resident for the life of the
  // document; this holds the ones currently handed out.
  const urlsRef = useRef(new Map());

  const setCover = useCallback((bookId, blob) => {
    const previous = urlsRef.current.get(bookId);
    if (previous) URL.revokeObjectURL(previous);
    const url = URL.createObjectURL(blob);
    urlsRef.current.set(bookId, url);
    setCoverURLs(new Map(urlsRef.current));
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [loadedBooks, loadedLists, covers] = await Promise.all([
          db.allBooks(),
          db.allLists(),
          db.allCovers()
        ]);
        if (cancelled) return;

        for (const [id, blob] of covers) urlsRef.current.set(id, URL.createObjectURL(blob));
        setBooks(loadedBooks);
        setLists(loadedLists);
        setCoverURLs(new Map(urlsRef.current));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const urls = urlsRef.current;
    return () => {
      cancelled = true;
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  // MARK: Books

  const addBook = useCallback(
    async (result) => {
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

      // The book goes on the shelf immediately with a cloth stand-in; the cover
      // arrives a moment later rather than holding up the whole add.
      setBooks((current) => [...current, book]);
      await db.putBook(book);

      if (result.coverURL) {
        const aspect = await saveCover(book.id, result.coverURL).catch(() => null);
        if (aspect) {
          const withCover = { ...book, coverAspect: aspect };
          await db.putBook(withCover);
          setBooks((current) => current.map((b) => (b.id === book.id ? withCover : b)));
          const blob = await db.getCover(book.id);
          if (blob) setCover(book.id, blob);
        }
      }

      return book;
    },
    [setCover]
  );

  const updateBook = useCallback(async (id, changes) => {
    let updated;
    setBooks((current) =>
      current.map((b) => {
        if (b.id !== id) return b;
        updated = { ...b, ...changes };
        return updated;
      })
    );
    if (updated) await db.putBook(updated);
  }, []);

  const removeBooks = useCallback(async (ids) => {
    const set = new Set(ids);
    setBooks((current) => current.filter((b) => !set.has(b.id)));
    for (const id of ids) {
      const url = urlsRef.current.get(id);
      if (url) {
        URL.revokeObjectURL(url);
        urlsRef.current.delete(id);
      }
    }
    setCoverURLs(new Map(urlsRef.current));
    await db.deleteBooks([...set]);
  }, []);

  const replaceCover = useCallback(
    async (bookId, url) => {
      const aspect = await saveCover(bookId, url);
      if (!aspect) return false;
      await updateBook(bookId, { coverAspect: aspect });
      const blob = await db.getCover(bookId);
      if (blob) setCover(bookId, blob);
      return true;
    },
    [setCover, updateBook]
  );

  // MARK: Collections

  const createList = useCallback(
    async (name) => {
      const list = makeList(name, lists.length);
      setLists((current) => [...current, list]);
      await db.putList(list);
      return list;
    },
    [lists.length]
  );

  const renameList = useCallback(async (id, name) => {
    let updated;
    setLists((current) =>
      current.map((l) => {
        if (l.id !== id) return l;
        updated = { ...l, name };
        return updated;
      })
    );
    if (updated) await db.putList(updated);
  }, []);

  const removeList = useCallback(async (id) => {
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
    await db.deleteList(id);
    if (affected.length) await db.putBooks(affected);
  }, []);

  const setMembership = useCallback(async (bookIds, listId, member) => {
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
    if (affected.length) await db.putBooks(affected);
  }, []);

  return {
    books,
    lists,
    coverURLs,
    loading,
    addBook,
    updateBook,
    removeBooks,
    replaceCover,
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
