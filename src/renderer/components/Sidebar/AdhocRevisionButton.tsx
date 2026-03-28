import { useEffect, useState, useCallback } from 'react';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { useFileChangeStore } from '../../stores/fileChangeStore';
import { Tooltip } from '../common/Tooltip';

export function AdhocRevisionButton(): React.ReactElement | null {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const fileRevision = useFileChangeStore((s) => s.revision);
  const [hasPlanFiles, setHasPlanFiles] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Check whether project-tasks.md or revision-prompts.md exist.
  // These are the files the wrangler processes — without them,
  // there is nothing for the revision queue to load.
  useEffect(() => {
    if (!activeSlug) {
      setHasPlanFiles(false);
      return;
    }
    Promise.all([
      window.novelEngine.files.exists(activeSlug, 'source/project-tasks.md'),
      window.novelEngine.files.exists(activeSlug, 'source/revision-prompts.md'),
    ])
      .then(([hasTasks, hasPrompts]) => {
        setHasPlanFiles(hasTasks || hasPrompts);
      })
      .catch(() => setHasPlanFiles(false));
  }, [activeSlug, fileRevision]);

  const handleClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  if (!activeSlug) return null;

  const disabled = !hasPlanFiles || isStreaming;

  return (
    <>
      <Tooltip content="Start a one-off revision session outside the pipeline" placement="right">
      <button
        onClick={() => setIsModalOpen(true)}
        disabled={disabled}
        title={
          !hasPlanFiles
            ? 'No project-tasks.md or revision-prompts.md found — run Forge first'
            : isStreaming
              ? 'Wait for the current stream to finish'
              : 'Open the revision queue'
        }
        className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 text-orange-600 dark:text-orange-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-orange-700 dark:hover:text-orange-300"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path
            fillRule="evenodd"
            d="M14.5 10a4.5 4.5 0 004.284-5.882c-.105-.324-.51-.391-.752-.15L15.34 6.66a.454.454 0 01-.493.101 3.046 3.046 0 01-1.608-1.607.454.454 0 01.1-.493l2.693-2.692c.24-.241.174-.647-.15-.752a4.5 4.5 0 00-5.873 4.575c.055.873-.128 1.808-.8 2.368l-7.23 6.024a2.724 2.724 0 103.837 3.837l6.024-7.23c.56-.672 1.495-.855 2.368-.8.096.007.193.01.291.01zM5 16a1 1 0 11-2 0 1 1 0 012 0z"
            clipRule="evenodd"
          />
        </svg>
        <span>Ad Hoc Revisions</span>
      </button>
      </Tooltip>

      {isModalOpen && (
        <AdhocRevisionModal onClose={handleClose} />
      )}
    </>
  );
}

// ── Large blocking modal wrapping the RevisionQueueView ──────────────
// Lazy-imported to avoid circular deps and keep the button file lean.

import { RevisionQueueView } from '../RevisionQueue/RevisionQueueView';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';

function AdhocRevisionModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const isRunning = useRevisionQueueStore((s) => s.isRunning);

  // Ensure the plan is loaded for this book when the modal opens
  useEffect(() => {
    if (!activeSlug) return;
    const store = useRevisionQueueStore.getState();
    if (!store.plan || store.plan.bookSlug !== activeSlug) {
      store.switchToBook(activeSlug);
    }
  }, [activeSlug]);

  // RevisionQueueView already calls useRevisionQueueEvents() internally

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => {
        if (!isRunning) onClose();
      }}
    >
      <div
        className="flex w-[90vw] max-w-5xl h-[85vh] flex-col rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Ad Hoc Revisions
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Revision queue for the current book
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400 transition-colors ${
              isRunning
                ? 'cursor-not-allowed opacity-30'
                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            ✕
          </button>
        </div>

        {/* Body — full RevisionQueueView */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <RevisionQueueView />
        </div>
      </div>
    </div>
  );
}
