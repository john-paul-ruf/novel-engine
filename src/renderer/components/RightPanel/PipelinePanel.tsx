import { useEffect, useRef, useState } from 'react';
import { useResizeHandle } from '../../hooks/useResizeHandle';
import { ResizeHandle } from '../Layout/ResizeHandle';
import { PipelineTracker } from '../Sidebar/PipelineTracker';
import { useRightPanelStore } from '../../stores/rightPanelStore';
import { useBookStore } from '../../stores/bookStore';

const PIPELINE_PANEL_DEFAULT = 300;
const PIPELINE_PANEL_MIN = 220;
const PIPELINE_PANEL_MAX = 480;

/**
 * Inline modal for creating a new book. Mirrors NewBookModal in BookSelector
 * but is self-contained so PipelinePanel has no cross-component dependency.
 */
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
    if (trimmed) onCreate(trimmed);
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

/**
 * "+ New Book" button in the Pipeline panel header.
 * Manages its own modal state and delegates creation to useBookStore.
 */
function NewBookButton(): React.ReactElement {
  const [showModal, setShowModal] = useState(false);
  const { createBook, setActiveBook } = useBookStore();

  const handleCreate = async (title: string) => {
    setShowModal(false);
    try {
      const slug = await createBook(title);
      await setActiveBook(slug);
    } catch {
      // Error already logged in the store
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200"
        title="Create a new book"
      >
        + New Book
      </button>
      {showModal && (
        <NewBookModal onClose={() => setShowModal(false)} onCreate={handleCreate} />
      )}
    </>
  );
}

/**
 * Independent right-side column housing the PipelineTracker.
 * Mirrors the CliActivityPanel column pattern: own width, own left-edge resize handle.
 * Controlled by useRightPanelStore.pipelineOpen.
 */
export function PipelinePanel(): React.ReactElement {
  const { width, isDragging, onMouseDown, resetWidth } = useResizeHandle({
    direction: 'right', // handle on left edge: dragging left = wider
    initialWidth: PIPELINE_PANEL_DEFAULT,
    minWidth: PIPELINE_PANEL_MIN,
    maxWidth: PIPELINE_PANEL_MAX,
    storageKey: 'novel-engine:pipeline-panel-width',
  });

  return (
    <div
      data-tour="pipeline-panel"
      className="relative flex h-full shrink-0 flex-col border-l border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-300 dark:border-zinc-700 px-3 py-2">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Pipeline</span>
        <div className="flex items-center gap-1">
          <NewBookButton />
          <button
            onClick={() => useRightPanelStore.getState().closePipeline()}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300"
            title="Close pipeline"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content — fills remaining height */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PipelineTracker />
      </div>

      {/* Left-edge drag handle for horizontal resize */}
      <ResizeHandle
        side="left"
        isDragging={isDragging}
        onMouseDown={onMouseDown}
        onDoubleClick={resetWidth}
      />
    </div>
  );
}
