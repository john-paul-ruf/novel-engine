import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@infra': path.resolve(__dirname, 'src/infrastructure'),
      '@app': path.resolve(__dirname, 'src/application'),
    },
  },
});
