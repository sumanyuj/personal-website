import { getTexture, putTexture } from '../model/db.js';

/**
 * Seamless wood tiles, generated once per browser and then cached.
 *
 * The tile is a pure function of (size, grain, seed), so it is generated in a
 * worker on first run and kept in IndexedDB afterwards. Later visits paint the
 * shelves immediately instead of spending a few hundred milliseconds of CPU
 * reproducing a bitmap that cannot have changed.
 */

const inFlight = new Map();

/**
 * Tile resolution is chosen from how large the tile is drawn and how dense the
 * display is, so the bitmap is never scaled up.
 *
 * The boards are drawn at a 430px tile, which on a 2× display is 860 device
 * pixels — a 512² tile was being stretched by two thirds, and the grain showed
 * it. Generation cost is quadratic (85ms at 512², 1.25s at 2048²) but it is
 * paid once per browser and then served from IndexedDB.
 */
function tileResolution(cssTile) {
  const density = Math.min(window.devicePixelRatio || 1, 3);
  const needed = cssTile * density;
  let size = 512;
  while (size < needed && size < 2048) size *= 2;
  return size;
}

let worker = null;
let nextJobId = 0;
const pending = new Map();

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./wood.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data: { id, blob, error } }) => {
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    if (error) job.reject(new Error(error));
    else job.resolve(blob);
  };
  worker.onerror = (event) => {
    for (const job of pending.values()) job.reject(event.error ?? new Error('wood worker failed'));
    pending.clear();
  };
  return worker;
}

function renderInWorker(size, vertical, seed) {
  return new Promise((resolve, reject) => {
    const id = nextJobId++;
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage({ id, size, vertical, seed });
  });
}

/**
 * Resolves to an object URL for the tile, or null if generation is unavailable —
 * callers fall back to a flat colour, so the shelves still read as wood.
 */
export function woodTileURL(vertical, seed, cssTile) {
  const size = tileResolution(cssTile);
  const key = `${size}-${vertical ? 'v' : 'h'}-${seed}`;
  if (inFlight.has(key)) return inFlight.get(key);

  const job = (async () => {
    try {
      const cached = await getTexture(key);
      if (cached) return URL.createObjectURL(cached);
    } catch {
      // A blocked or unavailable database is not a reason to skip the texture.
    }

    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;

    try {
      const blob = await renderInWorker(size, vertical, seed);
      putTexture(key, blob).catch(() => {});
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  })();

  inFlight.set(key, job);
  return job;
}

/** Grain direction and seed for each surface, matching the native app. */
export const WOOD = {
  panel: { vertical: true, seed: 11, tile: 190 },
  board: { vertical: false, seed: 7, tile: 430 }
};
