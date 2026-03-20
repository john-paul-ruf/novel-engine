import { useEffect, useRef, useState } from 'react';
import type { BookStatus, BookSummary } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChatStore } from '../../stores/chatStore';

const STATUS_COLORS: Record<BookStatus, { bg: string; text: string }> = {
  scaffolded:     { bg: 'bg-zinc-600',    text: 'text-zinc-200' },
  outlining:      { bg: 'bg-blue-600',    text: 'text-blue-100' },
  'first-draft':  { bg: 'bg-blue-600',    text: 'text-blue-100' },
  'revision-1':   { bg: 'bg-amber-600',   text: 'text-amber-100' },
  'revision-2':   { bg: 'bg-amber-600',   text: 'text-amber-100' },
  'copy-edit':    { bg: 'bg-purple-600',  text: 'text-purple-100' },
  final:          { bg: 'bg-green-600',   text: 'text-green-100' },
  published:      { bg: 'bg-emerald-600', text: 'text-emerald-100' },
};

function StatusBadge({ status }: { status: BookStatus }): React.ReactElement {
  const colors = STATUS_COLORS[status];
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
        className="flex shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-500"
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
      <div className="w-80 rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl">
        <h3 className="mb-4 text-sm font-semibold text-zinc-100">New Book</h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Book Title"
            className="no-drag mb-4 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="no-drag rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200"
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

export function BookSelector(): React.ReactElement {
  const { books, activeSlug, totalWordCount, loading, loadBooks, setActiveBook, createBook, refreshWordCount } = useBookStore();
  const { loadPipeline } = usePipelineStore();
  const { loadConversations } = useChatStore();

  const [isOpen, setIsOpen] = useState(false);
  const [showNewBookModal, setShowNewBookModal] = useState(false);
  const [coverTimestamp, setCoverTimestamp] = useState(Date.now());
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load data on mount
  useEffect(() => {
    loadBooks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // React to active book changes: refresh word count, pipeline, conversations
  useEffect(() => {
    if (activeSlug) {
      refreshWordCount();
      loadPipeline(activeSlug);
      loadConversations(activeSlug);
      setCoverTimestamp(Date.now());
    }
  }, [activeSlug]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (loading && books.length === 0) {
    return (
      <div className="border-b border-zinc-800 px-3 py-3">
        <div className="text-xs text-zinc-500">Loading books…</div>
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative border-b border-zinc-800">
      {/* Closed state — always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="no-drag flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-zinc-800/50"
      >
        {activeBook ? (
          <>
            <CoverThumbnail slug={activeSlug} width={40} height={56} timestamp={coverTimestamp} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-zinc-100">
                {activeBook.title}
              </div>
              <div className="text-sm text-zinc-400">
                {formatWordCount(totalWordCount)} words
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 text-sm text-zinc-400">No book selected</div>
        )}
        <span className={`text-xs text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-40 border-b border-zinc-700 bg-zinc-900 shadow-xl">
          <div className="max-h-64 overflow-y-auto">
            {books.map((book) => (
              <BookDropdownItem
                key={book.slug}
                book={book}
                isActive={book.slug === activeSlug}
                timestamp={coverTimestamp}
                onClick={() => handleSelectBook(book.slug)}
              />
            ))}
          </div>
          <div className="border-t border-zinc-800 p-2">
            <button
              onClick={() => {
                setIsOpen(false);
                setShowNewBookModal(true);
              }}
              className="no-drag flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-blue-400 hover:bg-zinc-800"
            >
              <span>+</span>
              <span>New Book</span>
            </button>
          </div>
        </div>
      )}

      {/* New book modal */}
      {showNewBookModal && (
        <NewBookModal
          onClose={() => setShowNewBookModal(false)}
          onCreate={handleCreateBook}
        />
      )}
    </div>
  );
}

function BookDropdownItem({
  book,
  isActive,
  timestamp,
  onClick,
}: {
  book: BookSummary;
  isActive: boolean;
  timestamp: number;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={`no-drag flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-zinc-800 ${
        isActive ? 'bg-zinc-800/70' : ''
      }`}
    >
      <CoverThumbnail slug={book.slug} width={32} height={44} timestamp={timestamp} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-zinc-100">{book.title}</div>
        <div className="mt-0.5 flex items-center gap-2">
          <StatusBadge status={book.status} />
          <span className="text-xs text-zinc-500">{formatWordCount(book.wordCount)} words</span>
        </div>
      </div>
    </button>
  );
}
