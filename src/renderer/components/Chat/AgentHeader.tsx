import { useMemo } from 'react';
import { AGENT_REGISTRY, PIPELINE_PHASES } from '@domain/constants';
import { useChatStore } from '../../stores/chatStore';

export function AgentHeader(): React.ReactElement | null {
  const { activeConversation, conversationUsage } = useChatStore();

  const agentMeta = activeConversation
    ? AGENT_REGISTRY[activeConversation.agentName]
    : null;

  const phaseLabel = useMemo(() => {
    if (!activeConversation?.pipelinePhase) return null;
    const phase = PIPELINE_PHASES.find((p) => p.id === activeConversation.pipelinePhase);
    return phase?.label ?? null;
  }, [activeConversation?.pipelinePhase]);

  const usageTotals = useMemo(() => {
    if (!conversationUsage || conversationUsage.length === 0) return null;
    return conversationUsage.reduce(
      (acc, r) => ({
        inputTokens: acc.inputTokens + r.inputTokens,
        outputTokens: acc.outputTokens + r.outputTokens,
        thinkingTokens: acc.thinkingTokens + r.thinkingTokens,
        estimatedCost: acc.estimatedCost + r.estimatedCost,
      }),
      { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, estimatedCost: 0 }
    );
  }, [conversationUsage]);

  if (!activeConversation || !agentMeta) return null;

  const totalTokens = usageTotals
    ? usageTotals.inputTokens + usageTotals.outputTokens + usageTotals.thinkingTokens
    : 0;

  return (
    <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
      <div className="flex items-center gap-3">
        <div
          className="w-1 self-stretch rounded-full"
          style={{ backgroundColor: agentMeta.color }}
        />
        <div>
          <h2 className="text-lg font-bold text-zinc-100">
            {activeConversation.agentName}
          </h2>
          <p className="text-sm text-zinc-500">
            {agentMeta.role}
            {phaseLabel && (
              <span className="text-zinc-600"> &middot; {phaseLabel}</span>
            )}
          </p>
        </div>
      </div>

      {usageTotals && totalTokens > 0 && (
        <div className="text-right font-mono text-xs text-zinc-500">
          <div>
            {totalTokens.toLocaleString()} tokens
          </div>
          <div className="text-zinc-600">
            ${usageTotals.estimatedCost.toFixed(4)}
          </div>
        </div>
      )}
    </div>
  );
}
