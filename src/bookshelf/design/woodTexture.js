/**
 * Procedurally generated maple, in the spirit of the wood iBooks used for its
 * shelves.
 *
 * Generated rather than shipped as a photograph for three reasons: it tiles
 * seamlessly, it renders at whatever pixel density the display actually has,
 * and there is no third-party asset licence to carry around.
 *
 * This module is pure and has no DOM dependency beyond OffscreenCanvas, so it
 * runs inside a worker — a tile costs one fbm evaluation per pixel per octave,
 * which at 1024² is over a second of arithmetic and would stall the main thread.
 */

// MARK: - Tileable value noise

function splitMix64(seed) {
  // 64-bit arithmetic via BigInt; this runs a few hundred times at startup, not
  // per pixel, so the cost does not matter.
  let state = BigInt(seed);
  const MASK = (1n << 64n) - 1n;
  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
    return z ^ (z >> 31n);
  };
}

/**
 * Value noise on a lattice that wraps at a caller-chosen period on each axis.
 *
 * The per-axis period is what lets the grain be stretched: pores need to be very
 * fine across the grain and very coarse along it, and a single square lattice
 * cannot do that without showing its own grid.
 */
function createNoise(seed) {
  const next = splitMix64(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates, so the table is a genuine permutation.
  for (let i = 255; i > 0; i--) {
    const j = Number(next() % BigInt(i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  perm.set(p, 0);
  perm.set(p, 256);

  const hash = (x, y) => perm[(perm[x & 255] + y) & 255] / 255;

  // Quintic fade — the classic Perlin easing. A cheaper cubic smoothstep leaves
  // a faint grid because its second derivative is discontinuous at the lattice.
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  function value(u, v, px, py) {
    const x = u * px;
    const y = v * py;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const sx = fade(x - x0);
    const sy = fade(y - y0);

    const xa = ((x0 % px) + px) % px;
    const xb = (xa + 1) % px;
    const ya = ((y0 % py) + py) % py;
    const yb = (ya + 1) % py;

    const n00 = hash(xa, ya);
    const n10 = hash(xb, ya);
    const n01 = hash(xa, yb);
    const n11 = hash(xb, yb);
    const top = n00 + (n10 - n00) * sx;
    const bottom = n01 + (n11 - n01) * sx;
    return top + (bottom - top) * sy;
  }

  // Fractal sum. Both periods double per octave, so every octave still wraps.
  function fbm(u, v, px, py, octaves) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let qx = px;
    let qy = py;
    for (let i = 0; i < octaves; i++) {
      sum += value(u, v, qx, qy) * amp;
      norm += amp;
      amp *= 0.5;
      qx *= 2;
      qy *= 2;
    }
    return sum / norm;
  }

  return { fbm };
}

// MARK: - Palette

// Pale warm maple, as iBooks used. The range is deliberately narrow: this wood
// is meant to be a quiet backdrop for cover art, and a wide range turns the
// grain into the loudest thing on screen.
const LIGHTEST = [0.906, 0.804, 0.635]; // #e7cda2
const DARKEST = [0.722, 0.573, 0.373]; // #b8925f

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// MARK: - Generation

/**
 * Renders one seamless tile into an ImageData.
 *
 * @param size edge length in pixels
 * @param vertical true runs the grain top-to-bottom (the back panel of the
 *   case), false runs it left-to-right (the shelf boards)
 * @param seed varying this gives visibly different boards from the same code
 */
export function renderWoodTile(size, vertical, seed, grade = {}) {
  // `contrast` pivots around mid-tone and `brightness` lifts the whole board.
  // The boards are graded lighter than the back panel so the shelves separate
  // from the recess behind them instead of dissolving into it.
  const contrast = grade.contrast ?? 1;
  const brightness = grade.brightness ?? 0;
  const noise = createNoise(seed);
  const pixels = new Uint8ClampedArray(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Work in "along the grain" / "across the grain" tile coordinates so the
      // same maths serves both orientations.
      const along = (vertical ? py : px) / size;
      const across = (vertical ? px : py) / size;

      // Growth rings: tight bands running across the grain that wander gently
      // along it. The wander lattice is deliberately fine — a coarse one makes
      // the sawtooth below break into visible facets.
      const wander = noise.fbm(across, along, 24, 6, 4) - 0.5;
      const drift2 = noise.fbm(across, along, 6, 2, 3) - 0.5;
      // Widely spaced, gently wandering rings. This is finished maple, not a
      // rough plank: the grain should be something you notice on second look.
      const ringInput = across * 17 + wander * 0.9 + drift2 * 1.3;
      // Sawtooth rather than a sine: real rings have a hard edge on one side.
      const ring = ringInput - Math.floor(ringInput);

      // A gentle curve, deliberately. A steep one draws narrow dark lines and
      // the panel turns into reeded screening — sharp, but nothing like the
      // smooth pale case this is meant to be.
      const line = Math.pow(ring, 0.85);

      // Fine pores, kept faint. They exist to stop large areas going flat, not
      // to be read as texture in their own right.
      const pore = noise.fbm(across, along, 240, 6, 3);

      // Broad lightness variation across the board, which is most of what makes
      // real timber look like timber rather than printed paper.
      const drift = noise.fbm(across, along, 5, 2, 4);

      // Drift-dominant, so the wood reads as smooth stock with soft figure in
      // it rather than as a field of stripes.
      let t = line * 0.26 + pore * 0.16 + drift * 0.58;
      t = clamp01((t - 0.2) / 0.6);
      // Bias light: pale maple, with the grain as the faintest of accents.
      t = Math.pow(t, 1.35);
      // Graded last, so contrast acts on the finished tone rather than on one
      // of the three components feeding it.
      t = clamp01((t - 0.5) * contrast + 0.5 - brightness);

      const i = (py * size + px) * 4;
      pixels[i] = (LIGHTEST[0] + (DARKEST[0] - LIGHTEST[0]) * t) * 255;
      pixels[i + 1] = (LIGHTEST[1] + (DARKEST[1] - LIGHTEST[1]) * t) * 255;
      pixels[i + 2] = (LIGHTEST[2] + (DARKEST[2] - LIGHTEST[2]) * t) * 255;
      pixels[i + 3] = 255;
    }
  }

  return new ImageData(pixels, size, size);
}
