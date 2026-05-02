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
      external: ['better-sqlite3', 'archiver', 'undici'],
    },
  },
});
