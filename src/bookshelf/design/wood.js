import woodHorizontal from '../assets/wood.webp';
import woodVertical from '../assets/wood-v.webp';

/**
 * The case is finished in a photograph of real wood — ambientCG's Wood048
 * colour map, CC0 — which is what the desktop app uses.
 *
 * This replaces a procedurally generated maple. The generator tiled seamlessly
 * and carried no licence, but no amount of tuning got it to the contrast and
 * the fine, sharp grain of a photograph: every setting that sharpened the rings
 * also turned the panel into reeded screening.
 *
 * Both tiles are 2048² and seamless. The panel's grain runs vertically and the
 * boards' horizontally, which is why there are two images rather than one
 * rotated in CSS — `background-image` cannot rotate, and rotating the element
 * would take everything drawn on it along too.
 */
export const WOOD = {
  /** Back panel: vertical grain, drawn at an 880px tile. */
  panel: { url: woodVertical, tile: 880 },
  /** Shelf boards: horizontal grain, drawn at a 700px tile. */
  board: { url: woodHorizontal, tile: 700 }
};
