/**
 * Works out how many books fit and how big they should be, given the space
 * available.
 *
 * Kept apart from the views so the same numbers drive layout, paging and the
 * page dots without any of them re-deriving it slightly differently.
 */

export const METRICS = {
  /** Thickness of a shelf board, including its rounded front edge. */
  boardThickness: 20,
  /** Gap between the top of a book and the board above it. */
  headroom: 16,
  /**
   * The widest cover aspect (width ÷ height) a slot must accommodate without
   * clipping. Trade paperbacks sit near 0.65; art and film tie-in editions run
   * wider, so the slot is sized for the worst case.
   */
  widestCoverAspect: 0.78,
  minZoom: 0.68,
  maxZoom: 1.9,
  /** Shortest a shelf opening is allowed to get before we drop a row. */
  minRowHeight: 150,
  maxRowHeight: 260
};

export const clampZoom = (z) => Math.min(Math.max(z, METRICS.minZoom), METRICS.maxZoom);

export function shelfLayout({ width, height, compact, zoom = 1 }) {
  const w = Math.max(width, 200);
  const h = Math.max(height, 200);
  const z = clampZoom(zoom);

  // Height first. The shelf opening is what sets how tall a book can be, and
  // everything else follows from that — including how many books fit across,
  // which is why zooming the row height is enough to drive the whole layout.
  const minRow = METRICS.minRowHeight * z;
  const maxRow = METRICS.maxRowHeight * z;
  const target = (minRow + maxRow) / 2;

  let rows = Math.max(1, Math.round(h / target));
  let rowHeight = h / rows;

  // If that left the openings too tall or short, step the row count.
  if (rowHeight > maxRow && rows < 8) {
    rows += 1;
    rowHeight = h / rows;
  } else if (rowHeight < minRow && rows > 1) {
    rows -= 1;
    rowHeight = h / rows;
  }

  const bookHeight = Math.max(44, rowHeight - METRICS.boardThickness - METRICS.headroom);

  // Columns are derived from the book height, not chosen independently. Picking
  // a column count first made slots narrower than the tallest allowed book, so
  // wide covers had their edges clipped off — titles losing their last letter.
  const sideMargin = compact ? 6 : 12;
  const usable = w - sideMargin * 2;
  const widestBook = bookHeight * METRICS.widestCoverAspect;
  const slotNeeded = widestBook * (compact ? 1.06 : 1.16); // book plus its gap
  const columns = Math.max(compact ? 2 : 3, Math.floor(usable / slotNeeded));
  const slotWidth = usable / columns;

  return {
    rows,
    columns,
    rowHeight,
    bookHeight,
    slotWidth,
    bookMaxWidth: slotWidth * 0.9,
    sideMargin,
    perPage: rows * columns
  };
}

/**
 * How wide this book should stand, given how tall the shelf lets it be.
 * Clamped so an unusually square or narrow cover still shelves sensibly.
 */
export function shelfWidth(book, bookHeight, maxWidth) {
  const aspect = book.coverAspect ?? 0.645; // a typical trade paperback
  const natural = bookHeight * Math.min(Math.max(aspect, 0.48), METRICS.widestCoverAspect);
  return Math.min(natural, maxWidth);
}

export function chunk(items, size) {
  if (size <= 0 || !items.length) return [];
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
