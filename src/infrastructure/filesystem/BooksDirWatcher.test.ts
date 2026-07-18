import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BooksDirWatcher } from './BooksDirWatcher';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

const DEBOUNCE_MS = 100;

let booksDir: string;
let onChange: ReturnType<typeof vi.fn<() => void>>;
let watcher: BooksDirWatcher;

beforeEach(async () => {
  booksDir = await makeTempDir();
  onChange = vi.fn();
  watcher = new BooksDirWatcher(booksDir, onChange, DEBOUNCE_MS);
});

afterEach(async () => {
  watcher.stop();
  await cleanupTempDirs();
});

const flushWindow = () => new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS * 3));

describe('BooksDirWatcher', () => {
  it('fires when a book directory is added', async () => {
    await watcher.start();

    await mkdir(path.join(booksDir, 'new-book'));

    await vi.waitFor(
      () => {
        expect(onChange).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  it('fires when a book directory is removed', async () => {
    await mkdir(path.join(booksDir, 'doomed-book'));
    await watcher.start();

    await rm(path.join(booksDir, 'doomed-book'), { recursive: true });

    await vi.waitFor(
      () => {
        expect(onChange).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  it('ignores underscore/hidden directories and plain files', async () => {
    await watcher.start();

    await mkdir(path.join(booksDir, '_archived'));
    await mkdir(path.join(booksDir, '.hidden'));
    await writeFile(path.join(booksDir, 'stray.txt'), 'x', 'utf-8');
    await flushWindow();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('stop() suppresses further notifications', async () => {
    await watcher.start();
    watcher.stop();

    await mkdir(path.join(booksDir, 'after-stop'));
    await flushWindow();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('starting on a nonexistent directory is a silent no-op', async () => {
    const ghost = new BooksDirWatcher(path.join(booksDir, 'ghost'), onChange, DEBOUNCE_MS);
    await expect(ghost.start()).resolves.toBeUndefined();
    ghost.stop();
    expect(onChange).not.toHaveBeenCalled();
  });
});
