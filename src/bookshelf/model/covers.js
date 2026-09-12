import { putCover } from './db.js';

/**
 * Cover art: fetched at the best resolution the source offers, then stored at a
 * size worth displaying.
 *
 * Apple's CDN will serve ~1400×2500, which is wonderful on screen and wasteful
 * in a database — roughly 400KB per book, so a 200-book library would run to
 * 80MB and risk eviction under storage pressure. Re-encoding to WebP at display
 * width costs about a tenth of that and is indistinguishable at the sizes a
 * shelf actually draws.
 */

/** Enough for a very large book on a high-density display. */
const STORED_WIDTH = 660;
const WEBP_QUALITY = 0.82;

const canEncodeWebP = (() => {
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

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Downloads a cover, returning the blob to store and the aspect ratio of the
 * original artwork. Returns null when the image cannot be fetched — a book
 * without a cover still shelves, with a cloth stand-in.
 */
export async function fetchCover(url, { signal } = {}) {
  if (!url) return null;

  let bitmap;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    const original = await response.blob();
    bitmap = await createImageBitmap(original);

    // Aspect comes from the source bitmap, before any resizing, so it describes
    // the artwork rather than our re-encoding.
    const aspect = bitmap.width / bitmap.height;
    if (!Number.isFinite(aspect) || aspect <= 0) return null;

    // Nothing to gain from re-encoding something already small.
    if (bitmap.width <= STORED_WIDTH && original.size < 120_000) {
      return { blob: original, aspect };
    }

    const width = Math.min(STORED_WIDTH, bitmap.width);
    const height = Math.round(width / aspect);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    const type = canEncodeWebP() ? 'image/webp' : 'image/jpeg';
    const blob = await toBlob(canvas, type, WEBP_QUALITY);
    return blob ? { blob, aspect } : { blob: original, aspect };
  } catch {
    return null;
  } finally {
    bitmap?.close?.();
  }
}

/** Fetches and stores a cover for a book, returning the aspect to save on it. */
export async function saveCover(bookId, url, { signal } = {}) {
  const result = await fetchCover(url, { signal });
  if (!result) return null;
  await putCover(bookId, result.blob);
  return result.aspect;
}

/**
 * Object URLs for a map of blobs, with the revocation bookkeeping in one place —
 * leaking them holds the whole blob in memory for the life of the document.
 */
export function createObjectURLs(blobsByKey) {
  const urls = new Map();
  for (const [key, blob] of blobsByKey) urls.set(key, URL.createObjectURL(blob));
  return {
    urls,
    revoke() {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    }
  };
}
