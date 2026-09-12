/** Plain-object book records and the derived values the UI needs. */

export const READ_STATUS = [
  { id: 'unread', label: 'Unread' },
  { id: 'reading', label: 'Reading' },
  { id: 'read', label: 'Read' }
];

const uuid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function makeBook(fields = {}) {
  return {
    id: uuid(),
    title: '',
    subtitle: null,
    authors: [],
    publisher: null,
    publishedDate: null,
    pageCount: null,
    isbn13: null,
    isbn10: null,
    language: null,
    description: null,
    subjects: [],
    /** Where the metadata came from, kept so the detail view can say how much to trust a field. */
    source: 'manual',
    /** Width ÷ height of the cover artwork. Real books are not all the same width. */
    coverAspect: null,
    rating: 0,
    readStatus: 'unread',
    dateAdded: Date.now(),
    /** Manual order on the shelf, used when sorting is "Custom". */
    sortIndex: 0,
    /** Collection ids. A book can sit in several at once. */
    listIds: [],
    ...fields
  };
}

export function makeList(name, sortIndex = 0) {
  return { id: uuid(), name, sortIndex, dateCreated: Date.now() };
}

/** "Ursula K. Le Guin" or "Terry Pratchett & Neil Gaiman". */
export function authorLine(book) {
  const authors = book.authors ?? [];
  if (authors.length === 0) return 'Unknown';
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
  return `${authors[0]} et al.`;
}

/** Sort key that ignores a leading article, the way a librarian would shelve it. */
export function titleSortKey(book) {
  const lower = (book.title ?? '').toLowerCase();
  for (const article of ['the ', 'a ', 'an ']) {
    if (lower.startsWith(article)) return lower.slice(article.length);
  }
  return lower;
}

/** Sort on the last word of the first author, so "Frank Herbert" files under H. */
export function authorSortKey(book) {
  const first = book.authors?.[0];
  if (!first) return 'zzz';
  const parts = first.split(' ');
  return (parts[parts.length - 1] || first).toLowerCase();
}

/** The year alone, from whatever shape the source gave us. */
export function year(book) {
  const match = /\d{4}/.exec(book.publishedDate ?? '');
  return match ? match[0] : null;
}

export const SORT_ORDERS = [
  { id: 'custom', label: 'Custom' },
  { id: 'title', label: 'Title' },
  { id: 'author', label: 'Author' },
  { id: 'recent', label: 'Recently Added' },
  { id: 'pages', label: 'Page Count' },
  { id: 'rating', label: 'Rating' }
];

export function sortBooks(books, order) {
  const out = [...books];
  switch (order) {
    case 'title':
      return out.sort((a, b) => titleSortKey(a).localeCompare(titleSortKey(b)));
    case 'author':
      return out.sort((a, b) => {
        const cmp = authorSortKey(a).localeCompare(authorSortKey(b));
        return cmp !== 0 ? cmp : titleSortKey(a).localeCompare(titleSortKey(b));
      });
    case 'recent':
      return out.sort((a, b) => b.dateAdded - a.dateAdded);
    case 'pages':
      return out.sort((a, b) => (b.pageCount ?? 0) - (a.pageCount ?? 0));
    case 'rating':
      return out.sort((a, b) =>
        b.rating === a.rating ? titleSortKey(a).localeCompare(titleSortKey(b)) : b.rating - a.rating
      );
    case 'custom':
    default:
      return out.sort((a, b) => a.sortIndex - b.sortIndex);
  }
}

/** Applies the current collection filter, search text and sort order. */
export function visibleBooks(all, { listId, query, sortOrder }) {
  let books = all;
  if (listId) books = books.filter((b) => b.listIds?.includes(listId));

  const q = (query ?? '').trim().toLowerCase();
  if (q) {
    books = books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) || (b.authors ?? []).join(' ').toLowerCase().includes(q)
    );
  }
  return sortBooks(books, sortOrder);
}
