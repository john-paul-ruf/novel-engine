import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UsageService } from './UsageService';
import { makeConversation, makeDb, makeUsage } from '../test/db';

let db: ReturnType<typeof makeDb>;
let service: UsageService;

beforeEach(() => {
  db = makeDb();
  service = new UsageService(db);
});

afterEach(() => {
  db.close();
});

describe('recordUsage', () => {
  it('persists raw token counts retrievable via getByConversation', () => {
    const conv = makeConversation(db);
    service.recordUsage({
      conversationId: conv.id,
      inputTokens: 120,
      outputTokens: 45,
      thinkingTokens: 8,
      model: 'claude-opus-4-20250514',
    });

    const records = service.getByConversation(conv.id);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      conversationId: conv.id,
      inputTokens: 120,
      outputTokens: 45,
      thinkingTokens: 8,
      model: 'claude-opus-4-20250514',
    });
    expect(records[0].timestamp).toBeTruthy();
  });
});

describe('getSummary', () => {
  it('aggregates totals across all books and counts each conversation once', () => {
    const a = makeConversation(db, { bookSlug: 'book-a' });
    const b = makeConversation(db, { bookSlug: 'book-b' });
    makeUsage(db, a.id, { inputTokens: 100, outputTokens: 50, thinkingTokens: 10 });
    makeUsage(db, a.id, { inputTokens: 30, outputTokens: 20, thinkingTokens: 5 });
    makeUsage(db, b.id, { inputTokens: 1, outputTokens: 2, thinkingTokens: 3 });

    expect(service.getSummary()).toEqual({
      totalInputTokens: 131,
      totalOutputTokens: 72,
      totalThinkingTokens: 18,
      conversationCount: 2,
    });
  });

  it('filters by bookSlug', () => {
    const a = makeConversation(db, { bookSlug: 'book-a' });
    const b = makeConversation(db, { bookSlug: 'book-b' });
    makeUsage(db, a.id, { inputTokens: 100, outputTokens: 50, thinkingTokens: 10 });
    makeUsage(db, b.id, { inputTokens: 1, outputTokens: 2, thinkingTokens: 3 });

    expect(service.getSummary('book-b')).toEqual({
      totalInputTokens: 1,
      totalOutputTokens: 2,
      totalThinkingTokens: 3,
      conversationCount: 1,
    });
  });

  it('returns zeros for an empty database', () => {
    expect(service.getSummary()).toEqual({
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalThinkingTokens: 0,
      conversationCount: 0,
    });
  });
});

describe('getByConversation', () => {
  it('returns an empty array for an unknown conversation', () => {
    expect(service.getByConversation('no-such-conversation')).toEqual([]);
  });
});
