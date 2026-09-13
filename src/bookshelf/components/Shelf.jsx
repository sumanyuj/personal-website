import { memo, useEffect, useRef, useState } from 'react';
import Book from './Book.jsx';
import { WOOD, woodTileURL } from '../design/wood.js';
import { METRICS, chunk, shelfWidth } from '../model/layout.js';

/** Resolves a generated wood tile to a background-image, once per surface. */
function useWoodTile({ vertical, seed, tile, grade }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let resolved = null;
    Promise.resolve(woodTileURL(vertical, seed, tile, grade)).then((value) => {
      if (cancelled) {
        // The URL is shared via the module-level cache, so it is not revoked
        // here — a second mount would be left with a dead reference.
        return;
      }
      resolved = value;
      setUrl(value);
    });
    return () => {
      cancelled = true;
      void resolved;
    };
  }, [vertical, seed, tile, grade]);

  return url;
}

export function BackPanel() {
  const url = useWoodTile(WOOD.panel);
  return (
    <div
      className="case__panel"
      aria-hidden="true"
      // Tile size comes from the same constant the texture was generated for,
      // rather than being repeated in the stylesheet where the two drift apart.
      style={{
        backgroundSize: `${WOOD.panel.tile}px ${WOOD.panel.tile}px`,
        ...(url ? { backgroundImage: `url(${url})` } : null)
      }}
    />
  );
}

/**
 * The two upright sides of the case.
 *
 * Real geometry rather than a shadow painted at the edges: they carry the same
 * vertical grain as the back panel, they are lit down their front arris, and
 * they sit above the boards so the shelves visibly run into them the way the
 * shelves of an actual bookcase do.
 */
export function CaseSides() {
  const url = useWoodTile(WOOD.panel);
  const style = {
    backgroundSize: `${WOOD.panel.tile}px ${WOOD.panel.tile}px`,
    ...(url ? { backgroundImage: `url(${url})` } : null)
  };
  return (
    <>
      <span className="case__side case__side--left" aria-hidden="true" style={style} />
      <span className="case__side case__side--right" aria-hidden="true" style={style} />
    </>
  );
}

export const ShelfBoard = memo(function ShelfBoard({ tileURL }) {
  return (
    <div
      className="board"
      aria-hidden="true"
      style={{
        backgroundSize: `${WOOD.board.tile}px ${WOOD.board.tile}px`,
        ...(tileURL ? { backgroundImage: `url(${tileURL})` } : null)
      }}
    />
  );
});

/** One row of books plus the board they stand on. */
const ShelfRow = memo(function ShelfRow({
  books,
  layout,
  coverURLs,
  selection,
  editing,
  onOpen,
  tileURL
}) {
  return (
    <div className="shelf-row" style={{ height: layout.rowHeight }}>
      <div
        className="shelf-row__books"
        style={{
          height: layout.rowHeight - METRICS.boardThickness,
          paddingInline: layout.sideMargin
        }}
      >
        {books.map((book) => (
          <div key={book.id} className="shelf-row__slot" style={{ width: layout.slotWidth }}>
            <Book
              book={book}
              coverURL={coverURLs.get(book.id)}
              width={shelfWidth(book, layout.bookHeight, layout.bookMaxWidth)}
              height={layout.bookHeight}
              selected={selection.has(book.id)}
              editing={editing}
              onOpen={onOpen}
            />
          </div>
        ))}
      </div>
      <ShelfBoard tileURL={tileURL} />
    </div>
  );
});

/**
 * The whole bookcase: rows of books on boards, paged sideways on roomy screens
 * and scrolled vertically on a phone — paging a 3-wide shelf would mean a lot of
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
  const tileURL = useWoodTile(WOOD.board);
  const pagesRef = useRef(null);

  const rows = (items) => chunk(items, layout.columns);
  const pages = compact ? [books] : chunk(books, layout.perPage);

  // Keep the scroller in step when the page is changed from the dots rather than
  // by swiping.
  useEffect(() => {
    const el = pagesRef.current;
    if (!el || compact) return;
    const target = page * el.clientWidth;
    if (Math.abs(el.scrollLeft - target) > 4) el.scrollTo({ left: target, behavior: 'smooth' });
  }, [page, compact]);

  const rowProps = { layout, coverURLs, selection, editing, onOpen, tileURL };

  if (compact) {
    return (
      <div className="case__scroll">
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
          <div className="case__page" key={index}>
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
