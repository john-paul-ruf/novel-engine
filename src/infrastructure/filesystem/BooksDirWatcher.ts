import { watch, type FSWatcher } from 'node:fs';
import * as fsPromises from 'node:fs/promises';

/**
 * Watches the books root directory for subdirectory additions and removals.
 *
 * Unlike BookWatcher (which watches file changes *within* a single book),
 * this watches the parent `booksDir` so the renderer can refresh its
 * books list whenever a directory is manually added or removed while the
 * app is running.
 *
 * Fires `onChange` at most once per debounce window to prevent UI thrash
 * during bulk copies.
 */
export class BooksDirWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Set of directory names present at last scan. */
  private knownSlugs = new Set<string>();

  private readonly debounceMs: number;

  constructor(
    private readonly booksDir: string,
    private readonly onChange: () => void,
    debounceMs = 800,
  ) {
    this.debounceMs = debounceMs;
  }

  /**
   * Capture the current directory state and start the filesystem watcher.
   * Safe to call multiple times — stops any previous watcher first.
   */
  async start(): Promise<void> {
    this.stop();
    this.knownSlugs = await this.readSlugs();

    try {
      // non-recursive: we only care about direct children (book directories)
      this.watcher = watch(this.booksDir, { recursive: false }, () => {
        this.handleChange();
      });

      this.watcher.on('error', () => {
        // watcher died (e.g., booksDir was deleted) — stop cleanly
        this.stop();
      });
    } catch {
      // booksDir doesn't exist yet — watcher stays null, silently no-op
      this.watcher = null;
    }
  }

  /** Stop the watcher and cancel any pending debounce. Safe to call multiple times. */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.knownSlugs.clear();
  }

  // ── Private ─────────────────────────────────────────────────────

  private handleChange(): void {
    // Debounce — bulk copies fire many events in rapid succession
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;

      const current = await this.readSlugs();
      const added = [...current].some((s) => !this.knownSlugs.has(s));
      const removed = [...this.knownSlugs].some((s) => !current.has(s));

      if (added || removed) {
        this.knownSlugs = current;
        this.onChange();
      }
    }, this.debounceMs);
  }

  /** Read all non-hidden, non-underscore subdirectory names from booksDir. */
  private async readSlugs(): Promise<Set<string>> {
    try {
      const entries = await fsPromises.readdir(this.booksDir, { withFileTypes: true });
      const slugs = new Set<string>();
      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          !entry.name.startsWith('_') &&
          !entry.name.startsWith('.')
        ) {
          slugs.add(entry.name);
        }
      }
      return slugs;
    } catch {
      return new Set();
    }
  }
}
