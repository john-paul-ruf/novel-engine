import { useEffect, useState } from 'react';
import type { PhaseStatus, PipelinePhase, PipelinePhaseId } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useViewStore } from '../../stores/viewStore';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';

/**
 * Phases that have dedicated completion controls — the generic "Done" button
 * is hidden for these to avoid duplicating the specialised UX.
 *
 * - `build`    → has its own Build view triggered by the "Build" action button
 * - `revision` → has the "Complete Revision" sub-button which archives reports
 */
const SKIP_DONE_BUTTON_PHASES: ReadonlySet<PipelinePhaseId> = new Set([
  'build',
  'revision',
]);

function StatusIcon({ status }: { status: PhaseStatus }): React.ReactElement {
  switch (status) {
    case 'complete':
      return (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-[10px] font-bold text-white">
          ✓
        </div>
      );
    case 'pending-completion':
      // Amber pulsing dot: "agent finished — awaiting your confirmation"
      return (
        <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <div className="absolute h-5 w-5 animate-ping rounded-full bg-amber-500 opacity-30" />
          <div className="h-3 w-3 rounded-full bg-amber-500" />
        </div>
      );
    case 'active':
      return (
        <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <div className="absolute h-5 w-5 animate-ping rounded-full bg-blue-500 opacity-30" />
          <div className="h-3 w-3 rounded-full bg-blue-500" />
        </div>
      );
    case 'locked':
      return (
        <div className="h-5 w-5 shrink-0 rounded-full border-2 border-zinc-300 dark:border-zinc-600" />
      );
  }
}

function ConnectingLine({
  fromStatus,
  toStatus,
}: {
  fromStatus: PhaseStatus;
  toStatus: PhaseStatus;
}): React.ReactElement {
  let color = 'bg-zinc-200 dark:bg-zinc-700';
  if (fromStatus === 'complete' && toStatus === 'complete') {
    color = 'bg-green-600';
  } else if (fromStatus === 'complete' && toStatus === 'active') {
    color = 'bg-blue-500';
  } else if (fromStatus === 'complete' && toStatus === 'pending-completion') {
    // Completed work awaiting user sign-off
    color = 'bg-amber-500';
  }

  return <div className={`ml-[9px] h-4 w-0.5 ${color}`} />;
}

/**
 * Phases that own the revision queue UI.
 *
 * The `revision` phase uses the first revision queue (structural fixes).
 * The `mechanical-fixes` phase uses the second revision queue (copy-level fixes).
 * Both phases show the "Revision Queue" sub-button and route clicks to
 * the revision queue view rather than opening a bare agent conversation.
 */
const REVISION_QUEUE_PHASES: ReadonlySet<PipelinePhaseId> = new Set([
  'revision',
  'mechanical-fixes',
]);

export function PipelineTracker(): React.ReactElement {
  const { phases, markPhaseComplete, completeRevision, confirmPhaseAdvancement } = usePipelineStore();
  const { activeSlug } = useBookStore();
  const { conversations, createConversation, setActiveConversation } = useChatStore();
  const { navigate, currentView } = useViewStore();
  const { isLoading: revisionLoading, isRunning: revisionRunning, activeSessionId: revisionActiveSession } = useRevisionQueueStore();
  const [isBuildingForQuill, setIsBuildingForQuill] = useState(false);
  const [buildForQuillError, setBuildForQuillError] = useState<string | null>(null);
  const [confirmingComplete, setConfirmingComplete] = useState<PipelinePhaseId | null>(null);
  const [markCompleteError, setMarkCompleteError] = useState<string | null>(null);
  const [hasRevisionPlan, setHasRevisionPlan] = useState(false);
  const [confirmingRevisionComplete, setConfirmingRevisionComplete] = useState(false);
  const [revisionCompleteError, setRevisionCompleteError] = useState<string | null>(null);
  const [advancementError, setAdvancementError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSlug) {
      setHasRevisionPlan(false);
      return;
    }
    Promise.all([
      window.novelEngine.files.exists(activeSlug, 'source/project-tasks.md'),
      window.novelEngine.files.exists(activeSlug, 'source/revision-prompts.md'),
    ]).then(([hasTasks, hasPrompts]) => {
      setHasRevisionPlan(hasTasks || hasPrompts);
    });
  }, [activeSlug, phases]);

  if (!activeSlug || phases.length === 0) {
    return (
      <div className="px-3 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Pipeline</div>
        <div className="mt-1 text-xs text-zinc-500">No book selected</div>
      </div>
    );
  }

  const openOrCreateConversation = async (phase: PipelinePhase) => {
    if (!phase.agent) return;

    // Find existing conversation for this agent + phase
    const existing = conversations.find(
      (c) => c.agentName === phase.agent && c.pipelinePhase === phase.id
    );

    if (existing) {
      await setActiveConversation(existing.id);
    } else {
      await createConversation(phase.agent, activeSlug, phase.id);
    }
    navigate('chat');
  };

  const handlePhaseClick = async (phase: PipelinePhase) => {
    // Build is always navigable — you can preview the manuscript at any writing
    // stage, not just when the formal build phase is unlocked.
    if (phase.id === 'build') {
      navigate('build');
      return;
    }

    // Locked phases are not interactive
    if (phase.status === 'locked') return;

    // Revision queue phases — clicking them opens the queue, not a bare agent conversation
    if (REVISION_QUEUE_PHASES.has(phase.id) && hasRevisionPlan) {
      navigate('revision-queue');
      return;
    }

    // Quill (publish) — auto-run build if artifacts are missing
    if (phase.id === 'publish') {
      const ready = await ensureBuildForQuill();
      if (!ready) return;
    }

    // Both 'active' and 'pending-completion' phases open the agent conversation.
    // A pending-completion phase is still navigable so the author can review the output.
    await openOrCreateConversation(phase);
  };

  /**
   * Ensure build artifacts exist before opening a Quill conversation.
   *
   * This is the ONLY place in the app where a build is automatically forced.
   * If `dist/output.md` doesn't exist, the build runs inline before Quill opens.
   * Returns true if we can proceed to Quill, false if build failed.
   */
  const ensureBuildForQuill = async (): Promise<boolean> => {
    try {
      const exists = await window.novelEngine.files.exists(activeSlug, 'dist/output.md');
      if (exists) return true;
    } catch {
      // If the existence check fails, proceed — the build will surface any real error
    }

    // Build artifacts don't exist — auto-run the build
    setIsBuildingForQuill(true);
    setBuildForQuillError(null);
    try {
      const result = await window.novelEngine.build.run(activeSlug);
      const allFailed = result.formats.length > 0 && result.formats.every((f) => !!f.error);
      if (allFailed) {
        setBuildForQuillError('Build failed — check the Build view for details.');
        setTimeout(() => setBuildForQuillError(null), 6000);
        return false;
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Build failed';
      setBuildForQuillError(msg);
      setTimeout(() => setBuildForQuillError(null), 6000);
      return false;
    } finally {
      setIsBuildingForQuill(false);
    }
  };

  const handleStartClick = async (phase: PipelinePhase) => {
    if (phase.id === 'build') {
      navigate('build');
      return;
    }

    // Revision queue phases — Start button opens the queue
    if (REVISION_QUEUE_PHASES.has(phase.id) && hasRevisionPlan) {
      navigate('revision-queue');
      return;
    }

    // Quill (publish) — the only agent that requires build artifacts.
    // Auto-run the build if needed before opening the conversation.
    if (phase.id === 'publish') {
      const ready = await ensureBuildForQuill();
      if (!ready) return;
    }

    await openOrCreateConversation(phase);
  };

  const handleMarkComplete = async (phaseId: PipelinePhaseId) => {
    if (confirmingComplete === phaseId) {
      // Second click = confirm
      try {
        setMarkCompleteError(null);
        await markPhaseComplete(activeSlug, phaseId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setMarkCompleteError(msg);
        setTimeout(() => setMarkCompleteError(null), 6000);
      }
      setConfirmingComplete(null);
    } else {
      // First click = enter confirmation state
      setConfirmingComplete(phaseId);
      // Auto-cancel after 4 seconds
      setTimeout(() => setConfirmingComplete((prev) => (prev === phaseId ? null : prev)), 4000);
    }
  };

  const handleCompleteRevision = async () => {
    if (confirmingRevisionComplete) {
      // Second click = confirm — archive the reports
      try {
        setRevisionCompleteError(null);
        await completeRevision(activeSlug);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setRevisionCompleteError(msg);
        setTimeout(() => setRevisionCompleteError(null), 6000);
      }
      setConfirmingRevisionComplete(false);
    } else {
      // First click = enter confirmation state
      setConfirmingRevisionComplete(true);
      setTimeout(() => setConfirmingRevisionComplete(false), 4000);
    }
  };

  /**
   * Confirm the user is ready to advance the pipeline past a 'pending-completion' phase.
   *
   * Single-click — no double-confirmation needed. The "Advance →" button label
   * already makes the intent clear, and advancing is not destructive (the user
   * can still open the conversation and iterate after confirming).
   */
  const handleConfirmAdvancement = async (phaseId: PipelinePhaseId) => {
    try {
      setAdvancementError(null);
      await confirmPhaseAdvancement(activeSlug, phaseId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setAdvancementError(msg);
      setTimeout(() => setAdvancementError(null), 6000);
    }
  };

  return (
    <div className="px-3 py-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
        Pipeline
      </div>
      {buildForQuillError && (
        <div className="mb-2 rounded bg-red-950 px-2 py-1.5 text-[10px] text-red-300">
          {buildForQuillError}
        </div>
      )}
      {markCompleteError && (
        <div className="mb-2 rounded bg-red-950 px-2 py-1.5 text-[10px] text-red-300">
          {markCompleteError}
        </div>
      )}
      {revisionCompleteError && (
        <div className="mb-2 rounded bg-red-950 px-2 py-1.5 text-[10px] text-red-300">
          {revisionCompleteError}
        </div>
      )}
      {advancementError && (
        <div className="mb-2 rounded bg-red-950 px-2 py-1.5 text-[10px] text-red-300">
          {advancementError}
        </div>
      )}
      <div>
        {phases.map((phase, index) => {
          // Show the revision queue sub-button under both revision queue phases.
          // This covers:
          //   - `revision`        → first revision queue (structural fixes)
          //   - `mechanical-fixes` → second revision queue (copy-level fixes)
          const showRevisionSub =
            hasRevisionPlan &&
            REVISION_QUEUE_PHASES.has(phase.id) &&
            phase.status !== 'locked';

          // Show "Complete Revision" only when the `revision` phase is active or
          // pending-completion and the queue isn't running.
          // The mechanical-fixes phase does not need this — it uses the queue's own archive step.
          const showCompleteRevision =
            phase.id === 'revision' &&
            (phase.status === 'active' || phase.status === 'pending-completion') &&
            !(revisionRunning && !!revisionActiveSession);

          return (
            <div key={phase.id}>
              <PhaseRow
                phase={phase}
                onPhaseClick={() => handlePhaseClick(phase)}
                onStartClick={() => handleStartClick(phase)}
                showMarkComplete={
                  phase.status === 'active' && !SKIP_DONE_BUTTON_PHASES.has(phase.id)
                }
                isConfirmingComplete={confirmingComplete === phase.id}
                onMarkComplete={() => handleMarkComplete(phase.id)}
                isBuildingForQuill={phase.id === 'publish' && isBuildingForQuill}
                showConfirmAdvancement={phase.status === 'pending-completion'}
                onConfirmAdvancement={() => handleConfirmAdvancement(phase.id)}
              />
              {showRevisionSub && (
                <RevisionQueueSubButton
                  isActive={currentView === 'revision-queue'}
                  isRunning={revisionLoading || (revisionRunning && !!revisionActiveSession)}
                  onClick={() => navigate('revision-queue')}
                />
              )}
              {showCompleteRevision && (
                <CompleteRevisionSubButton
                  isConfirming={confirmingRevisionComplete}
                  onClick={handleCompleteRevision}
                />
              )}
              {index < phases.length - 1 && (
                <ConnectingLine
                  fromStatus={phase.status}
                  toStatus={phases[index + 1].status}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RevisionQueueSubButton({
  isActive,
  isRunning,
  onClick,
}: {
  isActive: boolean;
  isRunning: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={`ml-7 flex w-[calc(100%-1.75rem)] items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
        isActive
          ? 'bg-orange-500/15 text-orange-400'
          : 'text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-orange-400'
      }`}
    >
      {isRunning ? (
        <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
          <span className="absolute h-3 w-3 animate-ping rounded-full bg-orange-500 opacity-40" />
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
        </span>
      ) : (
        <span className="text-orange-500 text-xs">⚙</span>
      )}
      <span>Revision Queue</span>
      {isRunning && (
        <span className="ml-auto text-[9px] text-orange-400/80 animate-pulse">
          working…
        </span>
      )}
    </button>
  );
}

function CompleteRevisionSubButton({
  isConfirming,
  onClick,
}: {
  isConfirming: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={`ml-7 flex w-[calc(100%-1.75rem)] items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
        isConfirming
          ? 'bg-green-600/20 text-green-400'
          : 'text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-green-400'
      }`}
      title={
        isConfirming
          ? 'Click again to archive reports and advance to Second Read'
          : 'Archive revision reports and advance the pipeline to Second Read'
      }
    >
      <span className="text-green-500 text-xs">✓</span>
      <span>{isConfirming ? 'Confirm complete?' : 'Complete Revision'}</span>
    </button>
  );
}

function PhaseRow({
  phase,
  onPhaseClick,
  onStartClick,
  showMarkComplete,
  isConfirmingComplete,
  onMarkComplete,
  isBuildingForQuill = false,
  showConfirmAdvancement,
  onConfirmAdvancement,
}: {
  phase: PipelinePhase;
  onPhaseClick: () => void;
  onStartClick: () => void;
  showMarkComplete: boolean;
  isConfirmingComplete: boolean;
  onMarkComplete: () => void;
  isBuildingForQuill?: boolean;
  /** Show the "Advance →" button — only true when status is 'pending-completion'. */
  showConfirmAdvancement: boolean;
  onConfirmAdvancement: () => void;
}): React.ReactElement {
  const isBuildPhase = phase.id === 'build';
  const isPendingCompletion = phase.status === 'pending-completion';
  // Build is always interactive regardless of its locked/active/complete status.
  // pending-completion phases are also clickable (user can review the agent's output).
  // All other phases follow the normal locked → grayed-out, un-clickable rule.
  const isClickable = isBuildPhase || isPendingCompletion || (phase.status !== 'locked' && !isBuildingForQuill);
  const isActive = phase.status === 'active';
  const dimmed = !isBuildPhase && phase.status === 'locked';

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-1 py-1 ${
        isClickable
          ? 'cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
          : 'cursor-default'
      } ${dimmed ? 'opacity-60' : ''}`}
      onClick={onPhaseClick}
      title={
        phase.status === 'locked' && !isBuildPhase
          ? 'Complete the previous phase first'
          : isPendingCompletion
          ? `${phase.label} — agent finished. Click "Advance →" when you're ready to move on.`
          : phase.description
      }
    >
      <StatusIcon status={phase.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-zinc-800 dark:text-zinc-200">{phase.label}</div>
        {phase.agent && (
          <div className={`truncate text-[10px] ${isPendingCompletion ? 'text-amber-500/80' : 'text-zinc-500'}`}>
            {isPendingCompletion ? 'ready to advance' : phase.agent}
          </div>
        )}
      </div>
      {/* Action buttons — shown based on phase status */}
      <div className="flex shrink-0 items-center gap-1">
        {/* "Done" manual-completion button — only for active non-gated phases */}
        {showMarkComplete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkComplete();
            }}
            className={`no-drag rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
              isConfirmingComplete
                ? 'bg-green-600 text-white hover:bg-green-500'
                : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:hover:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
            }`}
            title={isConfirmingComplete ? 'Click again to confirm' : 'Mark this phase as complete'}
          >
            {isConfirmingComplete ? 'Confirm?' : 'Done'}
          </button>
        )}
        {/* "Advance →" confirmation button — only for pending-completion phases */}
        {showConfirmAdvancement && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConfirmAdvancement();
            }}
            className="no-drag shrink-0 rounded bg-amber-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-amber-500 transition-colors"
            title="Confirm you're ready to advance the pipeline to the next phase"
          >
            Advance →
          </button>
        )}
        {/* "Start" / "Build" action button — only for active phases and the build phase */}
        {(isActive || isBuildPhase) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isBuildingForQuill) onStartClick();
            }}
            disabled={isBuildingForQuill}
            className="no-drag shrink-0 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBuildingForQuill ? 'Building…' : isBuildPhase ? 'Build' : 'Start'}
          </button>
        )}
      </div>
    </div>
  );
}
