import { putCover } from './db.js';

/**
 * Cover art, kept at the resolution the source actually holds.
 *
 * Two things came out of probing Apple's CDN that the native app did not use:
 *
 * 1. `1400x0w` is not the ceiling. Asking for any width at or above the master's
 *    returns the master itself — 1466×2625 for a typical cover — so the request
 *    asks for more than exists and takes whatever comes back.
 * 2. The CDN will transcode to WebP by extension. The same 1466×2625 pixels cost
 *    74KB as WebP against 434KB as JPEG, encoded from the master rather than
 *    re-encoded from a JPEG here, so it is both smaller and cleaner than
 *    anything this code could produce.
 *
 * So the master is stored exactly as delivered: no canvas round trip, no
 * generation loss, full resolution.
 *
 * A display-sized derivative is stored alongside it. A 1466×2625 image decodes
 * to roughly 15MB of bitmap, and a shelf showing twenty of them would ask the
 * browser to hold several hundred megabytes at once. The shelf draws the
 * derivative; the detail sheet, where a cover is actually inspected, draws the
 * master.
 */

/** Wide enough for the largest book the shelf can draw on a 2× display. */
const THUMB_WIDTH = 800;
const THUMB_QUALITY = 0.86;

/** Beyond this a "master" is something pathological, e.g. a 3MB PNG. */
const MAX_MASTER_BYTES = 6_000_000;

/**
 * Rewrites an Apple artwork URL to a given size and format. Apple names the file
 * after the edition's ISBN and appends a size spec, which is the only part we
 * change.
 */
export function appleArtwork(url, spec) {
  if (!url) return null;
  return url.replace(/\/\d+x\d+(bb|w)?\.(jpg|png|webp)$/, `/${spec}`);
}

/** The master, asking for more width than any cover has so the CDN gives its largest. */
export const appleMaster = (url) => appleArtwork(url, '2000x0w.webp');
/** A thumbnail for the search results list, which draws them at 44px. */
export const appleThumb = (url) => appleArtwork(url, '300x0w.webp');

async function decode(blob) {
  const bitmap = await createImageBitmap(blob);
  const aspect = bitmap.width / bitmap.height;
  return { bitmap, aspect, width: bitmap.width, height: bitmap.height };
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

const supportsWebP = (() => {
  let cached;
  return () => {
    if (cached === undefined) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      cached = canvas.toDataURL('image/webp').startsWith('data:image/webp');
    }
    return cached;
  };
})();

async function makeThumb(bitmap, aspect) {
  const width = Math.min(THUMB_WIDTH, bitmap.width);
  const height = Math.max(1, Math.round(width / aspect));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return toBlob(canvas, supportsWebP() ? 'image/webp' : 'image/jpeg', THUMB_QUALITY);
}

/**
 * Fetches a cover at the best resolution offered, returning the master, a
 * display-sized derivative, and the aspect of the artwork.
 *
 * Falls back from WebP to whatever the URL originally pointed at: the request is
 * for a format the CDN transcodes to, and a browser that cannot decode it should
 * still end up with a cover.
 */
export async function fetchCover(url, { signal, fallbackURL } = {}) {
  if (!url) return null;

  const attempts = fallbackURL && fallbackURL !== url ? [url, fallbackURL] : [url];

  for (const attempt of attempts) {
    let decoded;
    try {
      const response = await fetch(attempt, { signal });
      if (!response.ok) continue;
      const blob = await response.blob();

      decoded = await decode(blob);
      if (!Number.isFinite(decoded.aspect) || decoded.aspect <= 0) continue;

      // Store the bytes exactly as delivered unless they are unreasonable, in
      // which case a re-encode is the lesser evil.
      const master =
        blob.size <= MAX_MASTER_BYTES
          ? blob
          : ((await makeThumb(decoded.bitmap, decoded.aspect)) ?? blob);
      const thumb =
        decoded.width > THUMB_WIDTH ? await makeThumb(decoded.bitmap, decoded.aspect) : blob;

      return {
        master,
        thumb: thumb ?? master,
        aspect: decoded.aspect,
        width: decoded.width,
        height: decoded.height
      };
    } catch {
      if (signal?.aborted) return null;
    } finally {
      decoded?.bitmap?.close?.();
    }
  }

  return null;
}

/** Fetches and stores a cover for a book, returning the aspect to save on it. */
export async function saveCover(bookId, url, { signal, fallbackURL } = {}) {
  const cover = await fetchCover(url, { signal, fallbackURL });
  if (!cover) return null;
  await putCover(bookId, cover.master, cover.thumb);
  return cover.aspect;
}

/**
 * Asks the browser not to evict the library under storage pressure. Full-
 * resolution covers make the origin's footprint large enough to be a candidate,
 * and losing them silently would be worse than the prompt some browsers show.
 */
export function requestPersistence() {
  return navigator.storage?.persist?.().catch(() => false) ?? Promise.resolve(false);
}
