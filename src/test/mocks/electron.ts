/**
 * Typed mock of every `electron` export Novel Engine imports
 * (main, ipc handlers, notifications, preload).
 *
 * Usage — at the top of a test file, before importing code under test:
 *
 *   vi.mock('electron', () => import('../../test/mocks/electron'));
 *
 * `app.getPath('userData')` returns a temp path; override it per test with
 * `setMockUserDataPath(dir)` (pair with `makeTempDir()` from `src/test/tempDir.ts`).
 */
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';

let userDataPath = path.join(os.tmpdir(), 'novel-engine-test-userdata');

export function setMockUserDataPath(dir: string): void {
  userDataPath = dir;
}

export const app = {
  getPath: vi.fn((name: string): string =>
    name === 'userData' ? userDataPath : path.join(os.tmpdir(), `novel-engine-test-${name}`)
  ),
  getAppPath: vi.fn((): string => process.cwd()),
  isPackaged: false,
  on: vi.fn(),
  quit: vi.fn(),
  whenReady: vi.fn((): Promise<void> => Promise.resolve()),
};

export class BrowserWindow {
  static getAllWindows = vi.fn((): BrowserWindow[] => []);
  static getFocusedWindow = vi.fn((): BrowserWindow | null => null);
  static fromWebContents = vi.fn((): BrowserWindow | null => null);

  webContents = { send: vi.fn() };
  on = vi.fn();
  loadURL = vi.fn((): Promise<void> => Promise.resolve());
  loadFile = vi.fn((): Promise<void> => Promise.resolve());
  isDestroyed = vi.fn((): boolean => false);
  isMinimized = vi.fn((): boolean => false);
  isMaximized = vi.fn((): boolean => false);
  maximize = vi.fn();
  unmaximize = vi.fn();
  minimize = vi.fn();
  restore = vi.fn();
  focus = vi.fn();
}

export class Notification {
  static isSupported = vi.fn((): boolean => true);

  show = vi.fn();
  on = vi.fn();

  constructor(public options: { title?: string; body?: string } = {}) {}
}

export const ipcMain = {
  handle: vi.fn(),
  on: vi.fn(),
};

export const ipcRenderer = {
  invoke: vi.fn((): Promise<unknown> => Promise.resolve(undefined)),
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
};

export const contextBridge = {
  exposeInMainWorld: vi.fn(),
};

export const dialog = {
  showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] as string[] })),
  showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: undefined as string | undefined })),
};

export const shell = {
  openExternal: vi.fn((): Promise<void> => Promise.resolve()),
  openPath: vi.fn((): Promise<string> => Promise.resolve('')),
};

export const nativeTheme = {
  shouldUseDarkColors: false,
  themeSource: 'system' as 'system' | 'light' | 'dark',
};

export const protocol = {
  handle: vi.fn(),
  registerSchemesAsPrivileged: vi.fn(),
};

export const net = {
  fetch: vi.fn((): Promise<Response> => Promise.resolve(new Response())),
};
