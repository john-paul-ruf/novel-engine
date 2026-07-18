import '@testing-library/jest-dom/vitest';

// Placeholder bridge so renderer code can reference window.novelEngine without
// crashing at import time. Tests that exercise the bridge must install their
// own typed mock (SESSION-22 adds the shared mock factory).
Object.defineProperty(window, 'novelEngine', {
  writable: true,
  configurable: true,
  value: {} as Window['novelEngine'],
});
