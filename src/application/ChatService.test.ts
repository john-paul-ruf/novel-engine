import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationPurpose, PipelinePhaseId, StreamEvent } from '@domain/types';
import { AGENT_REGISTRY, DEFAULT_SETTINGS } from '@domain/constants';
import { ChatService } from './ChatService';
import { StreamManager } from './StreamManager';
import { makeDb } from '../test/db';
import {
  makeFakeAdhocRevision,
  makeFakeAgents,
  makeFakeFs,
  makeFakeHotTake,
  makeFakePitchRoom,
  makeFakeRegistry,
  makeFakeSeries,
  makeFakeSettings,
  makeFakeVersion,
  makeModelInfo,
  makeNoopChapterValidator,
  makeScriptedProvider,
  makeUsageRecorder,
} from '../test/fakes';

const MODEL = DEFAULT_SETTINGS.model;

type Harness = ReturnType<typeof makeHarness>;

function makeHarness(opts: { fsFiles?: Record<string, string>; registryModels?: string[] } = {}) {
  const db = makeDb();
  const settings = makeFakeSettings();
  const agents = makeFakeAgents();
  const provider = makeScriptedProvider();
  const registry = makeFakeRegistry(provider, {
    models: (opts.registryModels ?? [MODEL]).map((id) => makeModelInfo(id)),
  });
  const fs = makeFakeFs(opts.fsFiles ?? { 'source/pitch.md': 'a pitch' });
  const recorder = makeUsageRecorder();
  const streamManager = new StreamManager(db, recorder.usage);
  const pitchRoom = makeFakePitchRoom();
  const hotTake = makeFakeHotTake();
  const adhoc = makeFakeAdhocRevision();

  const chat = new ChatService(
    settings,
    agents,
    db,
    registry,
    fs,
    makeNoopChapterValidator(),
    pitchRoom,
    hotTake,
    adhoc,
    streamManager,
    makeFakeSeries(),
    makeFakeVersion()
  );

  return { db, settings, agents, provider, registry, fs, chat, streamManager, pitchRoom, hotTake, adhoc, usageRecords: recorder.records };
}

let h: Harness;
let events: StreamEvent[];

async function newConversation(
  purpose: ConversationPurpose = 'pipeline',
  agentName: Parameters<Harness['chat']['createConversation']>[0]['agentName'] = 'Spark',
  pipelinePhase: PipelinePhaseId | null = null
): Promise<string> {
  const conversation = await h.chat.createConversation({
    bookSlug: 'test-book',
    agentName,
    pipelinePhase,
    purpose,
  });
  return conversation.id;
}

function send(conversationId: string, overrides: Partial<Parameters<Harness['chat']['sendMessage']>[0]> = {}) {
  return h.chat.sendMessage({
    agentName: 'Spark',
    message: 'Pitch me something.',
    conversationId,
    bookSlug: 'test-book',
    onEvent: (e) => events.push(e),
    ...overrides,
  });
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  h = makeHarness();
  events = [];
});

afterEach(() => {
  h.db.close();
  vi.restoreAllMocks();
});

describe('sendMessage — happy path', () => {
  it('persists both sides, records usage, forwards events, and returns changed files', async () => {
    const conversationId = await newConversation();
    h.provider.scriptNext([
      { type: 'textDelta', text: 'Here is ' },
      { type: 'textDelta', text: 'a pitch.' },
      { type: 'filesChanged', paths: ['source/pitch.md'] },
      { type: 'done', inputTokens: 100, outputTokens: 40, thinkingTokens: 0, filesTouched: { 'source/pitch.md': 1 } },
    ]);

    const result = await send(conversationId);

    expect(result.changedFiles).toEqual(['source/pitch.md']);

    const messages = h.db.getMessages(conversationId);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1].content).toBe('Here is a pitch.');

    expect(h.usageRecords).toEqual([
      { conversationId, inputTokens: 100, outputTokens: 40, thinkingTokens: 0, model: MODEL },
    ]);

    // Session created then completed
    expect(h.db.getActiveStreamSessions()).toEqual([]);

    const types = events.map((e) => e.type);
    expect(types).toContain('status'); // preparing + waiting
    expect(types).toContain('callStart');
    expect(types.at(-1)).toBe('done');
  });

  it('assembles the provider call from settings, agent registry, and built context', async () => {
    const conversationId = await newConversation();

    await send(conversationId, { maxTurnsOverride: undefined });

    const call = h.provider.calls[0];
    expect(call.model).toBe(MODEL);
    expect(call.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens);
    expect(call.maxTurns).toBe(AGENT_REGISTRY.Spark.maxTurns);
    expect(call.thinkingBudget).toBeUndefined(); // enableThinking=false by default
    expect(call.bookSlug).toBe('test-book');
    expect(call.conversationId).toBe(conversationId);
    expect(call.systemPrompt).toContain('Spark system prompt');
    expect(call.systemPrompt).toContain('| `source/pitch.md` | 2 |'); // manifest table
    expect(call.messages).toEqual([{ role: 'user', content: 'Pitch me something.' }]);

    // maxTurnsOverride wins over the registry value
    h.provider.scriptNext([{ type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {} }]);
    await send(conversationId, { maxTurnsOverride: 99 });
    expect(h.provider.calls[1].maxTurns).toBe(99);
  });

  it('warns and uses the fallback model when the configured model is unknown', async () => {
    h = makeHarness({ registryModels: ['other-model'] });
    const conversationId = await newConversation();

    await send(conversationId);

    expect(events.find((e) => e.type === 'warning')).toMatchObject({
      message: expect.stringContaining('Using other-model instead'),
    });
    expect(h.provider.calls[0].model).toBe('other-model');
  });

  it('builds Verity pipeline prompts from the composite phase files', async () => {
    const conversationId = await newConversation('pipeline', 'Verity', 'scaffold');
    // Second message avoids the multi-call branch (Verity has none anyway)
    await send(conversationId, { agentName: 'Verity', message: 'Build the outline.' });

    const call = h.provider.calls[0];
    expect(call.systemPrompt).toContain('[VERITY-CORE.md]');
    expect(call.systemPrompt).toContain('[VERITY-SCAFFOLD.md]');
    expect(call.systemPrompt).toContain('[VERITY-LEDGER.md]');
  });

  it('exposes context diagnostics per conversation after a send', async () => {
    const conversationId = await newConversation();
    await send(conversationId);

    const diagnostics = h.chat.getLastDiagnostics(conversationId);
    expect(diagnostics?.filesAvailable).toContain('source/pitch.md');
    expect(h.chat.getLastDiagnostics('unknown')).toBeNull();
    expect(h.chat.getLastDiagnostics()).not.toBeNull(); // most-recent fallback
  });
});

describe('sendMessage — guards and routing', () => {
  it('emits an error and saves nothing when no provider is available', async () => {
    h.provider.setImpl(async () => undefined);
    (h.provider as unknown as { isAvailable: () => Promise<boolean> }).isAvailable = async () => false;
    const conversationId = await newConversation();

    const result = await send(conversationId);

    expect(result.changedFiles).toEqual([]);
    expect(events).toEqual([
      { type: 'error', message: expect.stringContaining('No model provider is available') },
    ]);
    expect(h.db.getMessages(conversationId)).toEqual([]);
  });

  it.each([
    ['pitch-room', 'pitchRoom'],
    ['hot-take', 'hotTake'],
    ['adhoc-revision', 'adhoc'],
  ] as const)('routes %s conversations to the dedicated handler', async (purpose, handlerKey) => {
    const conversationId = await newConversation(purpose as ConversationPurpose);

    await send(conversationId);

    expect(h[handlerKey].handleMessage).toHaveBeenCalledOnce();
    expect(h[handlerKey].handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId, bookSlug: 'test-book' })
    );
    expect(h.provider.calls).toEqual([]); // normal pipeline skipped

    // User message is still persisted before routing
    expect(h.db.getMessages(conversationId).map((m) => m.role)).toEqual(['user']);
  });

  it('surfaces provider failures as error events and cleans up the session', async () => {
    h.provider.setImpl(async () => {
      throw new Error('provider exploded');
    });
    const conversationId = await newConversation();

    const result = await send(conversationId);

    expect(result.changedFiles).toEqual([]);
    expect(events.at(-1)).toEqual({ type: 'error', message: 'provider exploded' });
    expect(h.db.getActiveStreamSessions()).toEqual([]); // cleanupErroredStream ran
    expect(h.chat.getActiveStream()).toBeNull();
  });
});

describe('post-stream extraction fallback', () => {
  // Agents WITHOUT multi-call steps (Spark, Quill) — Ghostlight/Lumen/Sable/Forge
  // would route first pipeline messages into MultiCallOrchestrator instead.
  async function pipelineSend(agentName: 'Spark' | 'Quill', phase: PipelinePhaseId, response: string) {
    const conversationId = await newConversation('pipeline', agentName, phase);
    h.provider.scriptNext([
      { type: 'textDelta', text: response },
      { type: 'done', inputTokens: 1, outputTokens: 1, thinkingTokens: 0, filesTouched: {} },
    ]);
    await send(conversationId, { agentName, message: 'Go.' });
    return conversationId;
  }

  it('auto-saves the response to the phase output file when no files were written', async () => {
    h = makeHarness({ fsFiles: {} }); // no pre-existing pitch
    events = [];
    await pipelineSend('Spark', 'pitch', '# The Pitch\n\nA great concept.');

    expect(h.fs.files.get('test-book/source/pitch.md')).toBe('# The Pitch\n\nA great concept.');
    expect(events).toContainEqual({ type: 'filesChanged', paths: ['source/pitch.md'] });
    expect(events).toContainEqual({
      type: 'status',
      message: expect.stringContaining('Auto-saved response to source/pitch.md'),
    });
  });

  it('never overwrites an already-populated output file', async () => {
    await pipelineSend('Spark', 'pitch', 'conversational follow-up');

    // default harness seeds source/pitch.md with 'a pitch'
    expect(h.fs.files.get('test-book/source/pitch.md')).toBe('a pitch');
  });

  it('skips extraction when a content marker rejects narration (query-agents)', async () => {
    await pipelineSend('Quill', 'query-agents', "I'll research a few more agents, then compile the tracker.");

    expect(h.fs.files.has('test-book/source/query-tracker.md')).toBe(false);
    expect(events).toContainEqual({
      type: 'status',
      message: expect.stringContaining('did not contain the expected document format'),
    });
  });
});

describe('abort + recovery', () => {
  it('abortStream saves the partial response, marks it aborted, and ends the session', async () => {
    const conversationId = await newConversation();
    let releaseProvider: (() => void) | undefined;
    h.provider.setImpl(async (params) => {
      params.onEvent({ type: 'textDelta', text: 'partial prose' });
      await new Promise<void>((resolve) => {
        releaseProvider = resolve;
      });
    });

    const pending = send(conversationId);
    await vi.waitFor(() => {
      expect(h.chat.getActiveStream()).not.toBeNull();
    });

    h.chat.abortStream(conversationId);

    expect(h.provider.abortStream).toHaveBeenCalledWith(conversationId);
    const assistant = h.db.getMessages(conversationId).find((m) => m.role === 'assistant');
    expect(assistant?.content).toContain('partial prose');
    expect(assistant?.content).toContain('[Aborted by user]');
    expect(h.db.getActiveStreamSessions()).toEqual([]);
    expect(h.chat.getActiveStream()).toBeNull();

    releaseProvider?.();
    await pending;
  });

  it('recoverOrphanedSessions marks stale sessions interrupted and caches them', async () => {
    h.db.createStreamSession({
      id: 'orphan-1',
      conversationId: 'conv-x',
      agentName: 'Verity',
      model: MODEL,
      bookSlug: 'test-book',
      startedAt: '2026-01-01 00:00:00',
      endedAt: null,
      finalStage: 'drafting',
      filesTouched: {},
      interrupted: false,
    });

    const orphans = await h.chat.recoverOrphanedSessions();

    expect(orphans.map((o) => o.id)).toEqual(['orphan-1']);
    expect(h.db.getActiveStreamSessions()).toEqual([]);
    expect(h.chat.getRecoveredOrphans()).toBe(orphans);
  });

  it('isCliIdle reflects provider activity globally and per book', () => {
    expect(h.chat.isCliIdle()).toBe(true);
    expect(h.chat.isCliIdle('test-book')).toBe(true);
  });
});

describe('deepDive', () => {
  it('inlines the chapter draft into the user message and runs Lumen with 3 turns', async () => {
    h = makeHarness({
      fsFiles: {
        'chapters/03-turning/draft.md': 'The chapter prose body.',
        'chapters/03-turning/notes.md': 'author note',
        'source/scene-outline.md': 'outline text',
      },
    });
    events = [];

    const { conversationId } = await h.chat.deepDive({
      bookSlug: 'test-book',
      chapterSlug: '03-turning',
      onEvent: (e) => events.push(e),
    });

    const call = h.provider.calls[0];
    expect(call.maxTurns).toBe(3);
    expect(call.systemPrompt).toBe('Lumen system prompt');
    expect(call.messages[0].content).toContain('The chapter prose body.');
    expect(call.messages[0].content).toContain('author note');
    expect(call.messages[0].content).toContain('outline text');

    const saved = h.db.getMessages(conversationId);
    expect(saved[0].role).toBe('user');
    expect(saved[0].content).toContain('Chapter Deep Dive Request');
  });
});
