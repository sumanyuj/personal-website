import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Two entries rather than a client-side router: the homepage and the bookshelf
// share no UI, and a router would put the app's code on the homepage's critical
// path for a page most visitors never open.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        bookshelf: resolve(__dirname, 'bookshelf/index.html')
      }
    }
  },
  worker: { format: 'es' }
});
