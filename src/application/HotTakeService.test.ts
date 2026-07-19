import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamEvent } from '@domain/types';
import { CLAUDE_CLI_PROVIDER_ID, DEFAULT_SETTINGS } from '@domain/constants';
import { HotTakeService } from './HotTakeService';
import { StreamManager } from './StreamManager';
import { makeConversation, makeDb, makeMessage } from '../test/db';
import {
  makeFakeAgents,
  makeFakeFs,
  makeFakeRegistry,
  makeModelInfo,
  makeScriptedProvider,
  makeUsageRecorder,
  type FakeFileSystem,
  type ScriptedProvider,
} from '../test/fakes';

const APP_SETTINGS = {
  model: DEFAULT_SETTINGS.model,
  maxTokens: 4096,
  enableThinking: false,
  thinkingBudget: 5000,
  overrideThinkingBudget: false,
};

let db: ReturnType<typeof makeDb>;
let fs: FakeFileSystem;
let provider: ScriptedProvider;
let service: HotTakeService;
let events: StreamEvent[];
let conversationId: string;

function makeService(): HotTakeService {
  return new HotTakeService(
    makeFakeAgents(),
    makeFakeRegistry(provider, { models: [makeModelInfo(DEFAULT_SETTINGS.model, provider.providerId)] }),
    db,
    fs,
    new StreamManager(db, makeUsageRecorder().usage)
  );
}

function handle() {
  return service.handleMessage({
    conversationId,
    bookSlug: 'book',
    appSettings: APP_SETTINGS,
    agent: { systemPrompt: 'Ghostlight core prompt', thinkingBudget: 6000 },
    onEvent: (e) => events.push(e),
    sessionId: 'session-ht',
  });
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  db = makeDb();
  fs = makeFakeFs(
    { 'chapters/02-two/draft.md': 'w '.repeat(500).trim(), 'chapters/03-three/draft.md': 'w '.repeat(400).trim() },
    { bookSlug: 'book' }
  );
  provider = makeScriptedProvider();
  events = [];
  conversationId = makeConversation(db, { bookSlug: 'book', agentName: 'Ghostlight', purpose: 'hot-take' }).id;
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe('single-call mode (Claude CLI)', () => {
  beforeEach(() => {
    provider = makeScriptedProvider({ providerId: CLAUDE_CLI_PROVIDER_ID });
    service = makeService();
  });

  it('sends one full-manuscript call with the chapter listing and hot-take instructions', async () => {
    makeMessage(db, conversationId, { content: '__HOT_TAKE__' });
    provider.scriptNext([
      { type: 'textDelta', text: 'Honest reaction.' },
      { type: 'done', inputTokens: 10, outputTokens: 5, thinkingTokens: 0, filesTouched: {} },
    ]);

    await handle();

    expect(provider.calls.length).toBe(1);
    const call = provider.calls[0];
    expect(call.maxTurns).toBe(50); // Ghostlight registry maxTurns
    expect(call.systemPrompt).toContain('Ghostlight core prompt');
    expect(call.systemPrompt).toContain('[raw:HOT-TAKE.md]');
    expect(call.systemPrompt).toContain('chapters/02-two/draft.md');
    expect(call.messages[0].content).toBe('__HOT_TAKE__'); // existing history used

    // StreamManager saved the reply
    expect(db.getMessages(conversationId).at(-1)).toMatchObject({ role: 'assistant', content: 'Honest reaction.' });
  });

  it('falls back to a synthetic user message when the conversation is empty', async () => {
    provider.scriptNext([{ type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {} }]);

    await handle();

    expect(provider.calls[0].messages).toEqual([
      { role: 'user', content: 'Read the full manuscript and give me your honest reaction.' },
    ]);
  });
});

describe('multi-call sipping mode (non-Claude providers)', () => {
  beforeEach(() => {
    service = makeService(); // default provider id 'fake-provider'
  });

  it('reads in one batch, synthesizes in chat, and cleans up scratch notes', async () => {
    let call = 0;
    provider.setImpl(async (params) => {
      call++;
      if (call === 1) {
        await fs.writeFile('book', 'source/.scratch/hot-take-batch-1.md', 'impressions');
      }
      params.onEvent({ type: 'textDelta', text: call === 1 ? 'batch notes' : 'THE HOT TAKE' });
      params.onEvent({ type: 'done', inputTokens: 2, outputTokens: 2, thinkingTokens: 0, filesTouched: {} });
    });

    await handle();

    expect(provider.calls.length).toBe(2);

    const batchCall = provider.calls[0];
    expect(batchCall.maxTurns).toBe(15);
    expect(batchCall.messages[0].content).toContain('source/.scratch/hot-take-batch-1.md');
    expect(batchCall.systemPrompt).toContain('HOT TAKE — an informal, off-the-record cold read');

    const synthCall = provider.calls[1];
    expect(synthCall.maxTurns).toBe(4); // 1 scratch + 3
    expect(synthCall.messages[0].content).toContain('AT MOST five paragraphs');
    expect(synthCall.systemPrompt).toContain('[raw:HOT-TAKE.md]');

    // Exactly one done reaches the caller (intermediate intercepted)
    expect(events.filter((e) => e.type === 'done').length).toBe(1);
    const progress = events.filter((e) => e.type === 'multiCallProgress').map((e) => (e.type === 'multiCallProgress' ? e.label : ''));
    expect(progress).toEqual(['Reading manuscript', 'Delivering hot take']);

    // Scratch cleaned up after synthesis
    expect(fs.files.has('book/source/.scratch/hot-take-batch-1.md')).toBe(false);

    // Batch prompt + synthesis prompt + two assistant replies persisted
    const roles = db.getMessages(conversationId).map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('splits large manuscripts into multiple batches that thread prior trackers', async () => {
    fs.files.set('book/chapters/02-two/draft.md', 'w '.repeat(15_000).trim());
    fs.files.set('book/chapters/03-three/draft.md', 'w '.repeat(15_000).trim());
    provider.setImpl(async (params) => {
      params.onEvent({ type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {} });
    });

    await handle();

    expect(provider.calls.length).toBe(3); // 2 batches + synthesis
    expect(provider.calls[1].messages[0].content).toContain('hot-take-batch-1.md'); // reads prior
    expect(provider.calls[1].messages[0].content).toContain('hot-take-batch-2.md'); // writes own
    expect(provider.calls[2].messages[0].content).toContain('- `source/.scratch/hot-take-batch-1.md`');
    expect(provider.calls[2].messages[0].content).toContain('- `source/.scratch/hot-take-batch-2.md`');
  });

  it('a failed batch stops the flow, preserves scratch notes, and reports the error', async () => {
    let call = 0;
    provider.setImpl(async () => {
      call++;
      throw new Error('model went away');
    });
    fs.files.set('book/source/.scratch/hot-take-batch-1.md', 'earlier notes'); // pre-existing survives

    await handle();

    expect(provider.calls.length).toBe(1); // synthesis never attempted
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringContaining('Hot take batch 1/1 failed'),
    });
    expect(fs.files.has('book/source/.scratch/hot-take-batch-1.md')).toBe(true);
  });

  it('errors immediately when the book has no chapter drafts', async () => {
    fs = makeFakeFs({}, { bookSlug: 'book' });
    service = makeService();

    await handle();

    expect(provider.calls.length).toBe(0);
    expect(events.at(-1)).toEqual({ type: 'error', message: 'No chapter drafts found to read.' });
  });
});
