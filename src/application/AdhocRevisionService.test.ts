import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IAuditService } from '@domain/interfaces';
import type { StreamEvent } from '@domain/types';
import { AdhocRevisionService } from './AdhocRevisionService';
import { StreamManager } from './StreamManager';
import { makeConversation, makeDb, makeMessage } from '../test/db';
import {
  makeFakeAgents,
  makeFakeFs,
  makeFakeRegistry,
  makeFakeSettings,
  makeModelInfo,
  makeScriptedProvider,
  makeUsageRecorder,
  type ScriptedProvider,
} from '../test/fakes';

const APP_SETTINGS = {
  model: 'claude-opus-4-20250514',
  maxTokens: 4096,
  enableThinking: false,
  thinkingBudget: 5000,
  overrideThinkingBudget: false,
};

let db: ReturnType<typeof makeDb>;
let provider: ScriptedProvider;
let audit: { runMotifAudit: ReturnType<typeof vi.fn> };
let service: AdhocRevisionService;
let events: StreamEvent[];
let conversationId: string;

function handle(overrides: Partial<Parameters<AdhocRevisionService['handleMessage']>[0]> = {}) {
  return service.handleMessage({
    conversationId,
    bookSlug: 'book',
    message: 'Fix the pacing in act two.',
    appSettings: APP_SETTINGS,
    agent: { systemPrompt: 'Forge system prompt', thinkingBudget: 8000 },
    onEvent: (e) => events.push(e),
    sessionId: 'session-1',
    ...overrides,
  });
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  db = makeDb();
  provider = makeScriptedProvider();
  audit = { runMotifAudit: vi.fn(async () => undefined) };
  const fs = makeFakeFs(
    { 'chapters/02-two/draft.md': 'prose words here', 'source/pitch.md': 'the pitch' },
    { bookSlug: 'book' }
  );
  service = new AdhocRevisionService(
    makeFakeAgents(),
    audit as unknown as IAuditService,
    makeFakeRegistry(provider, { models: [makeModelInfo(APP_SETTINGS.model)] }),
    db,
    fs,
    new StreamManager(db, makeUsageRecorder().usage)
  );
  events = [];

  const conversation = makeConversation(db, { bookSlug: 'book', agentName: 'Forge', purpose: 'adhoc-revision' });
  conversationId = conversation.id;
  makeMessage(db, conversationId, { content: 'Fix the pacing in act two.' });
  db.createStreamSession({
    id: 'session-1',
    conversationId,
    agentName: 'Forge',
    model: APP_SETTINGS.model,
    bookSlug: 'book',
    startedAt: '2026-01-01 00:00:00',
    endedAt: null,
    finalStage: 'idle',
    filesTouched: {},
    interrupted: false,
  });
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe('handleMessage', () => {
  it('runs the motif audit, assembles the Forge prompt with manifest, and streams to completion', async () => {
    provider.scriptNext([
      { type: 'textDelta', text: 'Revision plan drafted.' },
      { type: 'done', inputTokens: 10, outputTokens: 5, thinkingTokens: 0, filesTouched: {} },
    ]);

    await handle();

    expect(audit.runMotifAudit).toHaveBeenCalledWith(
      expect.objectContaining({ bookSlug: 'book', sessionId: 'session-1' })
    );
    expect(events.some((e) => e.type === 'status' && e.message.includes('Motif audit complete'))).toBe(true);

    const call = provider.calls[0];
    expect(call.systemPrompt).toContain('Forge system prompt');
    expect(call.systemPrompt).toContain('[raw:ADHOC-REVISION.md]');
    expect(call.systemPrompt).toContain('## Project Manifest');
    expect(call.systemPrompt).toContain('`chapters/02-two/draft.md`');
    expect(call.maxTurns).toBe(10); // Forge registry maxTurns
    expect(call.messages).toEqual([{ role: 'user', content: 'Fix the pacing in act two.' }]);

    // StreamManager saved the assistant reply on done
    const saved = db.getMessages(conversationId);
    expect(saved.at(-1)).toMatchObject({ role: 'assistant', content: 'Revision plan drafted.' });
  });

  it('continues without the audit when it fails, with a skipped status', async () => {
    audit.runMotifAudit.mockRejectedValue(new Error('ledger missing'));
    provider.scriptNext([
      { type: 'textDelta', text: 'Plan anyway.' },
      { type: 'done', inputTokens: 1, outputTokens: 1, thinkingTokens: 0, filesTouched: {} },
    ]);

    await handle();

    expect(events.some((e) => e.type === 'status' && e.message.includes('Motif audit skipped'))).toBe(true);
    expect(provider.calls.length).toBe(1);
  });

  it('resolves the thinking budget from overrides and agent defaults', async () => {
    await handle({ thinkingBudgetOverride: 12_000 });
    expect(provider.calls[0].thinkingBudget).toBe(12_000);

    provider.calls.length = 0;
    await handle({
      appSettings: { ...APP_SETTINGS, enableThinking: true },
    });
    expect(provider.calls[0].thinkingBudget).toBe(8000); // agent default
  });
});
