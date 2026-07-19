import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Conversation, StreamEvent } from '@domain/types';
import { DEFAULT_SETTINGS } from '@domain/constants';
import { PitchRoomService } from './PitchRoomService';
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
import { cleanupTempDirs, makeTempDir } from '../test/tempDir';

const PITCH_TEMPLATE = 'Pitch room rules. Books live at {{BOOKS_PATH}}. Scaffold into {{BOOKS_PATH}}.';

let db: ReturnType<typeof makeDb>;
let fs: FakeFileSystem;
let provider: ScriptedProvider;
let usageRecords: ReturnType<typeof makeUsageRecorder>['records'];
let service: PitchRoomService;
let conversation: Conversation;
let tempDir: string;
let events: StreamEvent[];

beforeEach(async () => {
  db = makeDb();
  fs = makeFakeFs({}, { bookSlug: 'pitch-room' });
  provider = makeScriptedProvider();
  tempDir = await makeTempDir();
  fs.pitchDraftBase = path.join(tempDir, 'drafts');
  const recorder = makeUsageRecorder();
  usageRecords = recorder.records;
  service = new PitchRoomService(
    makeFakeAgents({ 'PITCH-ROOM.md': PITCH_TEMPLATE }),
    makeFakeRegistry(provider, { models: [makeModelInfo(DEFAULT_SETTINGS.model)] }),
    db,
    fs,
    new StreamManager(db, recorder.usage)
  );
  conversation = makeConversation(db, { agentName: 'Spark', purpose: 'pitch-room', bookSlug: 'pitch-room' });
  events = [];
});

afterEach(async () => {
  db.close();
  await cleanupTempDirs();
});

async function send(overrides: { thinkingBudgetOverride?: number; enableThinking?: boolean } = {}): Promise<void> {
  await service.handleMessage({
    conversationId: conversation.id,
    agentName: 'Spark',
    bookSlug: 'pitch-room',
    appSettings: {
      model: DEFAULT_SETTINGS.model,
      maxTokens: 8000,
      enableThinking: overrides.enableThinking ?? true,
      thinkingBudget: 5000,
      overrideThinkingBudget: false,
    },
    agent: { systemPrompt: 'Spark base prompt', thinkingBudget: 4000 },
    onEvent: (e) => events.push(e),
    sessionId: 'session-pitch',
    thinkingBudgetOverride: overrides.thinkingBudgetOverride,
  });
}

describe('system prompt assembly', () => {
  it('appends the pitch-room template with every {{BOOKS_PATH}} replaced', async () => {
    await send();

    const { systemPrompt } = provider.calls[0];
    expect(systemPrompt.startsWith('Spark base prompt\n\n---\n\n')).toBe(true);
    expect(systemPrompt).toContain('Books live at /fake/books. Scaffold into /fake/books.');
    expect(systemPrompt).not.toContain('{{BOOKS_PATH}}');
    expect(systemPrompt).not.toContain('## Author Profile');
  });

  it('appends the author profile when one exists', async () => {
    const profilePath = path.join(tempDir, 'author-profile.md');
    await writeFile(profilePath, 'Writes cozy sci-fi.', 'utf-8');
    fs.authorProfilePath = profilePath;

    await send();

    expect(provider.calls[0].systemPrompt).toContain('## Author Profile\n\nWrites cozy sci-fi.');
  });

  it('skips a whitespace-only author profile', async () => {
    const profilePath = path.join(tempDir, 'author-profile.md');
    await writeFile(profilePath, '   \n\n', 'utf-8');
    fs.authorProfilePath = profilePath;

    await send();

    expect(provider.calls[0].systemPrompt).not.toContain('## Author Profile');
  });
});

describe('provider call', () => {
  it('sends the stored conversation history with Spark registry maxTurns', async () => {
    makeMessage(db, conversation.id, { role: 'user', content: 'Pitch me a heist novel' });
    makeMessage(db, conversation.id, { role: 'assistant', content: 'How about clockwork thieves?' });

    await send();

    const call = provider.calls[0];
    expect(call.messages).toEqual([
      { role: 'user', content: 'Pitch me a heist novel' },
      { role: 'assistant', content: 'How about clockwork thieves?' },
    ]);
    expect(call.maxTurns).toBe(5); // AGENT_REGISTRY.Spark.maxTurns
    expect(call.model).toBe(DEFAULT_SETTINGS.model);
    expect(call.maxTokens).toBe(8000);
    expect(call.sessionId).toBe('session-pitch');
    expect(call.conversationId).toBe(conversation.id);
  });

  it('creates the per-conversation draft directory and uses it as workingDir', async () => {
    await send();

    const expected = path.join(tempDir, 'drafts', conversation.id);
    expect(provider.calls[0].workingDir).toBe(expected);
    expect(existsSync(expected)).toBe(true);
  });

  it('resolves the thinking budget: agent default, per-message override, disabled', async () => {
    await send();
    await send({ thinkingBudgetOverride: 9000 });
    await send({ enableThinking: false });

    expect(provider.calls.map((c) => c.thinkingBudget)).toEqual([4000, 9000, undefined]);
  });
});

describe('stream lifecycle', () => {
  it('persists the assistant reply, records usage, and forwards events in order', async () => {
    provider.scriptNext([
      { type: 'textDelta', text: 'A heist ' },
      { type: 'textDelta', text: 'in the clouds.' },
      { type: 'done', inputTokens: 12, outputTokens: 7, thinkingTokens: 3, filesTouched: {} },
    ]);

    await send();

    const messages = db.getMessages(conversation.id);
    expect(messages.map((m) => m.role)).toEqual(['assistant']);
    expect(messages[0].content).toBe('A heist in the clouds.');

    expect(usageRecords).toEqual([
      {
        conversationId: conversation.id,
        inputTokens: 12,
        outputTokens: 7,
        thinkingTokens: 3,
        model: DEFAULT_SETTINGS.model,
      },
    ]);

    // preparing status → callStart (stream registered) → waiting status → provider events
    expect(events.map((e) => e.type)).toEqual(['status', 'callStart', 'status', 'textDelta', 'textDelta', 'done']);
  });
});
