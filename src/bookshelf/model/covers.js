import { uploadCover } from '../api.js';

/**
 * Cover art: fetched at the resolution the source actually holds, then stored
 * on the server as a full-resolution master plus a display-sized derivative.
 *
 * Two things came out of probing Apple's CDN. `1400x0w` is not a ceiling —
 * asking for any width at or above the master's returns the master itself,
 * 1466×2625 for one book and 1649×2475 for another — and the CDN transcodes to
 * WebP by extension, where the same pixels cost 74KB against 434KB as JPEG,
 * encoded from the master rather than re-encoded from a JPEG here. So the
 * master is uploaded exactly as delivered: no canvas round trip, no generation
 * loss.
 *
 * The derivative exists because a 1649×2475 image decodes to roughly 16MB of
 * bitmap, and a shelf showing twenty would ask the browser to hold several
 * hundred megabytes. The shelf draws the derivative; the detail sheet, where a
 * cover is actually inspected, draws the master.
 */

/** Wide enough for the largest book the shelf can draw on a 2× display. */
const THUMB_WIDTH = 800;
const THUMB_QUALITY = 0.86;

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

const toBlob = (canvas, type, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

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
 * Downloads a cover, returning the master, a display-sized derivative and the
 * aspect of the artwork. Falls back to whatever the URL originally pointed at:
 * the request asks for a format the CDN transcodes to, and a browser that
 * cannot decode it should still end up with a cover.
 */
export async function fetchCover(url, { signal, fallbackURL } = {}) {
  if (!url) return null;
  const attempts = fallbackURL && fallbackURL !== url ? [url, fallbackURL] : [url];

  for (const attempt of attempts) {
    let bitmap;
    try {
      const response = await fetch(attempt, { signal });
      if (!response.ok) continue;
      const master = await response.blob();

      bitmap = await createImageBitmap(master);
      const aspect = bitmap.width / bitmap.height;
      if (!Number.isFinite(aspect) || aspect <= 0) continue;

      const thumb =
        bitmap.width > THUMB_WIDTH ? ((await makeThumb(bitmap, aspect)) ?? master) : master;
      return { master, thumb, aspect };
    } catch {
      if (signal?.aborted) return null;
    } finally {
      bitmap?.close?.();
    }
  }
  return null;
}

/**
 * Fetches a cover and stores it against the book, returning the aspect and the
 * etag the server assigned. The master goes up first: it is the one that sets
 * the etag, so a failure part-way leaves the book without artwork rather than
 * pointing at a thumbnail that has no full-resolution copy behind it.
 */
export async function saveCover(bookId, url, { signal, fallbackURL } = {}) {
  const cover = await fetchCover(url, { signal, fallbackURL });
  if (!cover) return null;

  const { etag } = await uploadCover(bookId, 'master', cover.master, cover.aspect);
  await uploadCover(bookId, 'thumb', cover.thumb);
  return { aspect: cover.aspect, etag };
}

/** Uploads blobs that are already in hand, used when adopting a local library. */
export async function uploadExistingCover(bookId, master, thumb, aspect) {
  if (!master) return null;
  const { etag } = await uploadCover(bookId, 'master', master, aspect);
  await uploadCover(bookId, 'thumb', thumb ?? master);
  return { aspect, etag };
}
