import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookWatcher } from './BookWatcher';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

// Real fs.watch is timing-sensitive: short debounce + vi.waitFor with generous timeouts.
const DEBOUNCE_MS = 100;

let booksDir: string;
let onChange: ReturnType<typeof vi.fn<(paths: string[]) => void>>;
let watcher: BookWatcher;

beforeEach(async () => {
  booksDir = await makeTempDir();
  await mkdir(path.join(booksDir, 'my-book', 'chapters'), { recursive: true });
  onChange = vi.fn();
  watcher = new BookWatcher(booksDir, onChange, DEBOUNCE_MS);
});

afterEach(async () => {
  watcher.stop();
  await cleanupTempDirs();
});

const flushWindow = () => new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS * 3));

/** Attach the watcher, absorb stale FSEvents from test setup, and reset the spy. */
async function startWatching(slug: string): Promise<void> {
  watcher.watch(slug);
  await flushWindow(); // macOS FSEvents can replay pre-attach events after attach
  onChange.mockClear();
}

describe('BookWatcher', () => {
  it('fires one debounced callback with the changed paths', async () => {
    await startWatching('my-book');

    await writeFile(path.join(booksDir, 'my-book', 'chapters', 'draft.md'), 'v1', 'utf-8');

    await vi.waitFor(
      () => {
        expect(onChange).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    const paths = onChange.mock.calls[0][0];
    expect(paths.some((p) => p.includes('draft.md'))).toBe(true);
  });

  it('ignores filesystem noise like .DS_Store', async () => {
    await startWatching('my-book');

    await writeFile(path.join(booksDir, 'my-book', '.DS_Store'), 'junk', 'utf-8');
    await flushWindow();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('stop() suppresses further notifications', async () => {
    await startWatching('my-book');

    watcher.stop();
    await writeFile(path.join(booksDir, 'my-book', 'late.md'), 'x', 'utf-8');
    await flushWindow();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('tolerates empty slugs and nonexistent directories without crashing', async () => {
    expect(() => watcher.watch('')).not.toThrow();
    expect(() => watcher.watch('does-not-exist')).not.toThrow();
    await flushWindow();
    expect(onChange).not.toHaveBeenCalled();
  });
});
