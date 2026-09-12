import { memo } from 'react';
import { authorLine } from '../model/book.js';

/**
 * Stable hash for the placeholder colour, so the same book always looks the
 * same. String hashing rather than anything seeded per session.
 */
function hue(title) {
  let h = 5381;
  for (let i = 0; i < title.length; i++) h = (h * 33 + title.charCodeAt(i)) % 0xffffffff;
  return h % 360;
}

function Placeholder({ book, height }) {
  return (
    <div
      className="book__placeholder"
      style={{
        '--hue': hue(book.title),
        '--title-size': `${Math.max(9, height * 0.082)}px`,
        '--author-size': `${Math.max(7, height * 0.055)}px`
      }}
    >
      <span className="book__placeholder-title">{book.title}</span>
      <span className="book__placeholder-rule" />
      <span className="book__placeholder-author">{authorLine(book)}</span>
    </div>
  );
}

/**
 * One book standing on a board: cover, binding, page edge, and the shadows that
 * make it sit on the wood rather than float above it.
 */
function Book({ book, coverURL, width, height, selected, editing, onOpen }) {
  return (
    <div
      className={`book${selected ? ' book--selected' : ''}`}
      style={{
        width,
        height,
        // Driven off the book's own width so the binding stays proportionate at
        // every zoom level, exactly as the native app derives it.
        '--band': `${Math.max(3, width * 0.075)}px`,
        '--pages': `${Math.max(1.5, width * 0.024)}px`,
        '--fore-radius': `${Math.max(1.5, width * 0.03)}px`
      }}
      role="button"
      tabIndex={0}
      aria-label={`${book.title} by ${authorLine(book)}`}
      aria-pressed={editing ? selected : undefined}
      onClick={() => onOpen(book)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(book);
        }
      }}
    >
      <span className="book__contact" aria-hidden="true" />
      <div className="book__stack">
        {coverURL ? (
          <img className="book__cover" src={coverURL} alt="" loading="lazy" decoding="async" />
        ) : (
          <Placeholder book={book} height={height} />
        )}
        <span className="book__binding" aria-hidden="true" />
      </div>
      {editing && (
        <span className={`book__badge${selected ? ' book__badge--on' : ''}`} aria-hidden="true">
          {selected && (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 6.5 4.8 9.2 10 3.4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      )}
    </div>
  );
}

export default memo(Book);
