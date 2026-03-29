import type {
  IStatisticsService,
  IDatabaseService,
  IFileSystemService,
} from '@domain/interfaces';
import type {
  AgentUsageBreakdown,
  BookStatistics,
  PhaseUsageBreakdown,
} from '@domain/types';
import { MODEL_PRICING } from '@domain/constants';

export class StatisticsService implements IStatisticsService {
  constructor(
    private db: IDatabaseService,
    private fs: IFileSystemService,
  ) {}

  async getStatistics(bookSlug?: string): Promise<BookStatistics> {
    const usageOverTime = this.db.getUsageOverTime(bookSlug);
    const perAgentRaw = this.db.getUsageByAgent(bookSlug);
    const perPhaseRaw = this.db.getUsageByPhase(bookSlug);
    const wordCountHistory = this.db.getWordCountHistory(bookSlug);
    const usageSummary = this.db.getUsageSummary(bookSlug);

    let wordsPerChapter: { slug: string; wordCount: number }[] = [];
    if (bookSlug) {
      try {
        wordsPerChapter = await this.fs.countWordsPerChapter(bookSlug);
      } catch {
        // Book may not exist or have no chapters
      }
    }

    const perAgent: AgentUsageBreakdown[] = perAgentRaw.map((r) => ({
      ...r,
      estimatedCost: this.estimateCost(r.inputTokens, r.outputTokens, r.thinkingTokens),
    }));

    const perPhase: PhaseUsageBreakdown[] = perPhaseRaw.map((r) => ({
      ...r,
      estimatedCost: this.estimateCost(r.inputTokens, r.outputTokens, r.thinkingTokens),
    }));

    const totalCostEstimate = this.estimateCost(
      usageSummary.totalInputTokens,
      usageSummary.totalOutputTokens,
      usageSummary.totalThinkingTokens,
    );

    return {
      usageOverTime,
      perAgent,
      perPhase,
      wordCountHistory,
      totalCostEstimate,
      wordsPerChapter,
      totalTokens: {
        input: usageSummary.totalInputTokens,
        output: usageSummary.totalOutputTokens,
        thinking: usageSummary.totalThinkingTokens,
      },
      conversationCount: usageSummary.conversationCount,
    };
  }

  async recordWordCountSnapshot(bookSlug: string): Promise<void> {
    try {
      const chapters = await this.fs.countWordsPerChapter(bookSlug);
      const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
      this.db.recordWordCountSnapshot(bookSlug, totalWords, chapters.length);
    } catch {
      // Silently skip if book doesn't exist or has no chapters
    }
  }

  private estimateCost(inputTokens: number, outputTokens: number, thinkingTokens: number): number {
    const defaultPricing = MODEL_PRICING['claude-opus-4-20250514'];
    if (!defaultPricing) return 0;

    const inputCost = (inputTokens / 1_000_000) * defaultPricing.inputPer1M;
    const outputCost = ((outputTokens + thinkingTokens) / 1_000_000) * defaultPricing.outputPer1M;
    return Math.round((inputCost + outputCost) * 100) / 100;
  }
}
