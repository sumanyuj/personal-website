import { memo, useEffect, useRef } from 'react';
import Book from './Book.jsx';
import { WOOD } from '../design/wood.js';
import { chunk } from '../model/layout.js';

/** The back panel, its plank seams, and the light falling off toward the case edges. */
export function BackPanel() {
  return (
    <>
      <div
        className="stage-wood"
        aria-hidden="true"
        style={{
          backgroundImage: `url(${WOOD.panel.url})`,
          backgroundSize: `${WOOD.panel.tile}px`
        }}
      />
      {/* Its own layer rather than a pseudo-element on the panel, so it can sit
          between the wood and the shelves: the case darkens toward its edges,
          the books standing in front of it do not. */}
      <div className="stage-vignette" aria-hidden="true" />
    </>
  );
}

/**
 * A shelf board: a lit top surface rolling into a shadowed front edge, with the
 * shadow it throws onto the panel below carried by a strip beneath it.
 */
export const ShelfBoard = memo(function ShelfBoard() {
  return (
    <div className="shelf-board" aria-hidden="true">
      <div
        className="board-face"
        style={{
          backgroundImage: `linear-gradient(
            180deg,
            rgba(255, 252, 242, 0.62) 0%,
            rgba(255, 250, 236, 0.46) 11%,
            rgba(255, 255, 255, 0.1) 15%,
            rgba(255, 255, 255, 0.02) 30%,
            rgba(0, 0, 0, 0.1) 62%,
            rgba(0, 0, 0, 0.3) 88%,
            rgba(0, 0, 0, 0.46) 100%
          ), url(${WOOD.board.url})`,
          backgroundSize: `auto, ${WOOD.board.tile}px`
        }}
      />
      <div className="board-lip" />
    </div>
  );
});

/** One row of books standing in a recess, with the board they stand on below. */
const ShelfRow = memo(function ShelfRow({ books, layout, coverURLs, selection, editing, onOpen }) {
  return (
    <div className="shelf" style={{ minHeight: layout.rowHeight }}>
      <div className="shelf-recess">
        <div className="shelf-books">
          {books.map((book) => (
            <div
              key={book.id}
              className="slot"
              style={{ width: layout.slotWidth, flex: `0 0 ${layout.slotWidth}px` }}
            >
              <Book
                book={book}
                coverURL={coverURLs.get(book.id)}
                height={layout.bookHeight}
                selected={selection.has(book.id)}
                editing={editing}
                onOpen={onOpen}
              />
            </div>
          ))}
        </div>
      </div>
      <ShelfBoard />
    </div>
  );
});

/**
 * The case: rows of books on boards, paged sideways on roomy screens and
 * scrolled vertically on a phone — paging a 3-wide shelf would mean a lot of
 * pages.
 */
function Shelf({
  books,
  layout,
  compact,
  coverURLs,
  selection,
  editing,
  onOpen,
  page,
  onPageChange
}) {
  const pagesRef = useRef(null);
  const rows = (items) => chunk(items, layout.columns);
  const pages = compact ? [books] : chunk(books, layout.perPage);

  // Keep the scroller in step when the page is changed from the dots rather
  // than by swiping.
  useEffect(() => {
    const el = pagesRef.current;
    if (!el || compact) return;
    const target = page * el.clientWidth;
    if (Math.abs(el.scrollLeft - target) > 4) el.scrollTo({ left: target, behavior: 'smooth' });
  }, [page, compact]);

  const rowProps = { layout, coverURLs, selection, editing, onOpen };

  if (compact) {
    return (
      <div className="shelves case__scroll">
        {rows(books).map((row, i) => (
          <ShelfRow key={i} books={row} {...rowProps} />
        ))}
      </div>
    );
  }

  return (
    <div
      className="case__pages"
      ref={pagesRef}
      onScroll={(event) => {
        const el = event.currentTarget;
        const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
        if (next !== page) onPageChange(next);
      }}
    >
      {pages.map((pageBooks, index) => {
        const pageRows = rows(pageBooks);
        return (
          <div className="case__page shelves" key={index}>
            {pageRows.map((row, i) => (
              <ShelfRow key={i} books={row} {...rowProps} />
            ))}
            {/* Pad a short final page so its boards stay put. */}
            {Array.from({ length: Math.max(0, layout.rows - pageRows.length) }, (_, i) => (
              <ShelfRow key={`pad-${i}`} books={[]} {...rowProps} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default memo(Shelf);
