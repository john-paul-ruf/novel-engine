import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IAgentService } from '@domain/interfaces';
import type { AuditResult, StreamEvent } from '@domain/types';
import { CLAUDE_CLI_PROVIDER_ID, DEFAULT_SETTINGS, VERITY_AUDIT_MAX_TOKENS } from '@domain/constants';
import { AuditService } from './AuditService';
import { makeConversation, makeDb } from '../test/db';
import {
  makeFakeAgents,
  makeFakeFs,
  makeFakeRegistry,
  makeFakeSettings,
  makeModelInfo,
  makeScriptedProvider,
  makeUsageRecorder,
  type FakeFileSystem,
  type ScriptedProvider,
} from '../test/fakes';

const AUDIT_RESULT = {
  chapter: '02-two',
  violations: [{ phrase: 'threadbare silence', severity: 'moderate', line: 12 }],
  summary: { total: 1, severity: 'moderate' },
} as unknown as AuditResult;

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
let usageRecords: ReturnType<typeof makeUsageRecorder>['records'];
let service: AuditService;
let events: StreamEvent[];

function makeService(opts: { models?: string[]; agents?: IAgentService } = {}): AuditService {
  const recorder = makeUsageRecorder();
  usageRecords = recorder.records;
  return new AuditService(
    makeFakeSettings(),
    opts.agents ?? makeFakeAgents(),
    makeFakeRegistry(provider, {
      models: (opts.models ?? [DEFAULT_SETTINGS.model, DEFAULT_SETTINGS.secondaryModel]).map((id) => makeModelInfo(id, provider.providerId)),
    }),
    db,
    fs,
    recorder.usage
  );
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  db = makeDb();
  fs = makeFakeFs(
    {
      'chapters/02-two/draft.md': 'The chapter prose.',
      'source/voice-profile.md': 'Voice notes.',
      'source/motif-ledger.json': JSON.stringify({ flaggedPhrases: [{ id: 'p1', phrase: 'threadbare silence' }] }),
    },
    { bookSlug: 'book' }
  );
  provider = makeScriptedProvider();
  service = makeService();
  events = [];
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe('auditChapter', () => {
  it('audits with the secondary model, parses fenced JSON, and records usage', async () => {
    provider.scriptNext([
      { type: 'textDelta', text: 'Here are my findings:\n```json\n' + JSON.stringify(AUDIT_RESULT) + '\n```\nDone.' },
      { type: 'done', inputTokens: 50, outputTokens: 20, thinkingTokens: 0, filesTouched: {} },
    ]);

    const result = await service.auditChapter({ bookSlug: 'book', chapterSlug: '02-two', onEvent: (e) => events.push(e) });

    expect(result).toEqual(AUDIT_RESULT);

    const call = provider.calls[0];
    expect(call.model).toBe(DEFAULT_SETTINGS.secondaryModel);
    expect(call.maxTokens).toBe(VERITY_AUDIT_MAX_TOKENS);
    expect(call.maxTurns).toBe(3);
    expect(call.systemPrompt).toBe('[raw:VERITY-AUDIT.md]');
    expect(call.messages[0].content).toContain('The chapter prose.');
    expect(call.messages[0].content).toContain('## Voice Profile');
    expect(call.messages[0].content).toContain('threadbare silence'); // flagged phrases forwarded

    expect(usageRecords[0]).toMatchObject({ inputTokens: 50, outputTokens: 20, model: DEFAULT_SETTINGS.secondaryModel });
    expect(events.some((e) => e.type === 'status' && e.message.includes('Auditing 02-two'))).toBe(true);
  });

  it('falls back to the primary model when the secondary is not registered', async () => {
    service = makeService({ models: [DEFAULT_SETTINGS.model] });
    provider.scriptNext([
      { type: 'textDelta', text: JSON.stringify(AUDIT_RESULT) },
      { type: 'done', inputTokens: 1, outputTokens: 1, thinkingTokens: 0, filesTouched: {} },
    ]);

    await service.auditChapter({ bookSlug: 'book', chapterSlug: '02-two' });

    expect(provider.calls[0].model).toBe(DEFAULT_SETTINGS.model);
    expect(provider.calls[0].maxTokens).toBe(DEFAULT_SETTINGS.maxTokens);
  });

  it('records the exchange in a target conversation when provided', async () => {
    const conversation = makeConversation(db, { bookSlug: 'book', agentName: 'Verity' });
    provider.scriptNext([
      { type: 'textDelta', text: JSON.stringify(AUDIT_RESULT) },
      { type: 'done', inputTokens: 1, outputTokens: 1, thinkingTokens: 0, filesTouched: {} },
    ]);

    await service.auditChapter({ bookSlug: 'book', chapterSlug: '02-two', conversationId: conversation.id });

    const contents = db.getMessages(conversation.id).map((m) => m.content);
    expect(contents[0]).toBe('[Auto-audit: 02-two]');
    expect(contents[1]).toBe('[Audit complete: 1 violation — moderate]');
  });

  it('returns null for a missing draft, a missing auditor prompt, or malformed JSON', async () => {
    expect(await service.auditChapter({ bookSlug: 'book', chapterSlug: '99-none' })).toBeNull();
    expect(provider.calls.length).toBe(0);

    const failingAgents = {
      ...makeFakeAgents(),
      loadRaw: async () => {
        throw new Error('missing agent file');
      },
    } as IAgentService;
    expect(await makeService({ agents: failingAgents }).auditChapter({ bookSlug: 'book', chapterSlug: '02-two' })).toBeNull();

    provider.scriptNext([
      { type: 'textDelta', text: 'I looked at the chapter and found nothing structured.' },
      { type: 'done', inputTokens: 1, outputTokens: 1, thinkingTokens: 0, filesTouched: {} },
    ]);
    expect(await service.auditChapter({ bookSlug: 'book', chapterSlug: '02-two' })).toBeNull();
  });
});

describe('fixChapter', () => {
  it('runs the fix pass with the primary model and persists the exchange + usage', async () => {
    const conversation = makeConversation(db, { bookSlug: 'book', agentName: 'Verity' });
    provider.scriptNext([
      { type: 'textDelta', text: 'Fixed both instances.' },
      { type: 'done', inputTokens: 30, outputTokens: 10, thinkingTokens: 0, filesTouched: {} },
    ]);

    await service.fixChapter({
      bookSlug: 'book',
      chapterSlug: '02-two',
      auditResult: AUDIT_RESULT,
      conversationId: conversation.id,
      sessionId: 'session-fix',
      onEvent: (e) => events.push(e),
    });

    const call = provider.calls[0];
    expect(call.model).toBe(DEFAULT_SETTINGS.model);
    expect(call.maxTurns).toBe(10);
    expect(call.conversationId).toBe(`${conversation.id}-fix`);
    expect(call.systemPrompt).toContain('[VERITY-CORE.md]');
    expect(call.systemPrompt).toContain('[raw:VERITY-FIX.md]');
    expect(call.systemPrompt).toContain('threadbare silence');
    expect(call.messages[0].content).toContain('Fix the 1 violations');

    const contents = db.getMessages(conversation.id).map((m) => m.content);
    expect(contents[0]).toBe('[Auto-fix: 1 violations in 02-two]');
    expect(contents[1]).toBe('Fixed both instances.');
    expect(usageRecords[0]).toMatchObject({ conversationId: conversation.id, inputTokens: 30 });
  });
});

describe('runMotifAudit', () => {
  it('routes to a single Lumen call for the Claude CLI provider', async () => {
    provider = makeScriptedProvider({ providerId: CLAUDE_CLI_PROVIDER_ID });
    service = makeService();
    provider.scriptNext([
      { type: 'textDelta', text: 'Ledger updated.' },
      { type: 'done', inputTokens: 5, outputTokens: 5, thinkingTokens: 0, filesTouched: {} },
    ]);

    await service.runMotifAudit({ bookSlug: 'book', appSettings: APP_SETTINGS, onEvent: (e) => events.push(e), sessionId: 's1' });

    expect(provider.calls.length).toBe(1);
    const call = provider.calls[0];
    expect(call.maxTurns).toBe(50); // Lumen registry maxTurns
    expect(call.systemPrompt).toContain('Lumen system prompt');
    expect(call.systemPrompt).toContain('[raw:MOTIF-AUDIT.md]');
    expect(call.systemPrompt).toContain('chapters/02-two/draft.md');
    expect(usageRecords.length).toBe(1);
    expect(db.getConversation(`motif-audit-s1`)).not.toBeNull(); // ephemeral conversation for usage FK
  });

  it('sips in batches + synthesis for non-Claude providers and cleans up scratch files', async () => {
    let call = 0;
    provider.setImpl(async (params) => {
      call++;
      if (call === 1) {
        await fs.writeFile('book', 'source/.scratch/motif-audit-batch-1.md', 'phrases');
      }
      params.onEvent({ type: 'textDelta', text: `motif call ${call}` });
      params.onEvent({ type: 'done', inputTokens: 2, outputTokens: 2, thinkingTokens: 0, filesTouched: {} });
    });

    await service.runMotifAudit({ bookSlug: 'book', appSettings: APP_SETTINGS, onEvent: (e) => events.push(e), sessionId: 's2' });

    expect(provider.calls.length).toBe(2); // 1 batch (small manuscript) + synthesis

    const batchCall = provider.calls[0];
    expect(batchCall.maxTurns).toBe(15);
    expect(batchCall.messages[0].content).toContain('source/.scratch/motif-audit-batch-1.md');

    const synthCall = provider.calls[1];
    expect(synthCall.maxTurns).toBe(6); // 1 scratch file + 5
    expect(synthCall.messages[0].content).toContain('- `source/.scratch/motif-audit-batch-1.md`');
    expect(synthCall.messages[0].content).toContain('flaggedPhrases');

    // Intermediate done intercepted; usage recorded for both calls
    expect(events.filter((e) => e.type === 'done').length).toBe(1);
    expect(usageRecords.length).toBe(2);

    // Scratch cleaned up after synthesis
    expect(fs.files.has('book/source/.scratch/motif-audit-batch-1.md')).toBe(false);
  });

  it('is a no-op for books without chapters', async () => {
    fs = makeFakeFs({}, { bookSlug: 'empty' });
    service = makeService();

    await service.runMotifAudit({ bookSlug: 'empty', appSettings: APP_SETTINGS, onEvent: (e) => events.push(e), sessionId: 's3' });

    expect(provider.calls.length).toBe(0);
  });
});
