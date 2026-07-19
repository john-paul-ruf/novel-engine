import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL auto-cleanup relies on a global afterEach; vitest runs without globals,
// so unmount rendered trees between tests explicitly (SESSION-26).
afterEach(() => cleanup());

// Placeholder bridge so renderer code can reference window.novelEngine without
// crashing at import time. Tests that exercise the bridge must install their
// own typed mock (SESSION-22 adds the shared mock factory).
Object.defineProperty(window, 'novelEngine', {
  writable: true,
  configurable: true,
  value: {} as Window['novelEngine'],
});
