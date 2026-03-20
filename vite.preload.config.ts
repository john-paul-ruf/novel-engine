import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@infra': path.resolve(__dirname, 'src/infrastructure'),
      '@app': path.resolve(__dirname, 'src/application'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // The main process expects `preload.js` via path.join(__dirname, 'preload.js').
        // Without this, the preload entry (src/preload/index.ts) outputs as `index.js`,
        // colliding with the main process entry and never producing a `preload.js` file.
        entryFileNames: 'preload.js',
      },
    },
  },
});
