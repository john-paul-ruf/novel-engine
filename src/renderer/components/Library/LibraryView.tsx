import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookSummary } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useImportStore } from '../../stores/importStore';
import { useSeriesImportStore } from '../../stores/seriesImportStore';
import { useViewStore } from '../../stores/viewStore';
import { usePaletteStore } from '../../stores/paletteStore';
import { ImportChoiceModal } from '../Sidebar/ImportChoiceModal';
import { AboutJsonViewer, useOpenSpark } from '../Files/AboutJsonViewer';
import { Icon, type IconName } from '../common/Icon';
import { BookCard } from './BookCard';

// ─── Palette registration (S04 registry) ────────────────────────────────────
// LibraryView is always mounted (hidden-unless-active), so these callbacks are
// assigned on mount and stay live for the whole app lifecycle.

let openNewBookModal: (() => void) | null = null;
let openImportModal: (() => void) | null = null;

usePaletteStore.getState().registerItems([
  {
    id: 'books-new',
    group: 'Books',
    label: 'New Book',
    icon: 'plus',
    keywords: ['create', 'book'],
    run: () => {
      useViewStore.getState().navigate('library');
      openNewBookModal?.();
    },
  },
  {
    id: 'books-import',
    group: 'Books',
    label: 'Import…',
    icon: 'download',
    keywords: ['import', 'manuscript', 'series'],
    run: () => {
      useViewStore.getState().navigate('library');
      openImportModal?.();
    },
  },
]);

usePaletteStore.getState().registerProvider(() =>
  useBookStore.getState().books.map((book) => ({
    id: `book-${book.slug}`,
    group: 'Books' as const,
    label: book.title,
    hint: `${book.wordCount.toLocaleString()} words`,
    icon: 'library' as const,
    keywords: [book.slug, book.status],
    run: async () => {
      const { activeSlug, setActiveBook } = useBookStore.getState();
      if (book.slug !== activeSlug) {
        await setActiveBook(book.slug);
      }
      useViewStore.getState().navigate('workspace');
    },
  })),
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months !== 1 ? 's' : ''} ago`;
}

const SHELF_GRID_CLASS =
  'grid max-w-[1180px] grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-[22px]';

const GHOST_CARD_CLASS =
  'flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[13px] border-[1.5px] border-dashed border-ne-line bg-transparent p-4 text-center text-[12.5px] text-ne-ink-faint transition-colors hover:border-ne-brass hover:bg-ne-brass/5 hover:text-ne-brass-hi';

// ─── Sub-components ──────────────────────────────────────────────────────────

function HeaderAction({
  icon,
  label,
  onClick,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-ne-line bg-ne-bg1 px-3 py-1.5 text-xs text-ne-ink-dim transition-colors hover:border-ne-brass/50 hover:text-ne-ink"
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}

function NewBookModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string) => void;
}): React.ReactElement {
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (trimmed) {
      onCreate(trimmed);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-[13px] border border-ne-line bg-ne-bg1 p-5 shadow-xl">
        <h3 className="mb-4 text-sm font-semibold text-ne-ink">New Book</h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Book Title"
            className="no-drag mb-4 w-full rounded-md border border-ne-line bg-ne-bg2 px-3 py-2 text-sm text-ne-ink placeholder-ne-ink-faint outline-none focus:border-ne-brass"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="no-drag rounded-md px-3 py-1.5 text-sm text-ne-ink-dim hover:text-ne-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="no-drag rounded-md bg-ne-brass px-3 py-1.5 text-sm font-medium text-ne-bg0 hover:bg-ne-brass-hi disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ArchiveConfirmModal({
  bookTitle,
  onClose,
  onConfirm,
}: {
  bookTitle: string;
  onClose: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-[13px] border border-ne-line bg-ne-bg1 p-5 shadow-xl">
        <h3 className="mb-2 text-sm font-semibold text-ne-ink">Archive Book</h3>
        <p className="mb-4 text-sm text-ne-ink-dim">
          Archive <strong className="text-ne-ink">{bookTitle}</strong>? It will be moved out of
          your active list but can be restored anytime.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="no-drag rounded-md px-3 py-1.5 text-sm text-ne-ink-dim hover:text-ne-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="no-drag rounded-md bg-ne-bg3 px-3 py-1.5 text-sm font-medium text-ne-ink hover:bg-ne-line"
          >
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}

/** Archived books list — lifted from BookPanel's ArchivedBooksPanel, as a modal. */
function ArchivedBooksModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const { archivedBooks, loadArchivedBooks, unarchiveBook } = useBookStore();
  const navigate = useViewStore((s) => s.navigate);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    loadArchivedBooks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestore = async (slug: string) => {
    setRestoring(slug);
    try {
      await unarchiveBook(slug); // restores + activates the book
      onClose();
      navigate('library'); // stay on the shelf so the restored book is visible
    } catch {
      // Error already logged in store
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-[420px] flex-col overflow-hidden rounded-[13px] border border-ne-line bg-ne-bg1 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-ne-line px-4 py-2.5">
          <span className="text-sm font-semibold text-ne-ink">Archived Books</span>
          <button onClick={onClose} className="text-ne-ink-faint hover:text-ne-ink" title="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        {archivedBooks.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-ne-ink-faint">No archived books</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {archivedBooks.map((book) => (
              <div key={book.slug} className="flex items-center gap-3 px-4 py-2 hover:bg-ne-bg2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ne-ink">{book.title}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wide text-ne-ink-faint">
                    {book.status}
                  </div>
                </div>
                <button
                  onClick={() => handleRestore(book.slug)}
                  disabled={restoring === book.slug}
                  className="no-drag shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-ne-brass-hi hover:bg-ne-brass-dim disabled:opacity-50"
                >
                  {restoring === book.slug ? 'Restoring…' : 'Restore'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** "Book info" — the existing AboutJsonViewer, hosted in a modal. */
function BookInfoModal({ slug, onClose }: { slug: string; onClose: () => void }): React.ReactElement {
  const openSpark = useOpenSpark(slug);

  const handleEdit = async () => {
    onClose();
    const { activeSlug, setActiveBook } = useBookStore.getState();
    if (slug !== activeSlug) {
      await setActiveBook(slug);
    }
    useViewStore.getState().navigate('files', { filePath: 'about.json', fileViewMode: 'editor' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-[560px] flex-col overflow-hidden rounded-[13px] border border-ne-line bg-ne-bg0 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-ne-line px-4 py-2.5">
          <span className="text-sm font-semibold text-ne-ink">Book info</span>
          <button onClick={onClose} className="text-ne-ink-faint hover:text-ne-ink" title="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <AboutJsonViewer
          bookSlug={slug}
          onEdit={() => {
            void handleEdit();
          }}
          onOpenSpark={() => {
            onClose();
            void openSpark();
          }}
        />
      </div>
    </div>
  );
}

/** "Recent — Verity wrote chapters/… in {book}, 20 minutes ago" */
function RecentLine(): React.ReactElement | null {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const data = useDashboardStore((s) => s.data);

  if (!data || data.bookSlug !== activeSlug) return null;
  const file = data.recentFiles[0];
  if (!file) return null;

  return (
    <div className="mt-11 max-w-[1180px] text-xs text-ne-ink-faint">
      Recent —{' '}
      {data.lastInteraction ? (
        <>
          <b className="font-medium text-ne-ink-dim">{data.lastInteraction.agentName}</b> wrote{' '}
        </>
      ) : (
        'Updated '
      )}
      <b className="font-medium text-ne-ink-dim">{file.path}</b> in {data.bookTitle},{' '}
      {relativeTime(file.modifiedAt)}
    </div>
  );
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function LibraryView(): React.ReactElement {
  const {
    books,
    activeSlug,
    loading,
    loadBooks,
    setActiveBook,
    createBook,
    uploadCover,
    archiveBook,
    loadArchivedBooks,
    subscribeToDirectoryChanges,
  } = useBookStore();
  const { seriesList, loadSeries, openModal, selectSeries } = useSeriesStore();
  const pipelineCache = usePipelineStore((s) => s.cache);
  const loadPipeline = usePipelineStore((s) => s.loadPipeline);
  const navigate = useViewStore((s) => s.navigate);
  const startImport = useImportStore((s) => s.startImport);
  const startSeriesImport = useSeriesImportStore((s) => s.startImport);
  const dashboardLoadedSlug = useDashboardStore((s) => s.loadedSlug);
  const loadDashboard = useDashboardStore((s) => s.load);

  const [showNewBookModal, setShowNewBookModal] = useState(false);
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [showImportChoice, setShowImportChoice] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<BookSummary | null>(null);
  const [infoSlug, setInfoSlug] = useState<string | null>(null);
  const [coverTimestamp, setCoverTimestamp] = useState(Date.now());

  useEffect(() => {
    loadBooks();
    loadSeries();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadSeries();
  }, [books, loadSeries]);

  useEffect(() => {
    return subscribeToDirectoryChanges();
  }, [subscribeToDirectoryChanges]);

  // Fill the per-book pipeline cache so every card can show "Phase N of 14".
  // Already-cached books are skipped; the active book is kept fresh elsewhere.
  useEffect(() => {
    for (const book of books) {
      if (!pipelineCache[book.slug]) {
        void loadPipeline(book.slug);
      }
    }
  }, [books, pipelineCache, loadPipeline]);

  // Dashboard data feeds the "Recent —" line for the active book.
  useEffect(() => {
    if (activeSlug && dashboardLoadedSlug !== activeSlug) {
      void loadDashboard(activeSlug);
    }
  }, [activeSlug, dashboardLoadedSlug, loadDashboard]);

  // Expose modal openers to the palette items registered at module scope.
  useEffect(() => {
    openNewBookModal = () => setShowNewBookModal(true);
    openImportModal = () => setShowImportChoice(true);
    return () => {
      openNewBookModal = null;
      openImportModal = null;
    };
  }, []);

  // Same series grouping as BookPanel builds for Sidebar/SeriesGroup.
  const bookToSeries = useMemo(() => {
    const map = new Map<string, { seriesSlug: string; seriesName: string; volumeNumber: number }>();
    for (const series of seriesList) {
      for (const vol of series.volumes) {
        map.set(vol.bookSlug, {
          seriesSlug: series.slug,
          seriesName: series.name,
          volumeNumber: vol.volumeNumber,
        });
      }
    }
    return map;
  }, [seriesList]);

  const { seriesGroups, standaloneBooks } = useMemo(() => {
    const groups = new Map<
      string,
      { seriesSlug: string; seriesName: string; volumes: Array<{ volumeNumber: number; book: BookSummary }> }
    >();
    const standalone: BookSummary[] = [];

    for (const book of books) {
      const seriesInfo = bookToSeries.get(book.slug);
      if (seriesInfo) {
        let group = groups.get(seriesInfo.seriesSlug);
        if (!group) {
          group = { seriesSlug: seriesInfo.seriesSlug, seriesName: seriesInfo.seriesName, volumes: [] };
          groups.set(seriesInfo.seriesSlug, group);
        }
        group.volumes.push({ volumeNumber: seriesInfo.volumeNumber, book });
      } else {
        standalone.push(book);
      }
    }

    for (const group of groups.values()) {
      group.volumes.sort((a, b) => a.volumeNumber - b.volumeNumber);
    }

    return {
      seriesGroups: Array.from(groups.values()).filter((g) => g.volumes.length > 0),
      standaloneBooks: standalone,
    };
  }, [books, bookToSeries]);

  const totalWords = useMemo(() => books.reduce((sum, b) => sum + b.wordCount, 0), [books]);

  const handleSelectBook = async (slug: string) => {
    if (slug !== useBookStore.getState().activeSlug) {
      await setActiveBook(slug);
    }
    navigate('workspace');
  };

  const handleCreateBook = async (title: string) => {
    setShowNewBookModal(false);
    try {
      const slug = await createBook(title);
      await setActiveBook(slug);
      navigate('workspace');
    } catch {
      // Error already logged in store
    }
  };

  const handleCoverClick = async (slug: string) => {
    const result = await uploadCover(slug);
    if (result) {
      setCoverTimestamp(Date.now());
    }
  };

  const handleArchiveConfirm = async () => {
    if (!archiveTarget) return;
    const slug = archiveTarget.slug;
    setArchiveTarget(null);
    try {
      await archiveBook(slug);
      await loadArchivedBooks();
    } catch {
      // Error already logged in store
    }
  };

  const renderCard = (book: BookSummary, volumeNumber?: number) => (
    <BookCard
      key={book.slug}
      book={book}
      volumeNumber={volumeNumber}
      coverTimestamp={coverTimestamp}
      onSelect={() => void handleSelectBook(book.slug)}
      onChangeCover={() => void handleCoverClick(book.slug)}
      onInfo={() => setInfoSlug(book.slug)}
      onArchive={() => setArchiveTarget(book)}
    />
  );

  return (
    <div className="h-full overflow-y-auto bg-ne-bg0 px-16 py-[52px]">
      {/* Header */}
      <div className="flex max-w-[1180px] items-end justify-between gap-4">
        <div>
          <h1 className="font-ne-serif text-[33px] font-normal tracking-[.005em] text-ne-ink">
            Your bookshelf
          </h1>
          <div className="mt-2 text-[13px] text-ne-ink-faint">
            {books.length} book{books.length !== 1 ? 's' : ''} · {totalWords.toLocaleString()} words
            in production
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <HeaderAction
            icon="history"
            label="Archived"
            onClick={() => {
              loadArchivedBooks();
              setShowArchivedModal(true);
            }}
          />
          <HeaderAction icon="library" label="Manage series" onClick={() => openModal('list')} />
          <HeaderAction icon="download" label="Import" onClick={() => setShowImportChoice(true)} />
        </div>
      </div>

      {loading && books.length === 0 ? (
        <div className="mt-10 text-sm text-ne-ink-faint">Loading books…</div>
      ) : (
        <>
          {/* Shelf — standalone books, ghost cards at grid end */}
          <div className={`mt-[38px] ${SHELF_GRID_CLASS}`}>
            {standaloneBooks.map((book) => renderCard(book))}
            <button onClick={() => setShowNewBookModal(true)} className={GHOST_CARD_CLASS}>
              <Icon name="plus" size={22} strokeWidth={1.6} />
              <b className="text-[13px] font-semibold">New Book</b>
              <span className="max-w-[170px] leading-[1.45]">
                Start from a pitch, an import, or a blank scaffold
              </span>
            </button>
            <button onClick={() => navigate('pitch-room')} className={GHOST_CARD_CLASS}>
              <Icon name="bulb" size={22} strokeWidth={1.6} />
              <b className="text-[13px] font-semibold">Pitch an idea with Spark</b>
              <span className="max-w-[170px] leading-[1.45]">
                Free brainstorming — nothing is committed until you say so
              </span>
            </button>
          </div>

          {/* One titled section per series */}
          {seriesGroups.map((group) => (
            <div key={group.seriesSlug} className="mt-12 max-w-[1180px]">
              <div className="flex items-baseline gap-3">
                <h2 className="font-ne-serif text-xl text-ne-ink">{group.seriesName}</h2>
                <span className="text-[11px] text-ne-ink-faint">
                  {group.volumes.length} volume{group.volumes.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => {
                    void selectSeries(group.seriesSlug).then(() => openModal('edit'));
                  }}
                  className="text-[11px] text-ne-ink-faint transition-colors hover:text-ne-brass-hi"
                >
                  Manage
                </button>
              </div>
              <div className={`mt-4 ${SHELF_GRID_CLASS}`}>
                {group.volumes.map((vol) => renderCard(vol.book, vol.volumeNumber))}
              </div>
            </div>
          ))}

          <RecentLine />
        </>
      )}

      {/* Modals — SeriesModal and the Import/Series wizards stay mounted in
          BookPanel until SESSION-14; the store actions above open them. */}
      {showNewBookModal && (
        <NewBookModal onClose={() => setShowNewBookModal(false)} onCreate={handleCreateBook} />
      )}
      {archiveTarget && (
        <ArchiveConfirmModal
          bookTitle={archiveTarget.title}
          onClose={() => setArchiveTarget(null)}
          onConfirm={() => void handleArchiveConfirm()}
        />
      )}
      {showArchivedModal && <ArchivedBooksModal onClose={() => setShowArchivedModal(false)} />}
      {infoSlug && <BookInfoModal slug={infoSlug} onClose={() => setInfoSlug(null)} />}
      {showImportChoice && (
        <ImportChoiceModal
          onClose={() => setShowImportChoice(false)}
          onImportBook={() => startImport()}
          onImportSeries={() => startSeriesImport()}
        />
      )}
    </div>
  );
}
