import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookStatus, BookSummary } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChatStore } from '../../stores/chatStore';
import { useViewStore } from '../../stores/viewStore';
import { useFileChangeStore } from '../../stores/fileChangeStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { usePitchShelfStore } from '../../stores/pitchShelfStore';
import { useImportStore } from '../../stores/importStore';
import { useSeriesImportStore } from '../../stores/seriesImportStore';
import { ShelvedPitchesPanel } from './ShelvedPitchesPanel';
import { PitchPreviewModal } from './PitchPreviewModal';
import { ImportWizard } from '../Import/ImportWizard';
import { ImportSeriesWizard } from '../Import/ImportSeriesWizard';
import { SeriesModal } from '../Series/SeriesModal';
import { SeriesGroup } from './SeriesGroup';
import { ImportChoiceModal } from './ImportChoiceModal';
import { Tooltip } from '../common/Tooltip';

const STATUS_COLORS: Record<BookStatus, { bg: string; text: string }> = {
  scaffolded:     { bg: 'bg-zinc-300 dark:bg-zinc-600',    text: 'text-zinc-800 dark:text-zinc-200' },
  outlining:      { bg: 'bg-blue-600',    text: 'text-blue-100' },
  'first-draft':  { bg: 'bg-blue-600',    text: 'text-blue-100' },
  'revision-1':   { bg: 'bg-amber-600',   text: 'text-amber-100' },
  'revision-2':   { bg: 'bg-amber-600',   text: 'text-amber-100' },
  'copy-edit':    { bg: 'bg-purple-600',  text: 'text-purple-100' },
  final:          { bg: 'bg-green-600',   text: 'text-green-100' },
  published:      { bg: 'bg-emerald-600', text: 'text-emerald-100' },
};

const FALLBACK_COLORS = { bg: 'bg-zinc-300 dark:bg-zinc-600', text: 'text-zinc-800 dark:text-zinc-200' };

function StatusBadge({ status }: { status: BookStatus }): React.ReactElement {
  const colors = STATUS_COLORS[status] ?? FALLBACK_COLORS;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text}`}>
      {status}
    </span>
  );
}

function CoverThumbnail({
  slug,
  width,
  height,
  timestamp,
}: {
  slug: string;
  width: number;
  height: number;
  timestamp: number;
}): React.ReactElement {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [slug]);

  if (hasError) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
        style={{ width, height }}
      >
        <span className="text-sm">📖</span>
      </div>
    );
  }

  return (
    <img
      src={`novel-asset://cover/${slug}?t=${timestamp}`}
      alt=""
      className="shrink-0 rounded object-cover"
      style={{ width, height }}
      onError={() => setHasError(true)}
    />
  );
}

function formatWordCount(count: number): string {
  return count.toLocaleString();
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
      <div className="w-80 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-5 shadow-xl">
        <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">New Book</h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Book Title"
            className="no-drag mb-4 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:border-blue-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="no-drag rounded-md px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="no-drag rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
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
      <div className="w-80 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-5 shadow-xl">
        <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Archive Book</h3>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Archive <strong>{bookTitle}</strong>? It will be moved out of your active list but can be restored anytime.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="no-drag rounded-md px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="no-drag rounded-md bg-zinc-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-500"
          >
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}

function ArchivedBooksPanel({
  onBack,
  onBookRestored,
}: {
  onBack: () => void;
  onBookRestored: (slug: string) => Promise<void>;
}): React.ReactElement {
  const { archivedBooks, loadArchivedBooks, unarchiveBook } = useBookStore();
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    loadArchivedBooks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestore = async (slug: string) => {
    setRestoring(slug);
    try {
      await unarchiveBook(slug);
      await onBookRestored(slug);
    } catch {
      // Error already logged in store
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 px-3 py-2">
        <button
          onClick={onBack}
          className="no-drag text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← Back
        </button>
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Archived Books</span>
      </div>

      {archivedBooks.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-zinc-500">
          No archived books
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {archivedBooks.map((book) => (
            <div
              key={book.slug}
              className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-zinc-900 dark:text-zinc-100">{book.title}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <StatusBadge status={book.status} />
                </div>
              </div>
              <button
                onClick={() => handleRestore(book.slug)}
                disabled={restoring === book.slug}
                className="no-drag shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-50"
              >
                {restoring === book.slug ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TOOLBAR_ACTIONS = [
  { id: 'new-book', icon: '+', tooltip: 'New Book' },
  { id: 'shelved', icon: '📋', tooltip: 'Shelved Pitches' },
  { id: 'archived', icon: '📦', tooltip: 'Archived Books' },
  { id: 'series', icon: '📚', tooltip: 'Manage Series' },
  { id: 'import', icon: '⬆️', tooltip: 'Import' },
] as const;

export function BookPanel(): React.ReactElement {
  const {
    books,
    activeSlug,
    totalWordCount,
    loading,
    loadBooks,
    setActiveBook,
    createBook,
    refreshWordCount,
    subscribeToDirectoryChanges,
    uploadCover,
    archiveBook,
    loadArchivedBooks,
  } = useBookStore();
  const { loadPipeline, setDisplayedBook } = usePipelineStore();
  const { loadConversations } = useChatStore();
  const revision = useFileChangeStore((s) => s.revision);
  const importStep = useImportStore((s) => s.step);
  const startImport = useImportStore((s) => s.startImport);
  const seriesImportStep = useSeriesImportStore((s) => s.step);
  const startSeriesImport = useSeriesImportStore((s) => s.startImport);
  const { seriesList, loadSeries, openModal, isModalOpen, selectSeries } = useSeriesStore();

  const [showNewBookModal, setShowNewBookModal] = useState(false);
  const [showShelvedPanel, setShowShelvedPanel] = useState(false);
  const [showArchivedPanel, setShowArchivedPanel] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<BookSummary | null>(null);
  const [coverTimestamp, setCoverTimestamp] = useState(Date.now());
  const [showImportChoice, setShowImportChoice] = useState(false);
  const hasInitialized = useRef(false);

  useEffect(() => {
    loadBooks().then(() => { hasInitialized.current = true; });
    loadArchivedBooks();
    loadSeries();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadSeries();
  }, [books, loadSeries]);

  useEffect(() => {
    return subscribeToDirectoryChanges();
  }, [subscribeToDirectoryChanges]);

  useEffect(() => {
    if (activeSlug) {
      setDisplayedBook(activeSlug);
      refreshWordCount();
      loadPipeline(activeSlug);
      loadConversations(activeSlug);
      setCoverTimestamp(Date.now());
    }
  }, [activeSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hasInitialized.current && revision > 0 && activeSlug) {
      refreshWordCount();
    }
  }, [revision]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const groups = new Map<string, {
      seriesSlug: string;
      seriesName: string;
      volumes: Array<{ volumeNumber: number; book: BookSummary }>;
    }>();
    const standalone: BookSummary[] = [];

    for (const book of books) {
      const seriesInfo = bookToSeries.get(book.slug);
      if (seriesInfo) {
        let group = groups.get(seriesInfo.seriesSlug);
        if (!group) {
          group = {
            seriesSlug: seriesInfo.seriesSlug,
            seriesName: seriesInfo.seriesName,
            volumes: [],
          };
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

  const handleSelectBook = async (slug: string) => {
    if (slug !== activeSlug) {
      await setActiveBook(slug);
    } else {
      const { currentView, navigate } = useViewStore.getState();
      if (currentView === 'pitch-room') {
        navigate('chat');
      }
    }
  };

  const handleCreateBook = async (title: string) => {
    setShowNewBookModal(false);
    try {
      const slug = await createBook(title);
      await setActiveBook(slug);
    } catch {
      // Error already logged in store
    }
  };

  const handleCoverClick = async (slug: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleToolbarAction = (id: string) => {
    switch (id) {
      case 'new-book':
        setShowNewBookModal(true);
        break;
      case 'shelved':
        usePitchShelfStore.getState().loadPitches();
        setShowShelvedPanel(true);
        break;
      case 'archived':
        loadArchivedBooks();
        setShowArchivedPanel(true);
        break;
      case 'series':
        openModal('list');
        break;
      case 'import':
        setShowImportChoice(true);
        break;
    }
  };

  if (loading && books.length === 0) {
    return (
      <div className="px-3 py-3">
        <div className="text-xs text-zinc-500">Loading books…</div>
      </div>
    );
  }

  return (
    <div data-tour="book-selector" className="flex flex-1 flex-col min-h-0">
      <div className="shrink-0 flex items-center justify-center gap-1 border-b border-zinc-200 dark:border-zinc-800 px-2 py-2">
        {TOOLBAR_ACTIONS.map((action) => (
          <Tooltip key={action.id} content={action.tooltip} placement="bottom">
            <button
              onClick={() => handleToolbarAction(action.id)}
              className={`rounded-md p-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors ${
                action.id === 'new-book' ? 'text-base font-bold' : ''
              }`}
            >
              {action.icon}
            </button>
          </Tooltip>
        ))}
      </div>

      {showShelvedPanel ? (
        <ShelvedPitchesPanel
          onBack={() => setShowShelvedPanel(false)}
          onBookRestored={async (slug) => {
            setShowShelvedPanel(false);
            await setActiveBook(slug);
          }}
        />
      ) : showArchivedPanel ? (
        <ArchivedBooksPanel
          onBack={() => setShowArchivedPanel(false)}
          onBookRestored={async (slug) => {
            setShowArchivedPanel(false);
            await setActiveBook(slug);
          }}
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {seriesGroups.map((group) => (
            <SeriesGroup
              key={group.seriesSlug}
              seriesName={group.seriesName}
              seriesSlug={group.seriesSlug}
              volumes={group.volumes}
              activeSlug={activeSlug}
              onSelectBook={handleSelectBook}
              onManageSeries={(slug) => {
                selectSeries(slug).then(() => openModal('edit'));
              }}
            />
          ))}

          {seriesGroups.length > 0 && standaloneBooks.length > 0 && (
            <div className="border-t border-zinc-200 dark:border-zinc-800" />
          )}

          {standaloneBooks.map((book) => {
            const isActive = book.slug === activeSlug;
            return (
              <div
                key={book.slug}
                className={`group/book flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  isActive ? 'bg-orange-50 dark:bg-orange-950/20 border-l-2 border-orange-500' : ''
                }`}
              >
                <button
                  onClick={(e) => handleCoverClick(book.slug, e)}
                  className="group/cover relative shrink-0 cursor-pointer rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <CoverThumbnail slug={book.slug} width={36} height={50} timestamp={coverTimestamp} />
                  <div className="absolute inset-0 flex items-center justify-center rounded bg-black/50 opacity-0 transition-opacity group-hover/cover:opacity-100">
                    <span className="text-xs text-white">📷</span>
                  </div>
                </button>
                <button
                  onClick={() => handleSelectBook(book.slug)}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                >
                  <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {book.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={book.status} />
                    <span className="text-xs text-zinc-500">{formatWordCount(book.wordCount)}w</span>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setArchiveTarget(book);
                  }}
                  title="Archive"
                  className="shrink-0 rounded p-1 text-zinc-400 opacity-0 group-hover/book:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300 transition-opacity"
                >
                  📦
                </button>
              </div>
            );
          })}

          {books.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-zinc-500">No books yet</div>
          )}
        </div>
      )}

      {showNewBookModal && (
        <NewBookModal
          onClose={() => setShowNewBookModal(false)}
          onCreate={handleCreateBook}
        />
      )}

      {archiveTarget && (
        <ArchiveConfirmModal
          bookTitle={archiveTarget.title}
          onClose={() => setArchiveTarget(null)}
          onConfirm={handleArchiveConfirm}
        />
      )}

      <PitchPreviewModal />

      {importStep !== 'idle' && <ImportWizard />}

      {seriesImportStep !== 'idle' && <ImportSeriesWizard />}

      {isModalOpen && <SeriesModal />}

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
