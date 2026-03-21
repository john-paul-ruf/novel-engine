import { useEffect, useState } from 'react';
import type { PhaseStatus, PipelinePhase, PipelinePhaseId } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useViewStore } from '../../stores/viewStore';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';

/**
 * Phases that require the user to manually signal completion.
 *
 * These phases depend on the book's `status` field in `about.json`
 * (not just file existence), and nothing auto-advances that status.
 * The user must click "Done" when they're finished with the phase.
 */
const MANUAL_COMPLETION_PHASES: ReadonlySet<PipelinePhaseId> = new Set([
  'first-draft',
  'mechanical-fixes',
]);

function StatusIcon({ status }: { status: PhaseStatus }): React.ReactElement {
  switch (status) {
    case 'complete':
      return (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-[10px] font-bold text-white">
          ✓
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
  }

  return <div className={`ml-[9px] h-4 w-0.5 ${color}`} />;
}

/** The phase under which the "Revision Queue" sub-button appears (Verity). */
const REVISION_QUEUE_PARENT: PipelinePhaseId = 'revision';

export function PipelineTracker(): React.ReactElement {
  const { phases, markPhaseComplete } = usePipelineStore();
  const { activeSlug } = useBookStore();
  const { conversations, createConversation, setActiveConversation } = useChatStore();
  const { navigate, currentView } = useViewStore();
  const { isLoading: revisionLoading, isRunning: revisionRunning, activeSessionId: revisionActiveSession } = useRevisionQueueStore();
  const [publishWarning, setPublishWarning] = useState<string | null>(null);
  const [confirmingComplete, setConfirmingComplete] = useState<PipelinePhaseId | null>(null);
  const [hasRevisionPlan, setHasRevisionPlan] = useState(false);

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
    if (phase.status === 'locked') return;

    if (phase.id === 'build') {
      navigate('build');
      return;
    }

    // Revision phase owns the revision queue — clicking it opens the queue
    if (phase.id === REVISION_QUEUE_PARENT && hasRevisionPlan) {
      navigate('revision-queue');
      return;
    }

    await openOrCreateConversation(phase);
  };

  const handleStartClick = async (phase: PipelinePhase) => {
    if (phase.id === 'build') {
      navigate('build');
      return;
    }

    // Revision phase owns the revision queue
    if (phase.id === REVISION_QUEUE_PARENT && hasRevisionPlan) {
      navigate('revision-queue');
      return;
    }

    // Safety net: publish requires build artifacts
    if (phase.id === 'publish') {
      try {
        const exists = await window.novelEngine.files.exists(activeSlug, 'dist/output.md');
        if (!exists) {
          setPublishWarning('Run the Build step first to generate output files.');
          setTimeout(() => setPublishWarning(null), 5000);
          return;
        }
      } catch {
        // If check fails, proceed anyway — pipeline status should prevent this
      }
    }

    setPublishWarning(null);
    await openOrCreateConversation(phase);
  };

  const handleMarkComplete = async (phaseId: PipelinePhaseId) => {
    if (confirmingComplete === phaseId) {
      // Second click = confirm
      await markPhaseComplete(activeSlug, phaseId);
      setConfirmingComplete(null);
    } else {
      // First click = enter confirmation state
      setConfirmingComplete(phaseId);
      // Auto-cancel after 4 seconds
      setTimeout(() => setConfirmingComplete((prev) => (prev === phaseId ? null : prev)), 4000);
    }
  };

  return (
    <div className="px-3 py-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
        Pipeline
      </div>
      {publishWarning && (
        <div className="mb-2 rounded bg-amber-950 px-2 py-1.5 text-[10px] text-amber-300">
          {publishWarning}
        </div>
      )}
      <div>
        {phases.map((phase, index) => {
          // Show the revision queue sub-button under the Verity (revision) phase
          const showRevisionSub =
            hasRevisionPlan &&
            phase.id === REVISION_QUEUE_PARENT &&
            phase.status !== 'locked';

          return (
            <div key={phase.id}>
              <PhaseRow
                phase={phase}
                onPhaseClick={() => handlePhaseClick(phase)}
                onStartClick={() => handleStartClick(phase)}
                showMarkComplete={
                  phase.status === 'active' && MANUAL_COMPLETION_PHASES.has(phase.id)
                }
                isConfirmingComplete={confirmingComplete === phase.id}
                onMarkComplete={() => handleMarkComplete(phase.id)}
              />
              {showRevisionSub && (
                <RevisionQueueSubButton
                  isActive={currentView === 'revision-queue'}
                  isRunning={revisionLoading || (revisionRunning && !!revisionActiveSession)}
                  onClick={() => navigate('revision-queue')}
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

function PhaseRow({
  phase,
  onPhaseClick,
  onStartClick,
  showMarkComplete,
  isConfirmingComplete,
  onMarkComplete,
}: {
  phase: PipelinePhase;
  onPhaseClick: () => void;
  onStartClick: () => void;
  showMarkComplete: boolean;
  isConfirmingComplete: boolean;
  onMarkComplete: () => void;
}): React.ReactElement {
  const isClickable = phase.status !== 'locked';
  const isActive = phase.status === 'active';
  const isBuildPhase = phase.id === 'build';

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-1 py-1 ${
        isClickable ? 'cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50' : 'cursor-default opacity-60'
      }`}
      onClick={onPhaseClick}
      title={phase.status === 'locked' ? 'Complete the previous phase first' : phase.description}
    >
      <StatusIcon status={phase.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-zinc-800 dark:text-zinc-200">{phase.label}</div>
        {phase.agent && (
          <div className="truncate text-[10px] text-zinc-500">
            {phase.agent}
          </div>
        )}
      </div>
      {isActive && (
        <div className="flex shrink-0 items-center gap-1">
          {showMarkComplete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkComplete();
              }}
              className={`no-drag rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                isConfirmingComplete
                  ? 'bg-green-600 text-white hover:bg-green-500'
                  : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
              }`}
              title={isConfirmingComplete ? 'Click again to confirm' : 'Mark this phase as complete'}
            >
              {isConfirmingComplete ? 'Confirm?' : 'Done'}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartClick();
            }}
            className="no-drag shrink-0 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500"
          >
            {isBuildPhase ? 'Build' : 'Start'}
          </button>
        </div>
      )}
    </div>
  );
}
