import { useEffect, useState } from 'react';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { useFileChangeStore } from '../../stores/fileChangeStore';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { Tooltip } from '../common/Tooltip';

/**
 * Open the shared revision queue modal (RevisionQueueModal, mounted in
 * AppLayout) for the active book. Shared by the command palette, the
 * workbench phase-header quick action, and the legacy button below.
 * No-ops when there is no active book.
 */
export function openAdhocRevisions(): void {
  const { activeSlug } = useBookStore.getState();
  if (!activeSlug) return;
  useRevisionQueueStore.getState().openModal(activeSlug);
}

export function AdhocRevisionButton({ compact = false }: { compact?: boolean } = {}): React.ReactElement | null {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const fileRevision = useFileChangeStore((s) => s.revision);
  const [hasPlanFiles, setHasPlanFiles] = useState(false);

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

  if (!activeSlug) return null;

  const disabled = !hasPlanFiles || isStreaming;

  if (compact) {
    return (
      <button
        onClick={openAdhocRevisions}
        disabled={disabled}
        className="no-drag flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-orange-600 dark:text-orange-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-orange-700 dark:hover:text-orange-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
        <span>Ad Hoc Revisions</span>
      </button>
    );
  }

  return (
    <Tooltip content="Start a one-off revision session outside the pipeline" placement="right">
      <button
        onClick={openAdhocRevisions}
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
  );
}
