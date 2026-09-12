/**
 * The library, stored in the browser.
 *
 * IndexedDB stands in for SwiftData: it is the only browser store that holds
 * binary blobs without base64 inflation, which matters because cover art is by
 * far the largest thing here. Covers live in their own object store rather than
 * on the book record, so listing the library never deserialises megabytes of
 * image data — the same reason the native app marks `coverData` as external
 * storage.
 *
 * Written against raw IndexedDB rather than a wrapper library: the whole surface
 * used here is six calls, and a dependency would cost more bytes than it saves.
 */

const DB_NAME = 'bookshelf';
const DB_VERSION = 1;

export const STORE = {
  books: 'books',
  lists: 'lists',
  covers: 'covers',
  textures: 'textures'
};

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE.books)) {
        const books = db.createObjectStore(STORE.books, { keyPath: 'id' });
        books.createIndex('sortIndex', 'sortIndex');
        books.createIndex('dateAdded', 'dateAdded');
      }
      if (!db.objectStoreNames.contains(STORE.lists)) {
        db.createObjectStore(STORE.lists, { keyPath: 'id' }).createIndex('sortIndex', 'sortIndex');
      }
      // Keyed by book id; the value is a Blob.
      if (!db.objectStoreNames.contains(STORE.covers)) db.createObjectStore(STORE.covers);
      // Generated wood, so it is rendered once per browser rather than per load.
      if (!db.objectStoreNames.contains(STORE.textures)) db.createObjectStore(STORE.textures);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    // A second tab running a newer version would otherwise block forever.
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
  });

  return dbPromise;
}

function run(storeNames, mode, work) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeNames, mode);
        let result;
        // Resolve on transaction completion, not on request success: the write is
        // not durable until the transaction commits.
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        result = work(
          Array.isArray(storeNames)
            ? Object.fromEntries(storeNames.map((n) => [n, tx.objectStore(n)]))
            : tx.objectStore(storeNames)
        );
      })
  );
}

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

// MARK: - Books

export async function allBooks() {
  const books = await run(STORE.books, 'readonly', (store) => request(store.getAll()));
  return (books ?? []).sort((a, b) => a.sortIndex - b.sortIndex);
}

export function putBook(book) {
  return run(STORE.books, 'readwrite', (store) => {
    store.put(book);
    return book;
  });
}

export function putBooks(books) {
  return run(STORE.books, 'readwrite', (store) => {
    for (const book of books) store.put(book);
    return books;
  });
}

export function deleteBooks(ids) {
  return run([STORE.books, STORE.covers], 'readwrite', ({ books, covers }) => {
    for (const id of ids) {
      books.delete(id);
      covers.delete(id);
    }
  });
}

// MARK: - Collections

export async function allLists() {
  const lists = await run(STORE.lists, 'readonly', (store) => request(store.getAll()));
  return (lists ?? []).sort((a, b) => a.sortIndex - b.sortIndex);
}

export function putList(list) {
  return run(STORE.lists, 'readwrite', (store) => {
    store.put(list);
    return list;
  });
}

export function deleteList(id) {
  return run(STORE.lists, 'readwrite', (store) => store.delete(id));
}

// MARK: - Covers

export function getCover(bookId) {
  return run(STORE.covers, 'readonly', (store) => request(store.get(bookId)));
}

export function putCover(bookId, blob) {
  return run(STORE.covers, 'readwrite', (store) => store.put(blob, bookId));
}

/** Every cover at once, as a Map, so first paint issues one transaction. */
export async function allCovers() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE.covers, 'readonly');
    const covers = new Map();
    const cursorRequest = tx.objectStore(STORE.covers).openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      covers.set(cursor.key, cursor.value);
      cursor.continue();
    };
    tx.oncomplete = () => resolve(covers);
    tx.onerror = () => reject(tx.error);
  });
}

// MARK: - Generated textures

export function getTexture(key) {
  return run(STORE.textures, 'readonly', (store) => request(store.get(key)));
}

export function putTexture(key, blob) {
  return run(STORE.textures, 'readwrite', (store) => store.put(blob, key));
}

// MARK: - Export / import

export async function exportLibrary() {
  const [books, lists] = await Promise.all([allBooks(), allLists()]);
  return { version: 1, exportedAt: new Date().toISOString(), books, lists };
}
