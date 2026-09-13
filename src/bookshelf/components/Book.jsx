import { memo } from 'react';
import { authorLine } from '../model/book.js';

/**
 * Cloth-binding colours for books with no artwork, picked deterministically
 * from the title so a given book always looks the same.
 */
const CLOTH = [
  ['#2ba6de', '#1b7fb4'],
  ['#1d4f7c', '#12324f'],
  ['#8e2b2b', '#611a1a'],
  ['#2f6b46', '#1d472d'],
  ['#6b4a86', '#472f5a'],
  ['#b5651d', '#8a4a12'],
  ['#25666e', '#154046'],
  ['#7a1f3d', '#511128']
];

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function GeneratedCover({ book }) {
  const [c1, c2] = CLOTH[hash(book.title || '') % CLOTH.length];
  const author = book.authors?.[0];
  return (
    <div className="gen-cover" style={{ '--c1': c1, '--c2': c2 }}>
      <div className="gen-grain" />
      <div className="gen-title">{book.title}</div>
      {author && (
        <div className="gen-author">
          <span className="gen-by">By</span>
          {author}
        </div>
      )}
    </div>
  );
}

/**
 * One book standing on a board.
 *
 * The width is not computed: the cover keeps its own aspect, clamped so an
 * unusually square or narrow one still shelves sensibly, and the slot centres
 * whatever comes out. That is why the shelf is not a uniform grid.
 *
 * The binding is deliberately two elements. A bound edge down the left and a
 * single raking highlight across the board is all it takes to read as an
 * object; the hinge crease and page block this replaces were more drawing for
 * something nobody looks at directly.
 */
function Book({ book, coverURL, height, selected, editing, onOpen }) {
  return (
    <button
      type="button"
      className={`book${selected ? ' is-selected' : ''}${editing ? ' is-editable' : ''}`}
      style={{ '--book-h': `${height}px` }}
      onClick={() => onOpen(book)}
      title={`${book.title}${book.authors?.[0] ? ` — ${book.authors[0]}` : ''}`}
      aria-label={`${book.title} by ${authorLine(book)}`}
      aria-pressed={editing ? selected : undefined}
    >
      <span className="book-body">
        {coverURL ? (
          <img
            className="book-img"
            src={coverURL}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <GeneratedCover book={book} />
        )}
        <span className="book-spine" />
        <span className="book-gloss" />
        {book.readStatus === 'read' && (
          <span className="badge-read" title="Read">
            ✓
          </span>
        )}
        {editing && (
          <span className={`selmark${selected ? ' is-on' : ''}`}>
            {selected && (
              <svg width="13" height="11" viewBox="0 0 13 11" aria-hidden="true">
                <path
                  d="M1.4 5.8l3.4 3.5L11.6 1.6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        )}
      </span>
      <span className="book-shadow" />
    </button>
  );
}

export default memo(Book);
