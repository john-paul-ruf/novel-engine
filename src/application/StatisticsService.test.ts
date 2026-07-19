import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatisticsService } from './StatisticsService';
import { makeConversation, makeDb, makeUsage } from '../test/db';
import { makeFakeFs, type FakeFileSystem } from '../test/fakes';

// Cost model under test: first MODEL_PRICING entry (opus: $15/M input, $75/M output)
// applied to input vs (output + thinking), rounded to cents.

let db: ReturnType<typeof makeDb>;
let fs: FakeFileSystem;
let service: StatisticsService;

beforeEach(() => {
  db = makeDb();
  fs = makeFakeFs(
    {
      'chapters/00-0-copyright/draft.md': 'legal boilerplate text',
      'chapters/01-first/draft.md': 'one two three four five',
      'chapters/02-second/draft.md': 'six seven eight',
    },
    { bookSlug: 'book-a' }
  );
  service = new StatisticsService(db, fs);
});

afterEach(() => {
  db.close();
});

function seedUsage(): void {
  const a = makeConversation(db, { bookSlug: 'book-a', agentName: 'Spark', pipelinePhase: 'pitch' });
  const b = makeConversation(db, { bookSlug: 'book-a', agentName: 'Verity', pipelinePhase: null });
  const c = makeConversation(db, { bookSlug: 'book-b', agentName: 'Spark', pipelinePhase: 'first-draft' });
  makeUsage(db, a.id, { inputTokens: 1_000_000, outputTokens: 100_000, thinkingTokens: 100_000 });
  makeUsage(db, b.id, { inputTokens: 500_000, outputTokens: 0, thinkingTokens: 0 });
  makeUsage(db, c.id, { inputTokens: 200_000, outputTokens: 40_000, thinkingTokens: 0 });
}

describe('getStatistics', () => {
  it('aggregates totals and estimates cost from the default pricing entry', async () => {
    seedUsage();

    const stats = await service.getStatistics();

    expect(stats.totalTokens).toEqual({ input: 1_700_000, output: 140_000, thinking: 100_000 });
    expect(stats.conversationCount).toBe(3);
    // 1.7M * $15/M + 240k * $75/M = 25.50 + 18.00
    expect(stats.totalCostEstimate).toBe(43.5);
    expect(stats.usageOverTime).toHaveLength(1); // all seeded today
    expect(stats.usageOverTime[0]).toMatchObject({
      inputTokens: 1_700_000,
      outputTokens: 140_000,
      thinkingTokens: 100_000,
    });
  });

  it('breaks usage down per agent with hand-computed costs, ordered by total tokens', async () => {
    seedUsage();

    const { perAgent } = await service.getStatistics();

    expect(perAgent.map((r) => r.agentName)).toEqual(['Spark', 'Verity']);
    // Spark: 1.2M in → 18.00; (140k + 100k) out+think → 18.00
    expect(perAgent[0]).toMatchObject({
      inputTokens: 1_200_000,
      outputTokens: 140_000,
      thinkingTokens: 100_000,
      conversationCount: 2,
      estimatedCost: 36,
    });
    // Verity: 500k in → 7.50
    expect(perAgent[1]).toMatchObject({ inputTokens: 500_000, estimatedCost: 7.5 });
  });

  it('breaks usage down per phase, bucketing NULL pipeline phase as adhoc', async () => {
    seedUsage();

    const { perPhase } = await service.getStatistics();

    const byPhase = Object.fromEntries(perPhase.map((r) => [r.phase, r.estimatedCost]));
    expect(byPhase).toEqual({ pitch: 30, adhoc: 7.5, 'first-draft': 6 });
  });

  it('scopes usage, history, and chapter words to the requested book', async () => {
    seedUsage();
    db.recordWordCountSnapshot('book-a', 8, 3);
    db.recordWordCountSnapshot('book-b', 999, 9);

    const stats = await service.getStatistics('book-a');

    expect(stats.totalTokens).toEqual({ input: 1_500_000, output: 100_000, thinking: 100_000 });
    expect(stats.conversationCount).toBe(2);
    expect(stats.wordCountHistory.map((s) => s.wordCount)).toEqual([8]);
    // fs fake: front matter 0 words, body chapters counted, sorted
    expect(stats.wordsPerChapter).toEqual([
      { slug: '00-0-copyright', wordCount: 0 },
      { slug: '01-first', wordCount: 5 },
      { slug: '02-second', wordCount: 3 },
    ]);
  });

  it('omits wordsPerChapter when no book is given', async () => {
    seedUsage();
    expect((await service.getStatistics()).wordsPerChapter).toEqual([]);
  });

  it('returns empty wordsPerChapter when the filesystem read fails', async () => {
    fs.countWordsPerChapter = async () => {
      throw new Error('book gone');
    };
    const stats = await service.getStatistics('book-a');
    expect(stats.wordsPerChapter).toEqual([]);
  });

  it('returns zeroed shapes for an empty database', async () => {
    const stats = await service.getStatistics();

    expect(stats).toMatchObject({
      usageOverTime: [],
      perAgent: [],
      perPhase: [],
      wordCountHistory: [],
      totalCostEstimate: 0,
      totalTokens: { input: 0, output: 0, thinking: 0 },
      conversationCount: 0,
    });
  });
});

describe('recordWordCountSnapshot', () => {
  it('records body-word totals and chapter count (front matter counts as a chapter at 0 words)', async () => {
    await service.recordWordCountSnapshot('book-a');

    const history = db.getWordCountHistory('book-a');
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ bookSlug: 'book-a', wordCount: 8, chapterCount: 3 });
  });

  it('silently skips when the filesystem read fails', async () => {
    fs.countWordsPerChapter = async () => {
      throw new Error('book gone');
    };

    await expect(service.recordWordCountSnapshot('book-a')).resolves.toBeUndefined();
    expect(db.getWordCountHistory('book-a')).toEqual([]);
  });
});
