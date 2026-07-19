import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamEvent } from '@domain/types';
import { DEFAULT_SETTINGS, HELPER_SLUG } from '@domain/constants';
import { HelperService } from './HelperService';
import { StreamManager } from './StreamManager';
import { makeDb } from '../test/db';
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
import { cleanupTempDirs, makeTempDir } from '../test/tempDir';

let db: ReturnType<typeof makeDb>;
let fs: FakeFileSystem;
let provider: ScriptedProvider;
let userDataPath: string;
let service: HelperService;
let events: StreamEvent[];

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  db = makeDb();
  fs = makeFakeFs({}, { bookSlug: 'book' });
  provider = makeScriptedProvider();
  userDataPath = await makeTempDir();
  service = new HelperService(
    makeFakeSettings(),
    makeFakeAgents(),
    db,
    fs,
    makeFakeRegistry(provider, { models: [makeModelInfo(DEFAULT_SETTINGS.model)] }),
    new StreamManager(db, makeUsageRecorder().usage),
    userDataPath
  );
  events = [];
});

afterEach(async () => {
  db.close();
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

describe('conversation lifecycle', () => {
  it('creates one persistent helper conversation and reuses it', async () => {
    const first = await service.getOrCreateConversation();

    expect(first).toMatchObject({ bookSlug: HELPER_SLUG, agentName: 'Helper', purpose: 'helper' });
    expect((await service.getOrCreateConversation()).id).toBe(first.id);
  });

  it('resetConversation deletes the helper thread so the next call starts fresh', async () => {
    const first = await service.getOrCreateConversation();
    await service.resetConversation();

    expect(db.getConversation(first.id)).toBeNull();
    expect((await service.getOrCreateConversation()).id).not.toBe(first.id);
  });
});

describe('sendMessage', () => {
  async function send(message = 'How do I archive a book?'): Promise<string> {
    const conversation = await service.getOrCreateConversation();
    provider.scriptNext([
      { type: 'textDelta', text: 'Open the Library view.' },
      { type: 'done', inputTokens: 4, outputTokens: 2, thinkingTokens: 0, filesTouched: {} },
    ]);
    await service.sendMessage({ message, conversationId: conversation.id, onEvent: (e) => events.push(e) });
    return conversation.id;
  }

  it('bundles the user guide into the system prompt and persists the exchange', async () => {
    await writeFile(path.join(userDataPath, 'USER_GUIDE.md'), '# Guide\nArchive from Library.', 'utf-8');

    const conversationId = await send();

    const call = provider.calls[0];
    expect(call.systemPrompt).toContain('Helper system prompt');
    expect(call.systemPrompt).toContain('Archive from Library.');
    expect(call.maxTurns).toBe(5); // Helper registry maxTurns
    expect(call.workingDir).toBe(userDataPath); // no active book
    expect(call.messages.at(-1)).toEqual({ role: 'user', content: 'How do I archive a book?' });

    const messages = db.getMessages(conversationId);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1].content).toBe('Open the Library view.');
    expect(events.some((e) => e.type === 'callStart')).toBe(true);
  });

  it('degrades gracefully without a user guide', async () => {
    await send();
    expect(provider.calls[0].systemPrompt).toContain('(User guide not available.');
  });

  it("targets the active book's directory when one is selected", async () => {
    fs.activeBookSlug = 'my-book';
    await send();
    expect(provider.calls[0].workingDir).toBe(path.join('/fake/books', 'my-book'));
  });

  it('abortStream delegates to the provider registry', () => {
    service.abortStream('conv-9');
    expect(provider.abortStream).toHaveBeenCalledWith('conv-9');
  });
});
