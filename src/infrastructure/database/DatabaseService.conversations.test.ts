import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from './DatabaseService';
import { makeConversation, makeDb, makeMessage } from '../../test/db';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let db: DatabaseService;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined); // silence migration logs
  db = makeDb();
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe('conversations', () => {
  it('createConversation persists all fields and stamps timestamps', () => {
    const created = makeConversation(db, {
      id: 'conv-a',
      bookSlug: 'my-book',
      agentName: 'Verity',
      pipelinePhase: 'scaffold',
      purpose: 'pipeline',
      title: 'Working title',
    });

    expect(created.id).toBe('conv-a');
    expect(created.bookSlug).toBe('my-book');
    expect(created.agentName).toBe('Verity');
    expect(created.pipelinePhase).toBe('scaffold');
    expect(created.purpose).toBe('pipeline');
    expect(created.title).toBe('Working title');
    expect(created.createdAt.length).toBeGreaterThan(0);
    expect(created.updatedAt.length).toBeGreaterThan(0);

    expect(db.getConversation('conv-a')).toEqual(created);
  });

  it('supports a null pipeline phase and non-pipeline purposes', () => {
    const conv = makeConversation(db, { pipelinePhase: null, purpose: 'pitch-room' });
    const loaded = db.getConversation(conv.id);
    expect(loaded?.pipelinePhase).toBeNull();
    expect(loaded?.purpose).toBe('pitch-room');
  });

  it('getConversation returns null for an unknown id', () => {
    expect(db.getConversation('missing')).toBeNull();
  });

  it('listConversations returns only the requested book, most recently updated first', async () => {
    const first = makeConversation(db, { bookSlug: 'book-a' });
    makeConversation(db, { bookSlug: 'book-b' });
    await sleep(1100); // updated_at has 1-second resolution
    const second = makeConversation(db, { bookSlug: 'book-a' });

    expect(db.listConversations('book-a').map((c) => c.id)).toEqual([second.id, first.id]);

    // Saving a message bumps the parent to the top
    await sleep(1100);
    makeMessage(db, first.id);
    expect(db.listConversations('book-a').map((c) => c.id)).toEqual([first.id, second.id]);
  });

  it('deleteConversation cascades to its messages', () => {
    const conv = makeConversation(db);
    makeMessage(db, conv.id);
    makeMessage(db, conv.id, { role: 'assistant', content: 'reply' });

    db.deleteConversation(conv.id);

    expect(db.getConversation(conv.id)).toBeNull();
    expect(db.getMessages(conv.id)).toEqual([]);
  });

  it('updateBookSlug moves all conversations to the new slug', () => {
    makeConversation(db, { bookSlug: 'old-slug' });
    makeConversation(db, { bookSlug: 'old-slug' });

    db.updateBookSlug('old-slug', 'new-slug');

    expect(db.listConversations('old-slug')).toEqual([]);
    expect(db.listConversations('new-slug').length).toBe(2);
  });
});

describe('messages', () => {
  it('saveMessage assigns a nanoid and round-trips role, content, and thinking', () => {
    const conv = makeConversation(db);
    const saved = makeMessage(db, conv.id, {
      role: 'assistant',
      content: 'the reply',
      thinking: 'hidden reasoning',
    });

    expect(saved.id).toMatch(/^[A-Za-z0-9_-]{21}$/);
    expect(saved.conversationId).toBe(conv.id);
    expect(saved.role).toBe('assistant');
    expect(saved.content).toBe('the reply');
    expect(saved.thinking).toBe('hidden reasoning');
    expect(saved.timestamp.length).toBeGreaterThan(0);
  });

  it('getMessages returns all messages for the conversation in insertion order', () => {
    const conv = makeConversation(db);
    const other = makeConversation(db);
    makeMessage(db, conv.id, { content: 'one' });
    makeMessage(db, conv.id, { role: 'assistant', content: 'two' });
    makeMessage(db, conv.id, { content: 'three' });
    makeMessage(db, other.id, { content: 'unrelated' });

    expect(db.getMessages(conv.id).map((m) => m.content)).toEqual(['one', 'two', 'three']);
  });

  it('rejects messages for a nonexistent conversation (FK enforced)', () => {
    expect(() => makeMessage(db, 'no-such-conversation')).toThrow();
  });

  it('empty and very long content round-trip intact', () => {
    const conv = makeConversation(db);
    const long = 'x'.repeat(100_000);
    makeMessage(db, conv.id, { content: '' });
    makeMessage(db, conv.id, { role: 'assistant', content: long });

    const [empty, big] = db.getMessages(conv.id);
    expect(empty.content).toBe('');
    expect(big.content).toBe(long);
  });

  it('the first user message sets the conversation title (first 80 chars)', () => {
    const conv = makeConversation(db, { title: '' });
    const content = 'A'.repeat(120);
    makeMessage(db, conv.id, { content });

    expect(db.getConversation(conv.id)?.title).toBe('A'.repeat(80));
  });

  it('later user messages do not overwrite the title', () => {
    const conv = makeConversation(db, { title: '' });
    makeMessage(db, conv.id, { content: 'first prompt' });
    makeMessage(db, conv.id, { content: 'second prompt' });

    expect(db.getConversation(conv.id)?.title).toBe('first prompt');
  });

  it('an assistant-first message leaves the title empty until a user message arrives', () => {
    const conv = makeConversation(db, { title: '' });
    makeMessage(db, conv.id, { role: 'assistant', content: 'greeting' });
    expect(db.getConversation(conv.id)?.title).toBe('');

    makeMessage(db, conv.id, { content: 'user speaks' });
    expect(db.getConversation(conv.id)?.title).toBe('user speaks');
  });
});
