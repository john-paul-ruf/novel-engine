import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceGenerationEvent, StreamEvent } from '@domain/types';
import { SourceGenerationService } from './SourceGenerationService';
import { makeDb } from '../test/db';
import {
  makeFakeAgents,
  makeFakeFs,
  makeFakeRegistry,
  makeFakeSettings,
  makeModelInfo,
  makeScriptedProvider,
  type ScriptedProvider,
} from '../test/fakes';
import { DEFAULT_SETTINGS } from '@domain/constants';

let db: ReturnType<typeof makeDb>;
let provider: ScriptedProvider;
let service: SourceGenerationService;
let progress: SourceGenerationEvent[];
let streamEvents: StreamEvent[];

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  db = makeDb();
  provider = makeScriptedProvider();
  service = new SourceGenerationService(
    makeFakeSettings({ enableThinking: true }),
    makeFakeAgents(),
    db,
    makeFakeFs({ 'chapters/01-one/draft.md': 'imported prose' }),
    makeFakeRegistry(provider, { models: [makeModelInfo(DEFAULT_SETTINGS.model)] })
  );
  progress = [];
  streamEvents = [];
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

const generate = () =>
  service.generate({
    bookSlug: 'test-book',
    onProgress: (e) => progress.push(e),
    onStreamEvent: (e) => streamEvents.push(e),
  });

describe('generate', () => {
  it('runs the 4 steps sequentially with progress events and persists each exchange', async () => {
    for (let i = 0; i < 4; i++) {
      provider.scriptNext([
        { type: 'textDelta', text: `step ${i} output` },
        { type: 'done', inputTokens: 1, outputTokens: 1, thinkingTokens: 0, filesTouched: {} },
      ]);
    }

    await generate();

    expect(progress.map((e) => e.type)).toEqual([
      'started',
      'step-started', 'step-done',
      'step-started', 'step-done',
      'step-started', 'step-done',
      'step-started', 'step-done',
      'done',
    ]);

    const started = progress[0];
    if (started.type === 'started') {
      expect(started.steps.map((s) => s.agentName)).toEqual(['Spark', 'Verity', 'Verity', 'Verity']);
    }

    // 4 provider calls with per-agent settings from the registry
    expect(provider.calls.length).toBe(4);
    expect(provider.calls[0].thinkingBudget).toBe(4000); // Spark budget, thinking enabled
    expect(provider.calls[0].maxTurns).toBe(5);
    expect(provider.calls[0].messages.at(-1)?.content).toContain('write it to source/pitch.md');
    expect(provider.calls[3].messages.at(-1)?.content).toContain('source/motif-ledger.json');

    // Each step created a conversation and saved both sides. Note: the DB's
    // first-user-message rule overwrites the step-label title with the prompt.
    const conversations = db.listConversations('test-book');
    expect(conversations.length).toBe(4);
    for (const conversation of conversations) {
      expect(conversation.title).toContain('This book was imported');
    }
    for (const conversation of conversations) {
      expect(db.getMessages(conversation.id).map((m) => m.role)).toEqual(['user', 'assistant']);
    }

    expect(streamEvents.filter((e) => e.type === 'textDelta').length).toBe(4);
  });

  it('a failing step reports step-error and the remaining steps still run', async () => {
    let call = 0;
    provider.setImpl(async (params) => {
      call++;
      if (call === 2) throw new Error('model unavailable');
      params.onEvent({ type: 'textDelta', text: `ok ${call}` });
      params.onEvent({ type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {} });
    });

    await generate();

    expect(progress).toContainEqual({ type: 'step-error', index: 1, message: 'model unavailable' });
    expect(progress.filter((e) => e.type === 'step-done').map((e) => (e.type === 'step-done' ? e.index : -1))).toEqual([0, 2, 3]);
    expect(progress.at(-1)?.type).toBe('done');

    // The failed step saved its user message but no assistant reply
    const conversations = db.listConversations('test-book');
    const userOnly = conversations.filter((c) => db.getMessages(c.id).length === 1);
    expect(userOnly.length).toBe(1);
    expect(db.getMessages(userOnly[0].id)[0].role).toBe('user');
  });

  it('disables thinking budgets when settings have thinking off', async () => {
    service = new SourceGenerationService(
      makeFakeSettings({ enableThinking: false }),
      makeFakeAgents(),
      db,
      makeFakeFs({}),
      makeFakeRegistry(provider, { models: [makeModelInfo(DEFAULT_SETTINGS.model)] })
    );

    await generate();

    expect(provider.calls.every((c) => c.thinkingBudget === undefined)).toBe(true);
  });
});
