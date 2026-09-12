import { renderWoodTile } from './woodTexture.js';

// Rendering happens off the main thread and comes back as a blob, which the page
// turns into a URL for `background-image`. Passing a blob rather than an
// ImageBitmap keeps the result cacheable in IndexedDB.
self.onmessage = async ({ data: { id, size, vertical, seed } }) => {
  try {
    const imageData = renderWoodTile(size, vertical, seed);
    const canvas = new OffscreenCanvas(size, size);
    canvas.getContext('2d').putImageData(imageData, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ id, blob });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
