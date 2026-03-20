import type { IDatabaseService } from '@domain/interfaces';
import type { UsageRecord, UsageSummary } from '@domain/types';
import { MODEL_PRICING } from '@domain/constants';

/**
 * UsageService — Centralizes token tracking and cost estimation.
 *
 * Wraps IDatabaseService usage methods and adds cost calculation
 * using MODEL_PRICING from domain constants. Callers (ChatService)
 * pass raw token counts; this service computes the estimated cost
 * before persisting.
 */
export class UsageService {
  constructor(private db: IDatabaseService) {}

  /**
   * Record a usage event with automatic cost calculation.
   *
   * Looks up the model's pricing from MODEL_PRICING. Falls back to
   * Opus pricing if the model isn't found (safest default — overestimates
   * rather than underestimates).
   */
  recordUsage(params: {
    conversationId: string;
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    model: string;
  }): void {
    const { conversationId, inputTokens, outputTokens, thinkingTokens, model } = params;

    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['claude-opus-4-20250514'];
    const estimatedCost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

    this.db.recordUsage({
      conversationId,
      inputTokens,
      outputTokens,
      thinkingTokens,
      model,
      estimatedCost,
    });
  }

  /**
   * Get aggregated usage summary, optionally filtered by book.
   */
  getSummary(bookSlug?: string): UsageSummary {
    return this.db.getUsageSummary(bookSlug);
  }

  /**
   * Get all usage records for a specific conversation.
   */
  getByConversation(conversationId: string): UsageRecord[] {
    return this.db.getUsageByConversation(conversationId);
  }
}
