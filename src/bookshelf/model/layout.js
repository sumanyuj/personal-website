/**
 * Works out how many books fit and how big they should be, given the space
 * available.
 *
 * Kept apart from the views so the same numbers drive layout, paging and the
 * page dots without any of them re-deriving it slightly differently.
 */

export const METRICS = {
  /** Thickness of a shelf board, including its front edge. Matches .shelf-board. */
  boardThickness: 32,
  /** Clearance between a book's top and the board above it. */
  headroom: 26,
  minZoom: 0.68,
  maxZoom: 1.9,
  /** Smallest usable shelf opening, board included. */
  minRowHeight: 248,
  /** Bounds on how tall a book may stand, whatever the opening allows. */
  minBookHeight: 140,
  maxBookHeight: 268,
  /** Slot width as a fraction of book height. */
  slotRatio: 0.8,
  /** Horizontal padding on the case, matching .shelves. */
  sidePadding: 24,
  /** The same, on a phone, where 24 either side is a sixth of the screen. */
  compactSidePadding: 10,
  /** How tall a book stands on a phone at zoom 1. */
  compactBookHeight: 210
};

export const clampZoom = (z) => Math.min(Math.max(z, METRICS.minZoom), METRICS.maxZoom);

export function shelfLayout({ width, height, compact, zoom = 1 }) {
  const z = clampZoom(zoom);
  const sidePadding = compact ? METRICS.compactSidePadding : METRICS.sidePadding;
  const usableWidth = Math.max(width - sidePadding * 2 - 8, 160);
  const usableHeight = Math.max(height - 8, 160);

  const minColumns = compact ? 2 : 1;

  /*
   * Width can be the binding constraint, and on a phone it usually is: a book
   * tall enough to fill the opening is too wide for two to fit across 375
   * points. Capping the height by the width the slots have to share is what
   * stops the row overflowing and the second book being sliced off.
   */
  const widthCap = usableWidth / minColumns / METRICS.slotRatio;

  let rows;
  let rowHeight;
  let bookHeight;

  if (compact) {
    // Phones scroll, so the opening is sized from the book rather than
    // stretched to fill the screen. Dividing the viewport into rows here gives
    // one enormous shelf and puts the rest below the fold.
    bookHeight = Math.round(
      Math.min(
        METRICS.maxBookHeight * z,
        widthCap,
        Math.max(METRICS.minBookHeight, METRICS.compactBookHeight * z)
      )
    );
    rowHeight = bookHeight + METRICS.boardThickness + METRICS.headroom;
    rows = Math.max(1, Math.floor(usableHeight / rowHeight));
  } else {
    // Roomy screens page, so the rows divide the height exactly and the last
    // board sits on the bottom edge rather than leaving a bare strip.
    const minRow = METRICS.minRowHeight * z;
    rows = Math.max(1, Math.floor(usableHeight / minRow));
    rowHeight = usableHeight / rows;
    bookHeight = Math.round(
      Math.min(
        METRICS.maxBookHeight * z,
        widthCap,
        Math.max(METRICS.minBookHeight, rowHeight - METRICS.boardThickness - METRICS.headroom)
      )
    );
  }

  const slotWidth = Math.max(48, Math.round(bookHeight * METRICS.slotRatio));
  // widthCap guarantees minColumns slots fit, so this can never overflow.
  const columns = Math.max(minColumns, Math.floor(usableWidth / slotWidth));

  return {
    rows,
    columns,
    rowHeight,
    bookHeight,
    slotWidth,
    // Returned rather than set in CSS: the padding and the width the columns
    // were fitted into have to be the same number, and a media query breakpoint
    // that drifts from the compact threshold puts them quietly out of step.
    sidePadding,
    perPage: rows * columns
  };
}

export function chunk(items, size) {
  if (size <= 0 || !items.length) return [];
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
