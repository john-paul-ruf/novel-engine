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
      exclude: [
        'src/**/*.test.*',
        'src/test/**',
        // Electron-launch-only entry points with no unit-test surface:
        // the composition root (window/protocol wiring, covered by `npm start`
        // boot checks — SESSION-21) and the ReactDOM bootstrap (SESSION-28).
        'src/main/index.ts',
        'src/renderer/main.tsx',
      ],
      // Enforced floors (SESSION-29). Achieved at gate time:
      // domain 100 · application 90.9 · infrastructure 89.5 · renderer 83.9 ·
      // preload 96 · main 56.8 (target 80 — src/main/ipc/handlers.ts
      // delegation bodies are the gap; follow-up logged in the program STATE).
      // Raise, never lower, without justification in the program STATE notes.
      thresholds: {
        lines: 75,
        statements: 75,
        functions: 75,
        branches: 70,
        'src/domain/**': { lines: 90 },
        'src/application/**': { lines: 90 },
        'src/infrastructure/**': { lines: 80 },
        'src/main/**': { lines: 54 },
        'src/preload/**': { lines: 90 },
        'src/renderer/**': { lines: 70 },
      },
    },
  },
});
