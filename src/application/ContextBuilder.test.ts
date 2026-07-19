import { describe, expect, it } from 'vitest';
import type { Message, ProjectManifest } from '@domain/types';
import { ContextBuilder } from './ContextBuilder';

function makeManifest(files: { path: string; wordCount: number }[] = []): ProjectManifest {
  return {
    meta: {
      slug: 'book',
      title: 'The Book',
      author: 'Auth',
      status: 'first-draft',
      created: '2026-01-01T00:00:00.000Z',
      coverImage: '',
    },
    files,
    chapterCount: 2,
    totalWordCount: 1234,
  };
}

function makeMessages(count: number, contentLength = 20): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    conversationId: 'conv',
    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: `${i}:`.padEnd(contentLength, 'x'),
    thinking: '',
    timestamp: '2026-01-01 00:00:00',
  }));
}

const builder = new ContextBuilder();

describe('system prompt assembly', () => {
  it('layers agent prompt, manifest, guidance, write instructions, series and purpose sections in order', () => {
    const result = builder.build({
      agentName: 'Verity',
      agentSystemPrompt: 'VERITY CORE PROMPT',
      manifest: makeManifest([{ path: 'source/pitch.md', wordCount: 100 }]),
      messages: makeMessages(2),
      purposeInstructions: 'PURPOSE SECTION',
      authorProfilePath: '/abs/author-profile.md',
      seriesBiblePath: '/abs/series/saga/series-bible.md',
    });

    const sp = result.systemPrompt;
    expect(sp.indexOf('VERITY CORE PROMPT')).toBe(0);
    expect(sp).toContain('## Active Book');
    expect(sp).toContain('| `source/pitch.md` | 100 |');
    expect(sp).toContain('## Context Loading Guidance'); // Verity is creative
    expect(sp).toContain('## File Writing');
    expect(sp).toContain('### Series Context');
    expect(sp).toContain('PURPOSE SECTION');

    // Ordering: purpose comes last, guidance before write instructions
    expect(sp.indexOf('## Context Loading Guidance')).toBeLessThan(sp.indexOf('## File Writing'));
    expect(sp.indexOf('PURPOSE SECTION')).toBeGreaterThan(sp.indexOf('### Series Context'));
  });

  it('substitutes absolute author-profile and series-bible paths into the read guidance', () => {
    const result = builder.build({
      agentName: 'Spark', // guidance includes `author-profile.md` and `series-bible.md`
      agentSystemPrompt: 'p',
      manifest: makeManifest(),
      messages: [],
      authorProfilePath: '/abs/author-profile.md',
      seriesBiblePath: '/abs/series-bible.md',
    });

    const guidance = result.systemPrompt.split('## Context Loading Guidance')[1];
    expect(guidance).toContain('`/abs/author-profile.md`');
    expect(guidance).toContain('`/abs/series-bible.md`');
    expect(guidance).not.toContain('`author-profile.md`');
  });

  it('omits read guidance for non-creative agents and shows the empty-book note', () => {
    const result = builder.build({
      agentName: 'Wrangler',
      agentSystemPrompt: 'p',
      manifest: makeManifest([]),
      messages: [],
    });

    expect(result.systemPrompt).not.toContain('## Context Loading Guidance');
    expect(result.systemPrompt).toContain('*No files yet — this is a new book.*');
  });

  it('reports diagnostics for files and turn compaction', () => {
    const result = builder.build({
      agentName: 'Spark',
      agentSystemPrompt: 'p',
      manifest: makeManifest([{ path: 'about.json', wordCount: 5 }]),
      messages: makeMessages(3),
    });

    expect(result.diagnostics.filesAvailable).toEqual(['about.json']);
    expect(result.diagnostics.conversationTurnsSent).toBe(3);
    expect(result.diagnostics.conversationTurnsDropped).toBe(0);
    expect(result.diagnostics.manifestTokenEstimate).toBeGreaterThan(0);
  });
});

describe('compactConversation — fixed rules (no budget)', () => {
  it('keeps everything at ≤20 turns', () => {
    expect(builder.compactConversation(makeMessages(20)).length).toBe(20);
    expect(builder.compactConversation([])).toEqual([]);
  });

  it('keeps 8 recent turns plus a two-message note at 21–40 turns', () => {
    const compacted = builder.compactConversation(makeMessages(30));
    expect(compacted.length).toBe(10);
    expect(compacted[0].content).toContain('22 earlier messages omitted');
    expect(compacted[1].role).toBe('assistant');
    expect(compacted.at(-1)?.content).toBe(makeMessages(30).at(-1)?.content);
  });

  it('keeps 6 recent turns plus the note beyond 40 turns', () => {
    const compacted = builder.compactConversation(makeMessages(50));
    expect(compacted.length).toBe(8);
    expect(compacted[0].content).toContain('44 earlier messages omitted');
  });
});

describe('compactConversation — token budget', () => {
  // Budget fractions are relative to MAX_CONTEXT_TOKENS (200k):
  // generous >40%, moderate >20%, tight >10%, else critical.
  it('caps kept turns by budget tier: generous keeps all, moderate 8, tight 4, critical 2', () => {
    const messages = makeMessages(30, 20); // tiny messages — token cost never binds

    expect(builder.compactConversation(messages, 100_000).length).toBe(30); // generous
    expect(builder.compactConversation(messages, 60_000).length).toBe(8 + 2); // moderate + note pair
    expect(builder.compactConversation(messages, 30_000).length).toBe(4 + 2); // tight
    expect(builder.compactConversation(messages, 10_000).length).toBe(2 + 2); // critical
  });

  it('drops older turns that exceed the token budget, noting the count', () => {
    const messages = makeMessages(30, 4000); // 1000 tokens each
    // Generous tier (81k > 40%), but only ~80 turns' worth is (81k-200)/1000 ≈ 80 —
    // use a budget fitting ~3 messages: 3×1000 + 200 note reserve
    const compacted = builder.compactConversation(messages, 82_000);
    expect(compacted.length).toBe(30); // all fit in generous with big budget

    const tight = builder.compactConversation(messages, 3_300);
    // critical tier (≤2 turns) and budget fits 2×1000+200
    expect(tight.length).toBe(2 + 2);
    expect(tight[0].content).toContain('28 earlier messages omitted');
  });

  it('force-keeps the newest message even when the budget cannot fit it', () => {
    const messages = makeMessages(5, 40_000); // 10k tokens each
    const compacted = builder.compactConversation(messages, 1_000);

    // note pair + the forced most-recent message
    expect(compacted.length).toBe(3);
    expect(compacted.at(-1)?.content).toBe(messages.at(-1)?.content);
    expect(compacted[0].content).toContain('4 earlier messages omitted');
  });
});
