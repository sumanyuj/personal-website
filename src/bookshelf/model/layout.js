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
  sidePadding: 24
};

export const clampZoom = (z) => Math.min(Math.max(z, METRICS.minZoom), METRICS.maxZoom);

export function shelfLayout({ width, height, compact, zoom = 1 }) {
  const z = clampZoom(zoom);
  const usableWidth = Math.max(width - METRICS.sidePadding * 2 - 8, 160);
  const usableHeight = Math.max(height - 8, 160);

  // Rows first, from the smallest opening that is still worth looking at. Zoom
  // scales that threshold, which is enough to drive the whole layout: book
  // height follows from the opening, and column count follows from book height.
  const minRow = METRICS.minRowHeight * z;
  const rows = Math.max(1, Math.floor(usableHeight / minRow));
  const rowHeight = usableHeight / rows;

  // Fill the opening rather than leaving a bare strip of wood above the books.
  const bookHeight = Math.round(
    Math.min(
      METRICS.maxBookHeight * z,
      Math.max(METRICS.minBookHeight, rowHeight - METRICS.boardThickness - METRICS.headroom)
    )
  );

  const slotWidth = Math.round(bookHeight * METRICS.slotRatio);
  const columns = Math.max(compact ? 2 : 1, Math.floor(usableWidth / slotWidth));

  return {
    rows,
    columns,
    rowHeight,
    bookHeight,
    slotWidth,
    perPage: rows * columns
  };
}

export function chunk(items, size) {
  if (size <= 0 || !items.length) return [];
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
