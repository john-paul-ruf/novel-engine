import { useState } from 'react';
import type { PhaseStatus, PipelinePhase } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useViewStore } from '../../stores/viewStore';

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
        <div className="h-5 w-5 shrink-0 rounded-full border-2 border-zinc-600" />
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
  let color = 'bg-zinc-700';
  if (fromStatus === 'complete' && toStatus === 'complete') {
    color = 'bg-green-600';
  } else if (fromStatus === 'complete' && toStatus === 'active') {
    color = 'bg-blue-500';
  }

  return <div className={`ml-[9px] h-4 w-0.5 ${color}`} />;
}

export function PipelineTracker(): React.ReactElement {
  const { phases } = usePipelineStore();
  const { activeSlug } = useBookStore();
  const { conversations, createConversation, setActiveConversation } = useChatStore();
  const { navigate } = useViewStore();
  const [publishWarning, setPublishWarning] = useState<string | null>(null);

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

    await openOrCreateConversation(phase);
  };

  const handleStartClick = async (phase: PipelinePhase) => {
    if (phase.id === 'build') {
      navigate('build');
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
        {phases.map((phase, index) => (
          <div key={phase.id}>
            <PhaseRow
              phase={phase}
              onPhaseClick={() => handlePhaseClick(phase)}
              onStartClick={() => handleStartClick(phase)}
            />
            {index < phases.length - 1 && (
              <ConnectingLine
                fromStatus={phase.status}
                toStatus={phases[index + 1].status}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PhaseRow({
  phase,
  onPhaseClick,
  onStartClick,
}: {
  phase: PipelinePhase;
  onPhaseClick: () => void;
  onStartClick: () => void;
}): React.ReactElement {
  const isClickable = phase.status !== 'locked';
  const isActive = phase.status === 'active';
  const isBuildPhase = phase.id === 'build';

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-1 py-1 ${
        isClickable ? 'cursor-pointer hover:bg-zinc-800/50' : 'cursor-default opacity-60'
      }`}
      onClick={onPhaseClick}
      title={phase.status === 'locked' ? 'Complete the previous phase first' : phase.description}
    >
      <StatusIcon status={phase.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-zinc-200">{phase.label}</div>
        {phase.agent && (
          <div className="truncate text-[10px] text-zinc-500">
            {phase.agent}
          </div>
        )}
      </div>
      {isActive && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStartClick();
          }}
          className="no-drag shrink-0 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500"
        >
          {isBuildPhase ? 'Build' : 'Start'}
        </button>
      )}
    </div>
  );
}
