import { useCallback, useEffect, useRef, useState } from 'react';
import type { PhaseStatus, PipelinePhase, PipelinePhaseId } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useViewStore } from '../../stores/viewStore';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { useAutoDraftStore } from '../../stores/autoDraftStore';

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
  const { phases, markPhaseComplete, completeRevision, confirmPhaseAdvancement, revertPhase } = usePipelineStore();
  const { activeSlug } = useBookStore();
  const { conversations, createConversation, setActiveConversation } = useChatStore();
  const { navigate, currentView } = useViewStore();
  const { isLoading: revisionLoadingGlobal, isRunning: revisionRunningGlobal, activeSessionId: revisionActiveSession, plan: revisionPlan } = useRevisionQueueStore();

  // Only show revision queue state for the currently displayed book
  const revisionIsForCurrentBook = revisionPlan?.bookSlug === activeSlug;
  const revisionLoading = revisionLoadingGlobal && revisionIsForCurrentBook;
  const revisionRunning = revisionRunningGlobal && revisionIsForCurrentBook;
  const { sessions, start: autoDraftStart, stop: autoDraftStop, resume: autoDraftResume, reset: autoDraftReset } = useAutoDraftStore();

  // Read per-book auto-draft session for the currently displayed book
  const autoDraftSession = activeSlug ? sessions[activeSlug] ?? null : null;
  const autoDraftRunning = autoDraftSession?.isRunning ?? false;
  const autoDraftPaused = autoDraftSession?.isPaused ?? false;
  const autoDraftPauseReason = autoDraftSession?.pauseReason ?? null;
  const autoDraftChapters = autoDraftSession?.chaptersWritten ?? 0;
  const autoDraftStageLabel = autoDraftSession?.stageLabel ?? null;
  const autoDraftError = autoDraftSession?.error ?? null;
  const [isBuildingForQuill, setIsBuildingForQuill] = useState(false);
  const [buildForQuillError, setBuildForQuillError] = useState<string | null>(null);
  const [manualOverridePhase, setManualOverridePhase] = useState<PipelinePhaseId | null>(null);
  const [markCompleteError, setMarkCompleteError] = useState<string | null>(null);
  const [hasRevisionPlan, setHasRevisionPlan] = useState(false);
  const [confirmingRevisionComplete, setConfirmingRevisionComplete] = useState(false);
  const [revisionCompleteError, setRevisionCompleteError] = useState<string | null>(null);
  const [advancementError, setAdvancementError] = useState<string | null>(null);
  const [confirmingRevert, setConfirmingRevert] = useState<PipelinePhaseId | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);

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
      <div className="px-3 pb-3">
        <div className="text-xs text-zinc-500">No book selected</div>
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

    // Revision queue phases — clicking them resets stale state and opens the queue
    if (REVISION_QUEUE_PHASES.has(phase.id) && hasRevisionPlan) {
      const { isRunning } = useRevisionQueueStore.getState();
      if (!isRunning) {
        useRevisionQueueStore.setState({ plan: null, planId: null, error: null });
      }
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
   * If `dist/{slug}.md` doesn't exist, the build runs inline before Quill opens.
   * Returns true if we can proceed to Quill, false if build failed.
   */
  const ensureBuildForQuill = async (): Promise<boolean> => {
    try {
      const exists = await window.novelEngine.files.exists(activeSlug, `dist/${activeSlug}.md`);
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

  /** Opens the manual override warning modal for a given phase. */
  const handleMarkComplete = (phaseId: PipelinePhaseId) => {
    setManualOverridePhase(phaseId);
  };

  /** Called from the modal when the user confirms the manual override. */
  const confirmManualOverride = async () => {
    if (!manualOverridePhase) return;
    try {
      setMarkCompleteError(null);
      await markPhaseComplete(activeSlug, manualOverridePhase);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMarkCompleteError(msg);
      setTimeout(() => setMarkCompleteError(null), 6000);
    }
    setManualOverridePhase(null);
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

  /**
   * Revert a completed phase — double-click confirmation to prevent accidents.
   *
   * First click enters confirmation state (button turns red with "Revert?").
   * Second click within 4 seconds performs the revert.
   */
  const handleRevertPhase = async (phaseId: PipelinePhaseId) => {
    if (confirmingRevert === phaseId) {
      // Second click = confirm
      try {
        setRevertError(null);
        await revertPhase(activeSlug, phaseId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setRevertError(msg);
        setTimeout(() => setRevertError(null), 6000);
      }
      setConfirmingRevert(null);
    } else {
      // First click = enter confirmation state
      setConfirmingRevert(phaseId);
      // Auto-cancel after 4 seconds
      setTimeout(() => setConfirmingRevert((prev) => (prev === phaseId ? null : prev)), 4000);
    }
  };

  return (
    <div className="px-3 pb-3">

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
      {revertError && (
        <div className="mb-2 rounded bg-red-950 px-2 py-1.5 text-[10px] text-red-300">
          {revertError}
        </div>
      )}
      {autoDraftError && (
        <div className="mb-2 rounded bg-red-950 px-2 py-1.5 text-[10px] text-red-300 flex items-start gap-1">
          <span className="shrink-0">Auto Draft:</span>
          <span className="flex-1">{autoDraftError}</span>
          <button
            onClick={() => activeSlug && autoDraftReset(activeSlug)}
            className="ml-1 shrink-0 text-red-400 hover:text-red-200"
            title="Dismiss error"
          >✕</button>
        </div>
      )}
      <div>
        {phases.map((phase, index) => {
          // Show the revision queue sub-button ONLY under the currently active
          // revision queue phase — not all of them at once. The phase must be:
          //   - a revision queue phase (`revision` or `mechanical-fixes`)
          //   - the current step (active or pending-completion)
          //   - backed by the supporting docs (project-tasks.md / revision-prompts.md)
          const showRevisionSub =
            hasRevisionPlan &&
            REVISION_QUEUE_PHASES.has(phase.id) &&
            (phase.status === 'active' || phase.status === 'pending-completion');

          // Show "Complete Revision" only when the `revision` phase is active or
          // pending-completion and the queue isn't running.
          // The mechanical-fixes phase does not need this — it uses the queue's own archive step.
          const showCompleteRevision =
            phase.id === 'revision' &&
            (phase.status === 'active' || phase.status === 'pending-completion') &&
            !(revisionRunning && !!revisionActiveSession);

          // Show the Auto Draft sub-button on the first-draft phase when active.
          // Also show it while running even if the phase is pending-completion (the
          // loop may still be finishing a chapter).
          const showAutoDraft =
            phase.id === 'first-draft' &&
            (phase.status === 'active' || phase.status === 'pending-completion' || autoDraftRunning);

          return (
            <div key={phase.id}>
              <PhaseRow
                phase={phase}
                onPhaseClick={() => handlePhaseClick(phase)}
                showMarkComplete={
                  phase.status === 'active' && !SKIP_DONE_BUTTON_PHASES.has(phase.id)
                }
                onMarkComplete={() => handleMarkComplete(phase.id)}
                isBuildingForQuill={phase.id === 'publish' && isBuildingForQuill}
                showConfirmAdvancement={phase.status === 'pending-completion'}
                onConfirmAdvancement={() => handleConfirmAdvancement(phase.id)}
                showRevert={phase.status === 'complete' || phase.status === 'pending-completion'}
                isConfirmingRevert={confirmingRevert === phase.id}
                onRevert={() => handleRevertPhase(phase.id)}
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
              {showAutoDraft && (
                <AutoDraftSubButton
                  isRunning={autoDraftRunning}
                  isPaused={autoDraftPaused}
                  pauseReason={autoDraftPauseReason}
                  chaptersWritten={autoDraftChapters}
                  stageLabel={autoDraftStageLabel}
                  onStart={() => autoDraftStart(activeSlug)}
                  onStop={() => autoDraftStop(activeSlug)}
                  onResume={() => autoDraftResume(activeSlug)}
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

      {/* Manual Override Warning Modal */}
      {manualOverridePhase && (
        <ManualOverrideModal
          phaseName={phases.find((p) => p.id === manualOverridePhase)?.label ?? manualOverridePhase}
          onConfirm={confirmManualOverride}
          onCancel={() => setManualOverridePhase(null)}
        />
      )}
    </div>
  );
}

function ManualOverrideModal({
  phaseName,
  onConfirm,
  onCancel,
}: {
  phaseName: string;
  onConfirm: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onCancel();
      }
    },
    [onCancel],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="w-full max-w-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 px-5 py-3">
          <span className="text-amber-500 text-base">⚠</span>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Manual Override
          </h2>
        </div>

        {/* Body */}
        <div className="px-5 py-4 text-sm text-zinc-600 dark:text-zinc-400 space-y-2">
          <p>
            You are manually completing <strong className="text-zinc-800 dark:text-zinc-200">{phaseName}</strong> without
            running its agent.
          </p>
          <p className="text-xs text-amber-500/90">
            This is not recommended. Skipping an agent may leave the pipeline
            without the output that later phases depend on.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 transition-colors"
          >
            Complete Anyway
          </button>
        </div>
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

function AutoDraftSubButton({
  isRunning,
  isPaused,
  pauseReason,
  chaptersWritten,
  stageLabel,
  onStart,
  onStop,
  onResume,
}: {
  isRunning: boolean;
  isPaused: boolean;
  pauseReason: string | null;
  chaptersWritten: number;
  stageLabel: string | null;
  onStart: () => void;
  onStop: () => void;
  onResume: () => void;
}): React.ReactElement {
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  // ── Paused on error ────────────────────────────────────────────────────────
  if (isPaused) {
    // Truncate long error messages to fit the narrow sidebar
    const truncated = pauseReason && pauseReason.length > 48
      ? pauseReason.slice(0, 45) + '…'
      : (pauseReason ?? 'CLI error');

    return (
      <div className="ml-7 flex w-[calc(100%-1.75rem)] flex-col gap-1 rounded-md bg-amber-500/10 px-2 py-1.5">
        {/* Status row */}
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          <span className="text-[11px] font-medium text-amber-400">Auto Draft paused</span>
          {chaptersWritten > 0 && (
            <span className="ml-auto text-[9px] text-amber-400/70">
              {chaptersWritten} ch done
            </span>
          )}
        </div>
        {/* Error reason */}
        <div
          className="text-[9px] text-amber-400/60 leading-tight"
          title={pauseReason ?? undefined}
        >
          {truncated}
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={onResume}
            className="flex-1 rounded bg-amber-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-amber-500 transition-colors"
          >
            ↺ Retry
          </button>
          <button
            onClick={onStop}
            className="rounded bg-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-300 hover:bg-zinc-600 transition-colors"
          >
            Stop
          </button>
        </div>
      </div>
    );
  }

  // ── Actively running ───────────────────────────────────────────────────────
  if (isRunning) {
    return (
      <>
        <button
          onClick={() => setShowStopConfirm(true)}
          className="ml-7 flex w-[calc(100%-1.75rem)] flex-col gap-0.5 rounded-md bg-purple-500/15 px-2 py-1 text-[11px] font-medium text-purple-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
          title={`Auto Draft running — click to stop (${chaptersWritten} chapter${chaptersWritten !== 1 ? 's' : ''} written)`}
        >
          <span className="flex w-full items-center gap-1.5">
            <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
              <span className="absolute h-3 w-3 animate-ping rounded-full bg-purple-500 opacity-40" />
              <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
            </span>
            <span>Auto Draft</span>
            <span className="ml-auto text-[9px] text-purple-400/80 animate-pulse">
              {chaptersWritten > 0 ? `${chaptersWritten} ch written` : 'writing…'}
            </span>
            <span className="ml-1 text-[9px] text-red-400/70">■ stop</span>
          </span>
          {stageLabel && (
            <span className="w-full truncate text-[9px] font-normal text-purple-400/60 pl-[18px]">
              {stageLabel}
            </span>
          )}
        </button>
        {showStopConfirm && (
          <AutoDraftStopConfirm
            chaptersWritten={chaptersWritten}
            onConfirm={() => {
              setShowStopConfirm(false);
              onStop();
            }}
            onCancel={() => setShowStopConfirm(false)}
          />
        )}
      </>
    );
  }

  // ── Idle ───────────────────────────────────────────────────────────────────
  return (
    <button
      onClick={onStart}
      className="ml-7 flex w-[calc(100%-1.75rem)] items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-200/50 hover:text-purple-400 dark:hover:bg-zinc-800/50"
      title="Automatically write all remaining chapters one by one"
    >
      <span className="text-purple-500 text-xs">▶</span>
      <span>Auto Draft</span>
    </button>
  );
}

/** Confirmation dialog for stopping auto-draft. */
function AutoDraftStopConfirm({ chaptersWritten, onConfirm, onCancel }: {
  chaptersWritten: number;
  onConfirm: () => void;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="mx-4 w-full max-w-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Stop Auto Draft?</h3>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          This will kill the running CLI call immediately and stop the auto-draft loop.
          {chaptersWritten > 0
            ? ` ${chaptersWritten} chapter${chaptersWritten !== 1 ? 's have' : ' has'} been written so far — those are safe.`
            : ''
          }
          {' '}The current in-progress chapter may be partially written.
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition-colors"
          >
            Stop Now
          </button>
        </div>
      </div>
    </div>
  );
}

function PhaseRow({
  phase,
  onPhaseClick,
  showMarkComplete,
  onMarkComplete,
  isBuildingForQuill = false,
  showConfirmAdvancement,
  onConfirmAdvancement,
  showRevert = false,
  isConfirmingRevert = false,
  onRevert,
}: {
  phase: PipelinePhase;
  onPhaseClick: () => void;
  showMarkComplete: boolean;
  onMarkComplete: () => void;
  isBuildingForQuill?: boolean;
  /** Show the "Advance →" button — only true when status is 'pending-completion'. */
  showConfirmAdvancement: boolean;
  onConfirmAdvancement: () => void;
  /** Show the "← Back" revert button — true for completed and pending-completion phases. */
  showRevert?: boolean;
  isConfirmingRevert?: boolean;
  onRevert?: () => void;
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
      className={`group flex items-center gap-2 rounded-md px-1 py-1 ${
        isClickable
          ? 'cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
          : 'cursor-default'
      } ${dimmed ? 'opacity-60' : ''} ${
        isActive ? 'bg-blue-500/15 ring-1 ring-blue-500/40' : ''
      }`}
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
        {/* "← Back" revert button — shown on hover for completed/pending phases */}
        {showRevert && onRevert && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRevert();
            }}
            className={`no-drag rounded px-1.5 py-0.5 text-[10px] font-medium transition-all ${
              isConfirmingRevert
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-zinc-300 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300'
            }`}
            title={
              isConfirmingRevert
                ? 'Click again to confirm — reverts this phase and all subsequent phases'
                : 'Revert this phase (go back)'
            }
          >
            {isConfirmingRevert ? 'Revert?' : '←'}
          </button>
        )}
        {/* "Done" manual-completion button — only for active non-gated phases */}
        {showMarkComplete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkComplete();
            }}
            className="no-drag rounded px-2 py-0.5 text-[10px] font-medium transition-colors bg-red-600/15 text-red-400 hover:bg-red-600/25 hover:text-red-300"
            title="Mark this phase as complete (manual override)"
          >
            Done
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
        {/* "Build" action button — only for the build phase */}
        {isBuildPhase && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPhaseClick();
            }}
            className="no-drag shrink-0 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500"
          >
            Build
          </button>
        )}
      </div>
    </div>
  );
}
