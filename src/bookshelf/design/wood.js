import { getTexture, putTexture } from '../model/db.js';

/**
 * Seamless wood tiles, generated once per browser and then cached.
 *
 * The tile is a pure function of (size, grain, seed), so it is generated in a
 * worker on first run and kept in IndexedDB afterwards. Later visits paint the
 * shelves immediately instead of spending a few hundred milliseconds of CPU
 * reproducing a bitmap that cannot have changed.
 */

/** Bump when the generator changes, to retire every cached tile. */
const TEXTURE_VERSION = 6;

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

function renderInWorker(size, vertical, seed, grade) {
  return new Promise((resolve, reject) => {
    const id = nextJobId++;
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage({ id, size, vertical, seed, grade });
  });
}

/**
 * Resolves to an object URL for the tile, or null if generation is unavailable —
 * callers fall back to a flat colour, so the shelves still read as wood.
 */
export function woodTileURL(vertical, seed, cssTile, grade = {}) {
  const size = tileResolution(cssTile);
  // TEXTURE_VERSION is part of the key so a change to the generator retires
  // every cached tile; without it, anyone who had already loaded the app would
  // keep being served the old, flatter wood forever.
  const key =
    `${TEXTURE_VERSION}-${size}-${vertical ? 'v' : 'h'}-${seed}` +
    `-c${grade.contrast ?? 1}b${grade.brightness ?? 0}`;
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
      const blob = await renderInWorker(size, vertical, seed, grade);
      putTexture(key, blob).catch(() => {});
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  })();

  inFlight.set(key, job);
  return job;
}

/**
 * Grain direction, seed and tone for each surface.
 *
 * The boards are graded lighter and a touch more contrasty than the back panel.
 * Previously both were generated identically and the panel was then buried under
 * a heavy black overlay, which left the boards and the recess at nearly the same
 * tone — the shelves did not separate, and the whole case read as flat and
 * muddy. Putting the separation in the texture instead of in an overlay keeps
 * the grain's contrast intact.
 */
export const WOOD = {
  panel: { vertical: true, seed: 11, tile: 300, grade: { contrast: 0.94, brightness: 0.0 } },
  board: { vertical: false, seed: 7, tile: 520, grade: { contrast: 0.9, brightness: 0.1 } }
};
