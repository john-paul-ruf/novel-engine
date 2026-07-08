import { useEffect, useState } from 'react';
import type { PipelinePhase } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useViewStore } from '../../stores/viewStore';
import { useChatStore } from '../../stores/chatStore';
import { useAutoDraftStore } from '../../stores/autoDraftStore';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useResizeHandle } from '../../hooks/useResizeHandle';
import { ResizeHandle } from '../Layout/ResizeHandle';
import { Icon } from '../common/Icon';
import { PhaseNode } from './PhaseNode';
import { STAGES } from './stages';

const SPINE_DEFAULT = 282;
const SPINE_MIN = 220;
const SPINE_MAX = 420;

/** Contextual primary-action labels per phase (visual contract: mock spine). */
const PHASE_ACTION_LABELS: Record<string, string> = {
  pitch: 'Revisit Pitch',
  scaffold: 'Open Scaffold',
  'first-draft': 'Continue Auto Draft',
  'first-read': 'Start First Read',
  'first-assessment': 'Run Assessment',
  'revision-plan-1': 'Build Revision Plan',
  revision: 'Start Revision',
  'second-read': 'Start Second Read',
  'second-assessment': 'Run Assessment',
  'copy-edit': 'Start Copy Edit',
  'revision-plan-2': 'Plan Fixes',
  'mechanical-fixes': 'Apply Fixes',
  build: 'Run Build',
  publish: 'Run Audit',
};

const REVISION_QUEUE_PHASES: ReadonlySet<string> = new Set(['revision', 'mechanical-fixes']);

const PRIMARY_BTN_CLASS =
  'flex w-full items-center justify-center gap-2 rounded-[7px] bg-gradient-to-b from-ne-brass-hi to-ne-brass px-2.5 py-[7px] text-xs font-semibold text-ne-bg0 transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';

const SECONDARY_BTN_CLASS =
  'flex w-full items-center justify-center gap-2 rounded-[7px] border border-ne-line px-2.5 py-[6px] text-[11px] font-medium text-ne-ink-dim transition-colors hover:border-ne-brass/50 hover:text-ne-ink';

/**
 * Action card under the pipeline's current phase — the same triggers as
 * PipelineTracker (Auto Draft, confirm gate, revision queue, build, Quill),
 * re-skinned for the spine.
 */
function CurrentPhaseCard({
  phase,
  activeSlug,
}: {
  phase: PipelinePhase;
  activeSlug: string;
}): React.ReactElement {
  const { confirmPhaseAdvancement, completeRevision } = usePipelineStore();
  const autoDraftSession = useAutoDraftStore((s) => s.sessions[activeSlug] ?? null);
  const { start: autoDraftStart, stop: autoDraftStop, resume: autoDraftResume } = useAutoDraftStore();
  const dashboardData = useDashboardStore((s) => s.data);

  const [hasRevisionPlan, setHasRevisionPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<'stop' | 'complete-revision' | null>(null);

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
  }, [activeSlug, phase.id, phase.status]);

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 6000);
  };

  /** First click arms the confirmation; it auto-cancels after 4s. */
  const arm = (kind: 'stop' | 'complete-revision') => {
    setConfirming(kind);
    setTimeout(() => setConfirming((prev) => (prev === kind ? null : prev)), 4000);
  };

  const openConversation = async () => {
    if (!phase.agent) return;
    const { conversations, createConversation, setActiveConversation } = useChatStore.getState();
    const existing = conversations.find(
      (c) => c.agentName === phase.agent && c.pipelinePhase === phase.id,
    );
    if (existing) {
      await setActiveConversation(existing.id);
    } else {
      await createConversation(phase.agent, activeSlug, phase.id);
    }
    useViewStore.getState().navigate('chat');
  };

  /**
   * Same guard as PipelineTracker: auto-run the build before opening Quill
   * if the dist artifacts are missing.
   */
  const ensureBuildForQuill = async (): Promise<boolean> => {
    try {
      const exists = await window.novelEngine.files.exists(activeSlug, `dist/${activeSlug}.md`);
      if (exists) return true;
    } catch {
      // If the existence check fails, proceed — the build surfaces any real error
    }
    setBusy(true);
    try {
      const result = await window.novelEngine.build.run(activeSlug);
      const allFailed = result.formats.length > 0 && result.formats.every((f) => !!f.error);
      if (allFailed) {
        showError('Build failed — check the build output for details.');
        return false;
      }
      return true;
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Build failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmAdvance = async () => {
    try {
      await confirmPhaseAdvancement(activeSlug, phase.id);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleCompleteRevision = async () => {
    if (confirming !== 'complete-revision') {
      arm('complete-revision');
      return;
    }
    setConfirming(null);
    try {
      await completeRevision(activeSlug);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleStopAutoDraft = () => {
    if (confirming !== 'stop') {
      arm('stop');
      return;
    }
    setConfirming(null);
    autoDraftStop(activeSlug);
  };

  const handleOpenRevisionQueue = () => {
    const { isRunning } = useRevisionQueueStore.getState();
    if (!isRunning) {
      useRevisionQueueStore.setState({ plan: null, planId: null, error: null });
    }
    useRevisionQueueStore.getState().openModal(activeSlug);
  };

  const handlePrimaryAction = async () => {
    if (phase.id === 'build') {
      useViewStore.getState().navigate('exports');
      return;
    }
    if (phase.id === 'publish') {
      const ready = await ensureBuildForQuill();
      if (!ready) return;
    }
    await openConversation();
  };

  const isPending = phase.status === 'pending-completion';
  const isFirstDraft = phase.id === 'first-draft';
  const isRevisionQueuePhase = REVISION_QUEUE_PHASES.has(phase.id) && hasRevisionPlan;
  const autoDraftRunning = autoDraftSession?.isRunning ?? false;
  const autoDraftPaused = autoDraftSession?.isPaused ?? false;
  const revisionTasks =
    isRevisionQueuePhase && dashboardData?.bookSlug === activeSlug
      ? dashboardData.revisionTasks
      : null;

  // Micro-progress row content
  let micro: { label: string; value: string } | null = null;
  if (isFirstDraft && autoDraftPaused) {
    micro = {
      label: 'Auto Draft paused',
      value: autoDraftSession?.pauseReason?.slice(0, 32) ?? 'CLI error',
    };
  } else if (isFirstDraft && autoDraftRunning) {
    micro = {
      label: autoDraftSession?.stageLabel ?? 'Auto Draft running',
      value: `${autoDraftSession?.chaptersWritten ?? 0} chapters`,
    };
  } else if (revisionTasks && revisionTasks.total > 0) {
    micro = {
      label: 'Revision tasks',
      value: `${revisionTasks.completed} / ${revisionTasks.total} done`,
    };
  } else if (isPending) {
    micro = { label: 'Agent finished', value: 'ready to advance' };
  }

  // Primary button
  let primary: { label: string; onClick: () => void; icon?: 'play' | 'check' };
  if (isPending) {
    primary = { label: 'Confirm & advance', icon: 'check', onClick: () => void handleConfirmAdvance() };
  } else if (isFirstDraft) {
    if (autoDraftRunning) {
      primary = {
        label: confirming === 'stop' ? 'Confirm stop?' : 'Stop Auto Draft',
        onClick: handleStopAutoDraft,
      };
    } else if (autoDraftPaused) {
      primary = { label: 'Retry Auto Draft', icon: 'play', onClick: () => autoDraftResume(activeSlug) };
    } else {
      primary = { label: 'Start Auto Draft', icon: 'play', onClick: () => autoDraftStart(activeSlug) };
    }
  } else if (isRevisionQueuePhase) {
    primary = { label: 'Open Revision Queue', icon: 'play', onClick: handleOpenRevisionQueue };
  } else {
    primary = {
      label: PHASE_ACTION_LABELS[phase.id] ?? 'Open conversation',
      icon: 'play',
      onClick: () => void handlePrimaryAction(),
    };
  }

  return (
    <div className="mx-3 mb-1 ml-[44px] mt-0.5 rounded-[10px] border border-ne-brass/35 bg-ne-bg2 p-2.5">
      {error && (
        <div className="mb-2 rounded bg-ne-sable/10 px-2 py-1 text-[10px] text-ne-sable">{error}</div>
      )}
      {micro && (
        <div className="mb-2 flex justify-between gap-2 text-[10.5px] text-ne-ink-dim">
          <span className="truncate">{micro.label}</span>
          <b className="shrink-0 font-semibold text-ne-brass-hi">{micro.value}</b>
        </div>
      )}
      <button className={PRIMARY_BTN_CLASS} onClick={primary.onClick} disabled={busy}>
        {primary.icon && <Icon name={primary.icon} size={11} strokeWidth={2.4} />}
        {busy ? 'Building…' : primary.label}
      </button>

      {/* Pending revision-queue phases keep queue access alongside the gate */}
      {isPending && isRevisionQueuePhase && (
        <button className={`${SECONDARY_BTN_CLASS} mt-1.5`} onClick={handleOpenRevisionQueue}>
          Open Revision Queue
        </button>
      )}

      {/* Auto Draft may still be finishing while first-draft awaits confirmation */}
      {isPending && isFirstDraft && autoDraftRunning && (
        <button className={`${SECONDARY_BTN_CLASS} mt-1.5`} onClick={handleStopAutoDraft}>
          {confirming === 'stop' ? 'Confirm stop?' : 'Stop Auto Draft'}
        </button>
      )}

      {/* Revision's dedicated gate: archive reports + advance to Second Read */}
      {phase.id === 'revision' && (
        <button
          className={`${SECONDARY_BTN_CLASS} mt-1.5 ${
            confirming === 'complete-revision' ? 'border-ne-lumen/60 text-ne-lumen' : ''
          }`}
          onClick={() => void handleCompleteRevision()}
          title="Archive revision reports and advance the pipeline to Second Read"
        >
          {confirming === 'complete-revision' ? 'Confirm complete?' : 'Complete Revision'}
        </button>
      )}
    </div>
  );
}

/**
 * The Workspace's left panel: book header + the pipeline as navigation.
 * Replaces Dashboard's PipelineCard and the right-dock PipelineTracker
 * (both stay mounted until SESSION-14).
 */
export function PipelineSpine(): React.ReactElement {
  const { phases } = usePipelineStore();
  const { activeSlug, books, totalWordCount } = useBookStore();
  const { selectedPhaseId, selectPhase } = useWorkspaceStore();
  const [coverError, setCoverError] = useState(false);

  const { width, isDragging, onMouseDown, resetWidth } = useResizeHandle({
    direction: 'left', // handle on right edge: dragging right = wider
    initialWidth: SPINE_DEFAULT,
    minWidth: SPINE_MIN,
    maxWidth: SPINE_MAX,
    storageKey: 'novel-engine:pipeline-spine-width',
  });

  useEffect(() => {
    setCoverError(false);
  }, [activeSlug]);

  const book = books.find((b) => b.slug === activeSlug) ?? null;

  // Overall progress — same derivation as Library BookCard / Dashboard PipelineCard
  const total = phases.length;
  const completed = phases.filter((p) => p.status === 'complete').length;
  const isComplete = total > 0 && completed === total;
  const currentPhase =
    phases.find((p) => p.status === 'active' || p.status === 'pending-completion') ?? null;
  const currentIdx = currentPhase ? phases.findIndex((p) => p.id === currentPhase.id) : -1;
  const phaseNumber = currentIdx >= 0 ? currentIdx + 1 : isComplete ? total : completed + 1;
  const phaseById = new Map(phases.map((p) => [p.id, p]));

  return (
    <div
      data-tour="pipeline-spine"
      className="relative flex h-full shrink-0 flex-col border-r border-ne-line bg-ne-bg1"
      style={{ width }}
    >
      {/* Book header */}
      <div className="shrink-0 border-b border-ne-line-soft px-4 pb-3.5 pt-4">
        {book ? (
          <>
            <div className="flex items-center gap-3">
              {coverError ? (
                <div className="flex h-[57px] w-[38px] shrink-0 items-center justify-center rounded border border-ne-line bg-ne-bg2 text-ne-ink-faint">
                  <Icon name="manuscript" size={16} />
                </div>
              ) : (
                <img
                  src={`novel-asset://cover/${book.slug}`}
                  alt=""
                  className="h-[57px] w-[38px] shrink-0 rounded border border-ne-line object-cover shadow-md"
                  onError={() => setCoverError(true)}
                />
              )}
              <div className="min-w-0">
                <div className="truncate font-ne-serif text-base font-medium text-ne-ink">
                  {book.title}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-full border border-ne-brass/30 bg-ne-brass-dim px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-ne-brass-hi">
                    {book.status}
                  </span>
                  <span className="text-[11px] tabular-nums text-ne-ink-faint">
                    {totalWordCount.toLocaleString()} w
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1.5 flex justify-between text-[10.5px] text-ne-ink-faint">
                <span>Pipeline</span>
                <span>{total > 0 ? `Phase ${phaseNumber} of ${total}` : '—'}</span>
              </div>
              <div className="h-[3px] overflow-hidden rounded-full bg-ne-bg3">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: total > 0 ? `${(completed / total) * 100}%` : '0%',
                    background: isComplete
                      ? 'var(--ne-lumen)'
                      : 'linear-gradient(90deg, var(--ne-brass), var(--ne-brass-hi))',
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="text-xs text-ne-ink-faint">No book selected</div>
        )}
      </div>

      {/* Spine */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-4 pt-2.5">
        {phases.length === 0 ? (
          <div className="px-4 py-3 text-xs text-ne-ink-faint">No pipeline yet</div>
        ) : (
          STAGES.map((stage) => (
            <div key={stage.label}>
              <div className="pb-1.5 pl-[52px] pr-4 pt-3.5 text-[9.5px] font-bold tracking-[.14em] text-ne-ink-faint">
                {stage.label}
              </div>
              {stage.phaseIds.map((id) => {
                const phase = phaseById.get(id);
                if (!phase) return null;
                return (
                  <div key={id}>
                    <PhaseNode
                      phase={phase}
                      isSelected={selectedPhaseId === phase.id}
                      onSelect={() => selectPhase(phase.id)}
                    />
                    {currentPhase?.id === phase.id && activeSlug && (
                      <CurrentPhaseCard phase={phase} activeSlug={activeSlug} />
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Right-edge drag handle */}
      <ResizeHandle
        side="right"
        isDragging={isDragging}
        onMouseDown={onMouseDown}
        onDoubleClick={resetWidth}
      />
    </div>
  );
}
