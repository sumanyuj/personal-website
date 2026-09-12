/** Text helpers shared by search, ranking and the merge guards. */

export function normalise(s) {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const tokens = (s) => new Set(normalise(s).split(' ').filter(Boolean));

/** Loose title agreement, used to reject an edition lookup that wandered off. */
export function titlesAgree(a, b) {
  const na = normalise(a);
  const nb = normalise(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.startsWith(nb) || nb.startsWith(na)) return true;

  const ta = tokens(na);
  const tb = tokens(nb);
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size) >= 0.6;
}

/** Apple returns descriptions as HTML. */
export function stripHTML(s) {
  if (!s) return null;
  let text = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  for (const [entity, replacement] of [
    ['&amp;', '&'],
    ['&quot;', '"'],
    ['&#39;', "'"],
    ['&nbsp;', ' '],
    ['&lt;', '<'],
    ['&gt;', '>']
  ]) {
    text = text.split(entity).join(replacement);
  }
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text || null;
}

/**
 * Splits Apple's single artist string, and drops duplicates that differ only by
 * punctuation or accent.
 */
export function splitAuthors(s) {
  if (!s) return [];
  const parts = s
    .replace(/ & /g, ', ')
    .replace(/ and /g, ', ')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const key = normalise(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/**
 * ISBN registration groups 978-0 and 978-1 are the English-language areas. This
 * is the only dependable language signal Apple's search gives us, and without it
 * a Spanish Dune or a German Neuromancer can win the merge and bring its own
 * cover, date and (rejected) edition data with it.
 */
export const isEnglishISBN = (isbn) =>
  !!isbn && (isbn.startsWith('9780') || isbn.startsWith('9781'));

/**
 * Apple names the artwork file after the edition's ISBN, which is the only
 * reliable way to pin down which edition the cover belongs to.
 */
export function isbnFromArtwork(url) {
  const match = /\/(97[89]\d{10})\./.exec(url ?? '');
  return match ? match[1] : null;
}

/**
 * Apple's CDN resizes by URL. `1400x0w` gives roughly 1400×2500 with no
 * letterbox padding — about six times the resolution Open Library's largest
 * cover offers.
 */
export function upscaleArtwork(url) {
  if (!url) return null;
  return url.replace(/\/\d+x\d+(bb|w)?\.(jpg|png)$/, '/1400x0w.jpg');
}
