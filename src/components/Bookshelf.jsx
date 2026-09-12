import { forwardRef, memo } from 'react';
import { BOOKS, BOOK_SIZE, BookFace } from './Books.jsx';

/**
 * The way into the bookshelf app.
 *
 * Appears only once every letter of the heading has been knocked loose, then
 * offers two ways through: click it, or drag the three books into its slots —
 * the third one shelved opens the app on its own.
 */
const Bookshelf = forwardRef(function Bookshelf(
  { visible, shelved, armedSlot, onEnter, slotRef },
  ref
) {
  const filled = shelved.filter((s) => s !== null).length;

  return (
    <div
      ref={ref}
      className={`shelf-target${visible ? ' shelf-target--visible' : ''}`}
      aria-hidden={visible ? undefined : true}
    >
      <button
        type="button"
        className="shelf-target__button"
        onClick={onEnter}
        tabIndex={visible ? 0 : -1}
        aria-label={`Open the bookshelf${filled ? ` — ${filled} of 3 books shelved` : ''}`}
      >
        <span className="shelf-target__case">
          <span className="shelf-target__slots">
            {BOOKS.map((_, slot) => {
              const bookIndex = shelved.indexOf(slot);
              return (
                <span
                  key={slot}
                  className={`shelf-target__slot${armedSlot === slot ? ' shelf-target__slot--armed' : ''}`}
                  style={{ width: BOOK_SIZE.width * 0.62, height: BOOK_SIZE.height * 0.62 }}
                  ref={(el) => {
                    slotRef.current[slot] = el;
                  }}
                >
                  {bookIndex !== -1 && (
                    <span className="shelf-target__book">
                      <BookFace colour={BOOKS[bookIndex].colour} />
                    </span>
                  )}
                </span>
              );
            })}
          </span>
          <span className="shelf-target__board" />
        </span>
        <span className="shelf-target__caption">Bookshelf</span>
      </button>
    </div>
  );
});

export default memo(Bookshelf);
