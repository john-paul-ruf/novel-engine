import type { IDatabaseService } from '@domain/interfaces';
import type { UsageRecord, UsageSummary } from '@domain/types';

/**
 * UsageService — Token tracking and cost estimation.
 *
 * Wraps IDatabaseService usage methods and adds cost calculation
 * so callers (ChatService) don't need to know about pricing.
 *
 * Full implementation in Session 10 — this provides the contract
 * that ChatService depends on.
 */
export class UsageService {
  constructor(private db: IDatabaseService) {}

  recordUsage(params: {
    conversationId: string;
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    model: string;
  }): void {
    const { conversationId, inputTokens, outputTokens, thinkingTokens, model } = params;

    // Placeholder cost — Session 10 will implement proper pricing lookup
    const estimatedCost = 0;

    this.db.recordUsage({
      conversationId,
      inputTokens,
      outputTokens,
      thinkingTokens,
      model,
      estimatedCost,
    });
  }

  getUsageSummary(bookSlug?: string): UsageSummary {
    return this.db.getUsageSummary(bookSlug);
  }

  getUsageByConversation(conversationId: string): UsageRecord[] {
    return this.db.getUsageByConversation(conversationId);
  }
}
