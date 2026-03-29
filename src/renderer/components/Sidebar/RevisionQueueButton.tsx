import { useEffect, useState } from 'react';
import { useBookStore } from '../../stores/bookStore';
import { useFileChangeStore } from '../../stores/fileChangeStore';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { Tooltip } from '../common/Tooltip';

export function RevisionQueueButton() {
  const { activeSlug } = useBookStore();
  const openModal = useRevisionQueueStore((s) => s.openModal);
  const isModalOpen = useRevisionQueueStore((s) => s.isModalOpen);
  const modalBookSlug = useRevisionQueueStore((s) => s.modalBookSlug);
  const fileRevision = useFileChangeStore((s) => s.revision);
  const [hasRevisionPlan, setHasRevisionPlan] = useState(false);

  // Read running/progress state from the revision queue store
  const isRunning = useRevisionQueueStore((s) => s.isRunning);
  const plan = useRevisionQueueStore((s) => s.plan);
  const gateSessionId = useRevisionQueueStore((s) => s.gateSessionId);

  // Only show running indicator if this plan belongs to the currently active book
  const isActiveBookRunning = isRunning && plan?.bookSlug === activeSlug;
  const isWaitingForApproval = gateSessionId !== null && plan?.bookSlug === activeSlug;

  // Compute progress counts
  const sessionsApproved = plan?.sessions.filter(s => s.status === 'approved').length ?? 0;
  const totalSessions = plan?.sessions.length ?? 0;
  const hasPlan = plan !== null && plan.bookSlug === activeSlug;

  useEffect(() => {
    if (!activeSlug) {
      setHasRevisionPlan(false);
      return;
    }

    // Show the button only when there are active (non-archived) plan files to
    // work with right now.  project-tasks-v1.md is intentionally excluded: it
    // persists after the first queue is archived and would keep the button
    // visible during second-read / second-assessment / copy-edit, where no
    // loadable plan exists yet.
    //
    // First revision cycle:  button visible while project-tasks.md / revision-prompts.md exist
    // Gap (second-read → copy-edit): button hidden (live files were archived)
    // Second revision cycle: button visible once Forge regenerates both files for revision-plan-2
    //
    // Re-checks on file changes (fileRevision) so the button appears/disappears
    // after Forge generates new files or after queue archival deletes them.
    Promise.all([
      window.novelEngine.files.exists(activeSlug, 'source/project-tasks.md'),
      window.novelEngine.files.exists(activeSlug, 'source/revision-prompts.md'),
    ]).then(([hasTasks, hasPrompts]) => {
      setHasRevisionPlan(hasTasks || hasPrompts);
    });
  }, [activeSlug, fileRevision]);

  if (!hasRevisionPlan) return null;

  return (
    <Tooltip content="Open the automated revision queue" placement="right">
    <button
      onClick={() => openModal(activeSlug)}
      className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
        isModalOpen && modalBookSlug === activeSlug
          ? 'text-orange-300 bg-zinc-200/70 dark:bg-zinc-800/70'
          : isWaitingForApproval
          ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20'
          : isActiveBookRunning
          ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20'
          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
      }`}
    >
      {/* Icon — animated when running, pulsing when awaiting approval */}
      {isActiveBookRunning ? (
        <span className="relative flex h-4 w-4 items-center justify-center shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-40" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
        </span>
      ) : isWaitingForApproval ? (
        <span className="relative flex h-4 w-4 items-center justify-center shrink-0">
          <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-amber-400 opacity-40" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
        </span>
      ) : (
        <span className="text-orange-600 dark:text-orange-400">&#9881;</span>
      )}

      <span className="flex-1 text-left">Revision Queue</span>

      {/* Progress badge — shows session count when plan is loaded */}
      {hasPlan && totalSessions > 0 && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
          isActiveBookRunning
            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
            : isWaitingForApproval
            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
            : sessionsApproved === totalSessions
            ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
            : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
        }`}>
          {sessionsApproved}/{totalSessions}
        </span>
      )}
    </button>
    </Tooltip>
  );
}
