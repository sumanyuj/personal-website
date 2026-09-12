/**
 * Procedurally generated maple, in the spirit of the wood iBooks used for its
 * shelves.
 *
 * Generated rather than shipped as a photograph for three reasons: it tiles
 * seamlessly, it renders at whatever pixel density the display actually has,
 * and there is no third-party asset licence to carry around.
 *
 * This module is pure and has no DOM dependency beyond OffscreenCanvas, so it
 * runs inside a worker — a 512² tile costs a few hundred thousand fbm
 * evaluations and would visibly stall the main thread.
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

// Placed where iBooks' maple sat: warm honey, not orange, not pink.
const LIGHTEST = [0.898, 0.776, 0.596]; // #e5c698
const DARKEST = [0.612, 0.455, 0.282]; // #9c7448

// MARK: - Generation

/**
 * Renders one seamless tile into an ImageData.
 *
 * @param size edge length in pixels
 * @param vertical true runs the grain top-to-bottom (the back panel of the
 *   case), false runs it left-to-right (the shelf boards)
 * @param seed varying this gives visibly different boards from the same code
 */
export function renderWoodTile(size, vertical, seed) {
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
      const ringInput = across * 30 + wander * 1.6 + drift2 * 2.6;
      // Sawtooth rather than a sine: real rings have a hard edge on one side.
      let ring = ringInput - Math.floor(ringInput);
      ring = Math.pow(ring, 0.7);

      // Fine pores. Very fine across the grain, very coarse along it, which is
      // what makes them read as streaks rather than blobs.
      const pore = noise.fbm(across, along, 220, 6, 3);

      // Broad lightness variation, so the board isn't uniformly bright.
      const drift = noise.fbm(across, along, 4, 3, 3);

      let t = ring * 0.46 + pore * 0.24 + drift * 0.3;
      t = Math.min(Math.max((t - 0.16) / 0.7, 0), 1);
      // Bias light: maple is pale, with the grain as darker accents.
      t = Math.pow(t, 1.45);

      const i = (py * size + px) * 4;
      pixels[i] = (LIGHTEST[0] + (DARKEST[0] - LIGHTEST[0]) * t) * 255;
      pixels[i + 1] = (LIGHTEST[1] + (DARKEST[1] - LIGHTEST[1]) * t) * 255;
      pixels[i + 2] = (LIGHTEST[2] + (DARKEST[2] - LIGHTEST[2]) * t) * 255;
      pixels[i + 3] = 255;
    }
  }

  return new ImageData(pixels, size, size);
}
