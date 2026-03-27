import type { IDatabaseService, IUsageService } from '@domain/interfaces';
import type { UsageRecord, UsageSummary } from '@domain/types';

/**
 * UsageService — Centralizes token tracking.
 *
 * Wraps IDatabaseService usage methods. Since billing is handled by the
 * Claude Code CLI subscription, no cost estimation is performed — we
 * simply record raw token counts for informational purposes.
 */
export class UsageService implements IUsageService {
  constructor(private db: IDatabaseService) {}

  /**
   * Record a usage event (token counts only — no cost calculation).
   */
  recordUsage(params: {
    conversationId: string;
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    model: string;
  }): void {
    this.db.recordUsage(params);
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
