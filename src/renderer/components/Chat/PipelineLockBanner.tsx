import { AGENT_REGISTRY, PIPELINE_PHASES } from '@domain/constants';
import { useChatStore } from '../../stores/chatStore';

export function PipelineLockBanner(): React.ReactElement | null {
  const { pipelineLocked, lockedAgentName, lockedPhaseId, setPipelineLock } = useChatStore();

  // Don't show if there's no locked agent (e.g., build phase has no agent, or no book selected)
  if (!lockedAgentName || !lockedPhaseId) return null;

  const agentMeta = AGENT_REGISTRY[lockedAgentName];
  const phase = PIPELINE_PHASES.find((p) => p.id === lockedPhaseId);

  return (
    <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 px-6 py-2">
      <div className="flex items-center gap-2">
        {pipelineLocked ? (
          <>
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: agentMeta.color }}
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{lockedAgentName}</span>
              {' owns this stage'}
              {phase && (
                <span className="text-zinc-500"> — {phase.label}</span>
              )}
            </span>
          </>
        ) : (
          <span className="text-xs text-amber-600 dark:text-amber-400/80">
            Pipeline lock disabled — all agents available
          </span>
        )}
      </div>

      <button
        onClick={() => setPipelineLock(!pipelineLocked)}
        className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
          pipelineLocked
            ? 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            : 'bg-amber-600/20 text-amber-600 dark:text-amber-400 hover:bg-amber-600/30'
        }`}
      >
        {pipelineLocked ? 'Unlock' : 'Re-lock'}
      </button>
    </div>
  );
}
