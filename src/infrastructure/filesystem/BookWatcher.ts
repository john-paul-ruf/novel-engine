import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

/**
 * Watches the active book's directory for file changes using Node's built-in
 * `fs.watch` with recursive mode. Debounces rapid changes (common during
 * agent file writes) into a single notification.
 *
 * This solves the "files tab doesn't update until refresh" problem by providing
 * a reliable file change signal regardless of how files were modified — whether
 * by the Claude CLI, external editors, or manual filesystem operations.
 */
export class BookWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private changedFiles = new Set<string>();

  /** Debounce window in ms — batches rapid changes into one notification. */
  private readonly debounceMs: number;

  constructor(
    private booksDir: string,
    private onChange: (paths: string[]) => void,
    debounceMs = 500,
  ) {
    this.debounceMs = debounceMs;
  }

  /**
   * Start watching a book directory. Closes any previous watcher first.
   * If `bookSlug` is empty, just stops watching.
   */
  watch(bookSlug: string): void {
    this.stop();

    if (!bookSlug) return;

    const bookDir = path.join(this.booksDir, bookSlug);

    try {
      this.watcher = watch(bookDir, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;

        // Ignore common noise: .DS_Store, temporary editor files, sqlite journals
        if (this.isIgnored(filename)) return;

        this.changedFiles.add(filename);
        this.scheduleNotification();
      });

      // fs.watch can emit 'error' when the directory doesn't exist yet
      this.watcher.on('error', () => {
        this.stop();
      });
    } catch {
      // Directory may not exist yet (new book, pre-bootstrap) — silently ignore
      this.watcher = null;
    }
  }

  /** Stop watching. Safe to call multiple times. */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.changedFiles.clear();
  }

  /**
   * Schedule a debounced notification. Resets the timer on each call so that
   * rapid file writes (e.g., agent writing 5 files in quick succession) are
   * batched into a single UI update.
   */
  private scheduleNotification(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      const paths = [...this.changedFiles];
      this.changedFiles.clear();

      if (paths.length > 0) {
        this.onChange(paths);
      }
    }, this.debounceMs);
  }

  /** Filter out filesystem noise that shouldn't trigger UI updates. */
  private isIgnored(filename: string): boolean {
    const base = path.basename(filename);
    return (
      base === '.DS_Store' ||
      base.endsWith('.swp') ||
      base.endsWith('.tmp') ||
      base.endsWith('~') ||
      base.startsWith('.#') ||
      base === 'Thumbs.db' ||
      base.endsWith('-journal') ||
      base.endsWith('-wal') ||
      base.endsWith('-shm')
    );
  }
}
