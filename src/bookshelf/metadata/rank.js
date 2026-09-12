import { isEnglishISBN, normalise, tokens } from './text.js';

/** Titles of books about a book rather than the book. */
const NOISE_WORDS = new Set([
  'study',
  'guide',
  'summary',
  'analysis',
  'companion',
  'criticism',
  'sparknotes',
  'bookrags',
  'supersummary',
  'notes',
  'notebooks',
  'handbook',
  'workbook',
  'quicklet',
  'unofficial',
  'conversation',
  'starters',
  'revisioned',
  'rereading',
  'approaches'
]);

/** Titles of bundles rather than a single book. */
const OMNIBUS_WORDS = new Set([
  'collection',
  'omnibus',
  'boxed',
  'box',
  'saga',
  'anthology',
  'bundle',
  'series',
  'volumes'
]);

const VOLUME_PATTERN = /\b(books?|vols?|volume) ?\d/;

const intersectionSize = (a, b) => {
  let n = 0;
  for (const value of a) if (b.has(value)) n++;
  return n;
};

/**
 * Orders results so the novel beats both the study guide about the novel and the
 * eight-book box set that contains it.
 *
 * The naive signal — how many query words appear in the title — actively
 * misleads. A query like "dune frank herbert" mixes title words with author
 * words, so demanding all of them in the title rewards *Frank Herbert's Dune
 * Saga Collection* over *Dune*. The fix is to let the author name satisfy the
 * author part of the query, and judge the title only on what is left over.
 */
export function rank(results, query) {
  const queryTokens = tokens(query);
  if (!queryTokens.size) return results;

  const score = (result) => {
    const titleTokens = tokens(result.title);
    const authorTokens = tokens((result.authors ?? []).join(' '));
    const either = new Set([...titleTokens, ...authorTokens]);

    // How much of the query this result accounts for at all, by either field.
    const coverage = intersectionSize(queryTokens, either) / queryTokens.size;

    // The part of the query that is not the author's name is what should be
    // naming the title.
    const residual = new Set([...queryTokens].filter((t) => !authorTokens.has(t)));
    const residualHit = residual.size ? intersectionSize(residual, titleTokens) / residual.size : 1;

    // Credit for the query's author words actually appearing in the author
    // field. Without this, a critical essay whose title repeats the author's
    // name scores exactly as well as the novel.
    const authorHit = intersectionSize(queryTokens, authorTokens) / queryTokens.size;

    let s = coverage * 4 + residualHit * 2.5 + authorHit * 1.5;

    // An exact title is almost always the thing you meant.
    if (normalise(result.title) === normalise(query)) s += 2.5;
    if (
      residual.size === titleTokens.size &&
      intersectionSize(residual, titleTokens) === titleTokens.size
    ) {
      s += 1.5;
    }

    // Books about books, and bundles of books.
    if (intersectionSize(titleTokens, NOISE_WORDS)) s -= 4;
    if (intersectionSize(titleTokens, OMNIBUS_WORDS)) s -= 2;
    if (VOLUME_PATTERN.test(normalise(result.title))) s -= 2;

    // Padding beyond what the query asked for costs a little each word, which
    // separates "Dune" from "The Road to Dune" without banning either.
    let extra = 0;
    for (const t of titleTokens) if (!queryTokens.has(t)) extra++;
    s -= Math.min(extra * 0.14, 1.8);

    // A pamphlet-length result for a novel query is a study guide in disguise.
    if (result.pageCount != null && result.pageCount < 80) s -= 1.5;

    // Prefer entries we can actually display.
    if (result.coverURL) s += 0.4;
    if (result.pageCount != null) s += 0.2;
    // Prefer an English edition when one is on offer.
    if (isEnglishISBN(result.isbn13)) s += 0.5;

    return s;
  };

  // Scored up front, and ties broken by original position so the order is stable.
  return results
    .map((result, index) => ({ result, index, score: score(result) }))
    .sort((a, b) => (a.score === b.score ? a.index - b.index : b.score - a.score))
    .map((entry) => entry.result);
}
