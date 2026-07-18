import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const aliases = {
  '@domain': path.resolve(__dirname, 'src/domain'),
  '@infra': path.resolve(__dirname, 'src/infrastructure'),
  '@app': path.resolve(__dirname, 'src/application'),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: aliases },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/{domain,infrastructure,application,main,preload}/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias: aliases },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['src/test/setup.renderer.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.*', 'src/test/**'],
    },
  },
});
