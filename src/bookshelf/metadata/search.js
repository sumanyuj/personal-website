import { rank } from './rank.js';
import {
  isEnglishISBN,
  isbnFromArtwork,
  masterArtwork,
  normalise,
  splitAuthors,
  stripHTML,
  thumbArtwork,
  titlesAgree
} from './text.js';

/**
 * Book lookup against Apple Books and Open Library.
 *
 * The division of labour, learned the hard way in the native app: Apple has fast
 * responses, clean edition-level author lists and by far the best cover art;
 * Open Library has page counts, publishers and first-publication years. Neither
 * is trustworthy alone.
 *
 * Both hosts send permissive CORS headers, so this runs entirely in the browser
 * and the site stays a static deployment with no proxy to operate.
 */

// MARK: - Circuit breaker

/**
 * One search fans out to a search call plus up to thirty edition lookups. When a
 * host is down — Open Library goes down, and refuses connections outright when
 * it does — retrying each of those turns a one-second search into a minute of
 * guaranteed failure. After a few consecutive failures we stop calling that host
 * at all for a cooldown, and the app quietly serves whatever the healthy source
 * can give.
 */
const breakers = new Map();
const COOLDOWN_MS = 60_000;
const FAILURES_BEFORE_OPEN = 3;

function isOpen(host) {
  const breaker = breakers.get(host);
  if (!breaker?.openedAt) return false;
  // Reclose after a minute so a brief outage doesn't disable the source for the
  // rest of the session.
  return Date.now() - breaker.openedAt < COOLDOWN_MS;
}

function recordSuccess(host) {
  breakers.set(host, { failures: 0, openedAt: null });
}

function recordFailure(host) {
  const breaker = breakers.get(host) ?? { failures: 0, openedAt: null };
  breaker.failures += 1;
  if (breaker.failures >= FAILURES_BEFORE_OPEN) breaker.openedAt = Date.now();
  breakers.set(host, breaker);
}

const REQUEST_TIMEOUT_MS = 12_000;

/** GET + JSON, with backoff and a per-host breaker. */
async function getJSON(url, { signal, attempts = 3 } = {}) {
  const host = new URL(url).host;
  if (isOpen(host)) return null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Each attempt gets its own timeout, aborted early if the caller gives up.
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const composite = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await fetch(url, { signal: composite });
      if (response.status === 429 || response.status >= 500) {
        await sleep(400 << attempt, signal);
        continue;
      }
      if (!response.ok) {
        recordFailure(host);
        return null;
      }
      const value = await response.json();
      recordSuccess(host);
      return value;
    } catch (error) {
      // A caller that navigated away should not trip the breaker.
      if (signal?.aborted) return null;
      await sleep(400 << attempt, signal);
    }
  }

  recordFailure(host);
  return null;
}

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true }
    );
  });

// MARK: - Apple Books

/**
 * Apple answers in well under a second, so the UI shows these first and refines
 * once Open Library lands.
 */
export async function searchApple(query, { signal } = {}) {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = `https://itunes.apple.com/search?${new URLSearchParams({
    term: q,
    media: 'ebook',
    limit: '25'
  })}`;

  const root = await getJSON(url, { signal });
  if (!root?.results) return [];

  return root.results
    .map((r) => {
      if (!r.trackName) return null;
      // Drop Apple's "(Unabridged)" / "(Abridged)" suffixes.
      const title = r.trackName.replace(/\s*\((Unabridged|Abridged)\)\s*$/i, '');
      const artwork = r.artworkUrl100;
      return {
        id: `apple-${r.trackId ?? title}`,
        title,
        authors: splitAuthors(r.artistName),
        summary: stripHTML(r.description),
        publishedDate: r.releaseDate ? String(r.releaseDate).slice(0, 10) : null,
        subjects: r.genres ?? [],
        isbn13: isbnFromArtwork(artwork),
        coverURL: thumbArtwork(artwork),
        coverMasterURL: masterArtwork(artwork),
        candidateISBNs: [],
        source: 'apple'
      };
    })
    .filter(Boolean);
}

// MARK: - Open Library

const OL_FIELDS =
  'key,title,subtitle,author_name,first_publish_year,cover_i,isbn,number_of_pages_median,publisher,language,subject';

async function searchOpenLibrary(query, { signal } = {}) {
  const url = `https://openlibrary.org/search.json?${new URLSearchParams({
    q: query,
    fields: OL_FIELDS,
    limit: '25'
  })}`;

  const root = await getJSON(url, { signal });
  if (!root?.docs) return [];

  return root.docs
    .map((d) => {
      if (!d.title) return null;
      const isbns = d.isbn ?? [];
      return {
        id: `ol-${d.key ?? d.title}`,
        title: d.title,
        subtitle: d.subtitle ?? null,
        authors: d.author_name ?? [],
        pageCount: d.number_of_pages_median ?? null,
        // Deliberately NOT taking d.publisher: that list spans every edition ever
        // printed, so its first entry is arbitrary and frequently foreign
        // ("Rivages" for Station Eleven). Publisher is only trusted when a
        // guarded edition lookup supplies it.
        publisher: null,
        language: d.language?.[0] ?? null,
        subjects: (d.subject ?? []).slice(0, 12),
        publishedDate: d.first_publish_year ? String(d.first_publish_year) : null,
        isbn13: isbns.find((i) => i.length === 13) ?? null,
        isbn10: isbns.find((i) => i.length === 10) ?? null,
        candidateISBNs: isbns.filter((i) => i.length === 13).slice(0, 6),
        // Open Library offers S/M/L only; L is the largest there is.
        coverURL: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
        coverMasterURL: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
        source: 'openlibrary'
      };
    })
    .filter(Boolean);
}

/**
 * Resolves one specific edition. Open Library's work-level search reports
 * whatever edition it feels like — which is how you end up with a German
 * Neuromancer and a French Pale Fire — so the caller pins it with Apple's ISBN
 * and we guard the result before trusting it.
 */
async function edition(isbn, expectedTitle, { signal } = {}) {
  const d = await getJSON(`https://openlibrary.org/isbn/${isbn}.json`, { signal, attempts: 1 });
  if (!d?.title) return null;

  // Corroboration: the ISBN scraped from an artwork filename is not always right.
  if (!titlesAgree(d.title, expectedTitle)) return null;

  // Audiobook editions report nonsense page counts (Station Eleven: "9 pages").
  const format = (d.physical_format ?? '').toLowerCase();
  if (format.includes('audio') || format.includes('cassette') || format.includes('cd')) return null;

  // Language guard. Open Library happily resolves an ISBN to a French Gallimard
  // or German Tropen printing, whose publisher and page count then describe a
  // book the user isn't holding.
  const language = d.languages?.[0]?.key?.split('/').pop() ?? null;
  if (language && language !== 'eng') return null;

  return {
    pageCount:
      typeof d.number_of_pages === 'number' && d.number_of_pages >= 40 ? d.number_of_pages : null,
    publisher: d.publishers?.[0] ?? null,
    publishedDate: d.publish_date ?? null,
    language
  };
}

/**
 * Tries candidate ISBNs in order and returns the first edition that survives the
 * title, format and language guards. Capped at three so a bad match cannot turn
 * one search into a dozen round trips.
 */
async function firstUsableEdition(isbns, expectedTitle, { signal } = {}) {
  for (const isbn of isbns.slice(0, 3)) {
    const found = await edition(isbn, expectedTitle, { signal });
    if (found) return found;
  }
  return null;
}

// MARK: - Merge

const mergeKey = (r) =>
  `${normalise(r.title).slice(0, 48)}|${normalise(r.authors?.[0] ?? '').slice(0, 24)}`;

/**
 * Full search: Apple and Open Library in parallel, merged, ranked, then the top
 * results enriched with real edition data.
 *
 * `onPartial` is called with Apple's results as soon as they land — they arrive
 * in a few hundred milliseconds, against a couple of seconds for the merged set,
 * and showing them immediately is most of what makes the field feel responsive.
 */
export async function search(query, { signal, onPartial } = {}) {
  const q = query.trim();
  if (q.length < 2) return [];

  const applePromise = searchApple(q, { signal });
  const olPromise = searchOpenLibrary(q, { signal });

  if (onPartial) {
    applePromise
      .then((apple) => {
        if (!signal?.aborted && apple.length) onPartial(rank(apple, q).slice(0, 20));
      })
      .catch(() => {});
  }

  const [apple, ol] = await Promise.all([applePromise, olPromise]);
  if (signal?.aborted) return [];

  const merged = new Map();
  const order = [];

  for (const r of ol) {
    const key = mergeKey(r);
    if (!merged.has(key)) order.push(key);
    merged.set(key, r);
  }

  // Collapse Apple's own duplicates first, keeping the most English-looking
  // edition for each book. Apple returns every storefront edition of a title.
  const bestApple = new Map();
  for (const a of apple) {
    const key = mergeKey(a);
    const rival = bestApple.get(key);
    if (!rival) {
      bestApple.set(key, a);
      continue;
    }
    const scoreOf = (x) => (isEnglishISBN(x.isbn13) ? 2 : 0) + (x.coverURL ? 1 : 0);
    if (scoreOf(a) > scoreOf(rival)) bestApple.set(key, a);
  }

  for (const a of [...bestApple.values()].sort((x, y) => x.title.localeCompare(y.title))) {
    const key = mergeKey(a);
    const existing = merged.get(key);
    if (!existing) {
      order.push(key);
      merged.set(key, a);
      continue;
    }

    // Apple wins on title, authors and cover; Open Library on bibliography.
    existing.title = a.title;
    // Open Library's author_name spans every edition, so it picks up translators
    // ("Helene Bützow" on Piranesi). Apple credits the edition's actual authors —
    // but only trust it when it has some.
    if (a.authors.length) existing.authors = a.authors;
    existing.coverURL = a.coverURL ?? existing.coverURL;
    existing.coverMasterURL = a.coverMasterURL ?? existing.coverMasterURL;
    existing.isbn13 = a.isbn13 ?? existing.isbn13;
    // Apple's ISBN names the very edition whose cover we display, so it is the
    // best first guess; the rest stay as fallbacks.
    if (a.isbn13) {
      existing.candidateISBNs = [
        a.isbn13,
        ...existing.candidateISBNs.filter((i) => i !== a.isbn13)
      ];
    }
    existing.summary = existing.summary ?? a.summary;
    // Keep Open Library's first-publication year if it has one: Apple's
    // releaseDate is this printing's, so Dune would read 1975, not 1965.
    existing.publishedDate = existing.publishedDate ?? a.publishedDate;
    existing.source = 'openlibrary+apple';
    merged.set(key, existing);
  }

  let results = rank(order.map((k) => merged.get(k)).filter(Boolean), q).slice(0, 20);

  // Enrich the leaders only — each one is a network round trip.
  await Promise.all(
    results.slice(0, 10).map(async (r, i) => {
      const candidates = r.candidateISBNs.length ? r.candidateISBNs : [r.isbn13].filter(Boolean);
      if (!candidates.length) return;

      const ed = await firstUsableEdition(candidates, r.title, { signal });
      if (!ed) return;

      // Page count only fills a gap. Open Library's cross-edition median is a
      // better estimate of "how long is this book" than whichever single printing
      // our ISBN happened to resolve to — a fallback ISBN once reported Dune at
      // 892 pages against a median of 607.
      if (results[i].pageCount == null) results[i].pageCount = ed.pageCount;
      results[i].publisher = ed.publisher ?? results[i].publisher;
      results[i].language = ed.language ?? results[i].language;
      // Keep the first publication year rather than this printing's date: a 2011
      // reissue of Dune should still read 1965.
      if (results[i].publishedDate == null) results[i].publishedDate = ed.publishedDate;
    })
  );

  return results;
}
