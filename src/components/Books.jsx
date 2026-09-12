import { memo } from 'react';

/**
 * The three books that fall onto the homepage.
 *
 * They replace the four labelled pods. Proportions are a book's rather than the
 * old 120×50 tile's — a landscape box does not read as a book no matter how it
 * is shaded — and the bookshelf's slots are cut to match exactly, so a dragged
 * book and its destination are visibly the same object.
 */
export const BOOK_SIZE = { width: 58, height: 86 };

export const BOOKS = [
  { id: 'red', colour: '#d62828', label: 'Red book' },
  { id: 'green', colour: '#2a9d3f', label: 'Green book' },
  { id: 'blue', colour: '#1c6cff', label: 'Blue book' }
];

/** The cover, spine and page block, shared by the loose books and the shelved ones. */
export function BookFace({ colour }) {
  return (
    <span className="minibook__face" style={{ '--cover': colour }} aria-hidden="true">
      <span className="minibook__spine" />
      <span className="minibook__pages" />
    </span>
  );
}

function Books({ bookRef }) {
  return BOOKS.map((book, index) => (
    <div
      key={book.id}
      className="minibook"
      role="img"
      aria-label={book.label}
      style={{ width: BOOK_SIZE.width, height: BOOK_SIZE.height }}
      ref={(el) => {
        bookRef.current[index] = el;
      }}
    >
      <BookFace colour={book.colour} />
    </div>
  ));
}

export default memo(Books);
