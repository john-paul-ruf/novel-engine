import type { AppSettings } from '@domain/types';

/**
 * Resolve the effective thinking budget for a CLI call.
 *
 * Priority:
 * 1. Per-message override (from the chat input slider)
 * 2. Global override (settings.overrideThinkingBudget + settings.thinkingBudget)
 * 3. Per-agent default (agent.thinkingBudget)
 * 4. undefined (thinking disabled)
 */
export function resolveThinkingBudget(
  settings: Pick<AppSettings, 'enableThinking' | 'thinkingBudget' | 'overrideThinkingBudget'>,
  agentThinkingBudget: number,
  perMessageOverride?: number,
): number | undefined {
  // Per-message override takes highest priority
  if (perMessageOverride !== undefined) {
    return perMessageOverride > 0 ? perMessageOverride : undefined;
  }
  // Thinking disabled globally → no budget
  if (!settings.enableThinking) return undefined;
  // Global override → use settings slider value for all agents
  if (settings.overrideThinkingBudget) return settings.thinkingBudget;
  // Default → per-agent budget
  return agentThinkingBudget;
}
