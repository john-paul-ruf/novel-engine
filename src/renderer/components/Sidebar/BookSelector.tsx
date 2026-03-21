import { useEffect, useRef, useState } from 'react';
import type { BookStatus, BookSummary } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChatStore } from '../../stores/chatStore';
import { useFileChangeStore } from '../../stores/fileChangeStore';
import { ShelvedPitchesPanel } from './ShelvedPitchesPanel';
import { PitchPreviewModal } from './PitchPreviewModal';
import { usePitchShelfStore } from '../../stores/pitchShelfStore';

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

  // Reset error state when slug changes
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
    <div>
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
        <div className="max-h-64 overflow-y-auto">
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

export function BookSelector(): React.ReactElement {
  const { books, archivedBooks, activeSlug, totalWordCount, loading, loadBooks, setActiveBook, createBook, refreshWordCount, subscribeToDirectoryChanges, uploadCover, archiveBook, loadArchivedBooks } = useBookStore();
  const { loadPipeline, setDisplayedBook } = usePipelineStore();
  const { loadConversations } = useChatStore();
  const revision = useFileChangeStore((s) => s.revision);

  const [isOpen, setIsOpen] = useState(false);
  const [showNewBookModal, setShowNewBookModal] = useState(false);
  const [showPitchShelf, setShowPitchShelf] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<BookSummary | null>(null);
  const [coverTimestamp, setCoverTimestamp] = useState(Date.now());
  const pitchCount = usePitchShelfStore((s) => s.pitches.length);
  const archivedCount = archivedBooks.length;
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  // Load data on mount
  useEffect(() => {
    loadBooks().then(() => { hasInitialized.current = true; });
    loadArchivedBooks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-scan the books list whenever the main process detects a new directory
  // (e.g. the user manually copies a book folder into the books directory)
  useEffect(() => {
    return subscribeToDirectoryChanges();
  }, [subscribeToDirectoryChanges]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to active book changes: refresh word count, pipeline, conversations
  useEffect(() => {
    if (activeSlug) {
      // Instantly swap to cached pipeline for this book (no flash of stale data)
      setDisplayedBook(activeSlug);
      refreshWordCount();
      loadPipeline(activeSlug);
      loadConversations(activeSlug);
      setCoverTimestamp(Date.now());
    }
  }, [activeSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh word count whenever files change on disk (agent writes, manual edits, etc.)
  useEffect(() => {
    if (hasInitialized.current && revision > 0 && activeSlug) {
      refreshWordCount();
    }
  }, [revision]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const activeBook = books.find((b) => b.slug === activeSlug);

  const handleSelectBook = async (slug: string) => {
    setIsOpen(false);
    if (slug !== activeSlug) {
      await setActiveBook(slug);
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

  const handleCoverClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't toggle the dropdown
    if (!activeSlug) return;
    const result = await uploadCover(activeSlug);
    if (result) {
      setCoverTimestamp(Date.now()); // Bust the image cache
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

  if (loading && books.length === 0) {
    return (
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-3 py-3">
        <div className="text-xs text-zinc-500">Loading books…</div>
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative border-b border-zinc-200 dark:border-zinc-800">
      {/* Closed state — always visible */}
      <button
        onClick={() => {
          const opening = !isOpen;
          setIsOpen(opening);
          if (opening) {
            setShowPitchShelf(false);
            setShowArchived(false);
            usePitchShelfStore.getState().loadPitches();
            loadArchivedBooks();
          }
        }}
        className="no-drag flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
      >
        {activeBook ? (
          <>
            <button
              onClick={handleCoverClick}
              title="Change cover image"
              className="group/cover relative shrink-0 cursor-pointer rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <CoverThumbnail slug={activeSlug} width={40} height={56} timestamp={coverTimestamp} />
              <div className="absolute inset-0 flex items-center justify-center rounded bg-black/50 opacity-0 transition-opacity group-hover/cover:opacity-100">
                <span className="text-xs text-white">📷</span>
              </div>
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {activeBook.title}
              </div>
              <div className="text-sm text-zinc-500 dark:text-zinc-400">
                {formatWordCount(totalWordCount)} words
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 text-sm text-zinc-500 dark:text-zinc-400">No book selected</div>
        )}
        <span className={`text-xs text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-40 border-b border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 shadow-xl">
          {showPitchShelf ? (
            <ShelvedPitchesPanel
              onBack={() => setShowPitchShelf(false)}
              onBookRestored={async (slug) => {
                setIsOpen(false);
                setShowPitchShelf(false);
                await setActiveBook(slug);
              }}
            />
          ) : showArchived ? (
            <ArchivedBooksPanel
              onBack={() => setShowArchived(false)}
              onBookRestored={async (slug) => {
                setIsOpen(false);
                setShowArchived(false);
                await setActiveBook(slug);
              }}
            />
          ) : (
            <>
              <div className="max-h-64 overflow-y-auto">
                {books.map((book) => (
                  <BookDropdownItem
                    key={book.slug}
                    book={book}
                    isActive={book.slug === activeSlug}
                    timestamp={coverTimestamp}
                    onClick={() => handleSelectBook(book.slug)}
                    onArchive={() => setArchiveTarget(book)}
                  />
                ))}
              </div>

              {/* Shelved Pitches link */}
              <div className="border-t border-zinc-200 dark:border-zinc-800 p-2">
                <button
                  onClick={() => setShowPitchShelf(true)}
                  className="no-drag flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <span>📋</span>
                  <span>Shelved Pitches</span>
                  {pitchCount > 0 && (
                    <span className="ml-auto rounded-full bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
                      {pitchCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Archived Books link */}
              <div className="border-t border-zinc-200 dark:border-zinc-800 p-2">
                <button
                  onClick={() => setShowArchived(true)}
                  className="no-drag flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <span>📦</span>
                  <span>Archived Books</span>
                  {archivedCount > 0 && (
                    <span className="ml-auto rounded-full bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
                      {archivedCount}
                    </span>
                  )}
                </button>
              </div>

              {/* New Book button */}
              <div className="border-t border-zinc-200 dark:border-zinc-800 p-2">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setShowNewBookModal(true);
                  }}
                  className="no-drag flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <span>+</span>
                  <span>New Book</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* New book modal */}
      {showNewBookModal && (
        <NewBookModal
          onClose={() => setShowNewBookModal(false)}
          onCreate={handleCreateBook}
        />
      )}

      {/* Archive confirmation modal */}
      {archiveTarget && (
        <ArchiveConfirmModal
          bookTitle={archiveTarget.title}
          onClose={() => setArchiveTarget(null)}
          onConfirm={handleArchiveConfirm}
        />
      )}

      {/* Pitch preview modal */}
      <PitchPreviewModal />
    </div>
  );
}

function BookDropdownItem({
  book,
  isActive,
  timestamp,
  onClick,
  onArchive,
}: {
  book: BookSummary;
  isActive: boolean;
  timestamp: number;
  onClick: () => void;
  onArchive: () => void;
}): React.ReactElement {
  return (
    <div
      className={`group/book no-drag flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
        isActive ? 'bg-zinc-200/70 dark:bg-zinc-800/70' : ''
      }`}
    >
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3">
        <CoverThumbnail slug={book.slug} width={32} height={44} timestamp={timestamp} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-zinc-900 dark:text-zinc-100">{book.title}</div>
          <div className="mt-0.5 flex items-center gap-2">
            <StatusBadge status={book.status} />
            <span className="text-xs text-zinc-500">{formatWordCount(book.wordCount)} words</span>
          </div>
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onArchive();
        }}
        title="Archive book"
        className="shrink-0 rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300 group-hover/book:opacity-100"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path d="M2 3a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H2Z" />
          <path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 0 1-1.99 1.79H4.802a2 2 0 0 1-1.99-1.79L2 7.5ZM7 11a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}
