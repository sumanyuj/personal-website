/**
 * The library as it was stored before there were accounts.
 *
 * Everything used to live in IndexedDB on whichever device added it. That data
 * is still sitting there, so the first sign-in on such a device offers to move
 * it up rather than quietly leaving a shelf of books behind.
 *
 * Read-only, and deliberately tolerant: a store that no longer exists, or a
 * database that will not open at all, just means there is nothing to import.
 */

const DB_NAME = 'bookshelf';

function openLegacy() {
  return new Promise((resolve) => {
    let request;
    try {
      // No version: opening at the existing one avoids triggering an upgrade,
      // and a database that was never created resolves to an empty one we then
      // ignore.
      request = indexedDB.open(DB_NAME);
    } catch {
      return resolve(null);
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

const readAll = (db, store) =>
  new Promise((resolve) => {
    if (!db.objectStoreNames.contains(store)) return resolve([]);
    try {
      const tx = db.transaction(store, 'readonly');
      const entries = [];
      const cursor = tx.objectStore(store).openCursor();
      cursor.onsuccess = () => {
        const at = cursor.result;
        if (!at) return;
        entries.push({ key: at.key, value: at.value });
        at.continue();
      };
      tx.oncomplete = () => resolve(entries);
      tx.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });

/** Everything worth moving, or null when there is nothing there. */
export async function readLegacyLibrary() {
  const db = await openLegacy();
  if (!db) return null;

  try {
    const [books, lists, covers, thumbs] = await Promise.all([
      readAll(db, 'books'),
      readAll(db, 'lists'),
      readAll(db, 'covers'),
      readAll(db, 'thumbs')
    ]);

    if (!books.length) return null;

    return {
      books: books.map((b) => b.value),
      lists: lists.map((l) => l.value),
      covers: new Map(covers.map((c) => [c.key, c.value])),
      thumbs: new Map(thumbs.map((t) => [t.key, t.value]))
    };
  } finally {
    db.close();
  }
}

/** Called once the contents are safely on the server. */
export function discardLegacyLibrary() {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}
