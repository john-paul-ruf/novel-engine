import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamEvent } from '@domain/types';
import { MultiCallOrchestrator } from './MultiCallOrchestrator';
import { StreamManager } from './StreamManager';
import { makeConversation, makeDb } from '../test/db';
import {
  makeFakeAgents,
  makeFakeFs,
  makeFakeRegistry,
  makeFakeSeries,
  makeFakeSettings,
  makeFakeVersion,
  makeModelInfo,
  makeScriptedProvider,
  makeUsageRecorder,
  type FakeFileSystem,
  type ScriptedProvider,
} from '../test/fakes';
import { DEFAULT_SETTINGS } from '@domain/constants';

let db: ReturnType<typeof makeDb>;
let fs: FakeFileSystem;
let provider: ScriptedProvider;
let orchestrator: MultiCallOrchestrator;
let events: StreamEvent[];
let conversationId: string;

/**
 * Provider impl that "writes" the given file for call N and finishes cleanly.
 * Files listed as null simulate a model that never called Write.
 */
function wireProviderWrites(filesPerCall: (string | null)[]): void {
  let call = 0;
  provider.setImpl(async (params) => {
    const file = filesPerCall[call];
    call++;
    if (file) {
      await fs.writeFile('book', file, `content of ${file}`);
      params.onEvent({ type: 'filesChanged', paths: [file] });
    }
    params.onEvent({ type: 'textDelta', text: `call ${call} output` });
    params.onEvent({ type: 'done', inputTokens: 10, outputTokens: 5, thinkingTokens: 0, filesTouched: file ? { [file]: 1 } : {} });
  });
}

function makeOrchestrator(fsFake: FakeFileSystem): MultiCallOrchestrator {
  return new MultiCallOrchestrator(
    makeFakeSettings(),
    makeFakeAgents(),
    db,
    makeFakeRegistry(provider, { models: [makeModelInfo(DEFAULT_SETTINGS.model)] }),
    fsFake,
    new StreamManager(db, makeUsageRecorder().usage),
    makeFakeSeries(),
    makeFakeVersion()
  );
}

function run(agentName: 'Forge' | 'Ghostlight' | 'Spark') {
  return orchestrator.runMultiCall({
    agentName,
    conversationId,
    bookSlug: 'book',
    onEvent: (e) => events.push(e),
  });
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  db = makeDb();
  fs = makeFakeFs({ 'source/dev-report.md': 'dev findings here' }, { bookSlug: 'book' });
  provider = makeScriptedProvider();
  orchestrator = makeOrchestrator(fs);
  events = [];
  conversationId = makeConversation(db, { bookSlug: 'book', agentName: 'Forge' }).id;
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe('static step schemas (Forge)', () => {
  it('runs steps sequentially, verifies outputs, forwards only the final done, and merges changed files', async () => {
    wireProviderWrites(['source/project-tasks.md', 'source/revision-prompts.md']);

    const result = await run('Forge');

    expect(result.changedFiles).toEqual(['source/project-tasks.md', 'source/revision-prompts.md']);
    expect(provider.calls.length).toBe(2);
    expect(provider.calls.map((c) => c.maxTurns)).toEqual([15, 20]);
    expect(provider.calls[0].messages[0].content).toContain('Revision Task List');

    // Intermediate done intercepted — exactly one done reaches the caller
    expect(events.filter((e) => e.type === 'done').length).toBe(1);
    const progress = events.filter((e) => e.type === 'multiCallProgress');
    expect(progress.map((e) => (e.type === 'multiCallProgress' ? `${e.step}/${e.totalSteps}` : ''))).toEqual(['1/2', '2/2']);

    // Each step saved its prompt + assistant response in the conversation
    expect(db.getMessages(conversationId).map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(db.getActiveStreamSessions()).toEqual([]); // all sub-sessions closed
  });

  it('retries a step whose expected file never appeared, bumping maxTurns, and aborts after 3 attempts', async () => {
    wireProviderWrites([null, null, null]); // step 1 never writes

    const result = await run('Forge');

    expect(provider.calls.length).toBe(3); // 3 attempts of step 1, step 2 never runs
    expect(provider.calls.map((c) => c.maxTurns)).toEqual([15, 20, 25]);
    expect(result.changedFiles).toEqual([]);

    const error = events.find((e) => e.type === 'error');
    expect(error?.message).toContain('failed after 3 attempts');
    expect(error?.message).toContain('never wrote its expected file source/project-tasks.md');
  });

  it('a failed attempt followed by success continues to the next step', async () => {
    wireProviderWrites([null, 'source/project-tasks.md', 'source/revision-prompts.md']);

    const result = await run('Forge');

    expect(provider.calls.map((c) => c.maxTurns)).toEqual([15, 20, 20]);
    expect(result.changedFiles).toEqual(['source/project-tasks.md', 'source/revision-prompts.md']);
    expect(events.some((e) => e.type === 'status' && e.message.includes('Retrying'))).toBe(true);
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });

  it('provider error EVENTS (never-throw providers) count as step failures too', async () => {
    let call = 0;
    provider.setImpl(async (params) => {
      call++;
      if (call === 1) {
        params.onEvent({ type: 'error', message: 'model stalled' });
        return;
      }
      const file = call === 2 ? 'source/project-tasks.md' : 'source/revision-prompts.md';
      await fs.writeFile('book', file, 'x');
      params.onEvent({ type: 'filesChanged', paths: [file] });
      params.onEvent({ type: 'done', inputTokens: 1, outputTokens: 1, thinkingTokens: 0, filesTouched: { [file]: 1 } });
    });

    await run('Forge');

    expect(provider.calls.length).toBe(3);
    expect(events.some((e) => e.type === 'status' && e.message.includes('model stalled'))).toBe(true);
    expect(events.filter((e) => e.type === 'error').length).toBe(0); // recovered — no terminal error
  });

  it('resumes by skipping non-synthesis steps whose output already exists', async () => {
    fs.files.set('book/source/project-tasks.md', 'already produced');
    wireProviderWrites(['source/revision-prompts.md']);

    await run('Forge');

    expect(provider.calls.length).toBe(1); // only the synthesis step ran
    expect(provider.calls[0].messages[0].content).toContain('Session Map');
    expect(events.some((e) => e.type === 'status' && e.message.startsWith('Resuming: 1 of 2'))).toBe(true);
    expect(
      events.some((e) => e.type === 'multiCallProgress' && e.label.includes('(cached)'))
    ).toBe(true);
  });

  it('throws for agents without step schemas', async () => {
    await expect(run('Spark')).rejects.toThrow(/No multi-call steps defined/);
  });
});

describe('dynamic step expansion (Ghostlight)', () => {
  beforeEach(() => {
    // 5 chapters × 10k words → 50k words → 3 read batches at 20k/batch
    const chapterWords = 'w '.repeat(10_000).trim();
    fs = makeFakeFs(
      Object.fromEntries(
        [1, 2, 3, 4, 5].map((n) => [`chapters/0${n}-ch/draft.md`, chapterWords])
      ),
      { bookSlug: 'book' }
    );
    orchestrator = makeOrchestrator(fs);
  });

  it('expands read batches by word count, threads scratch refs, and cleans up after synthesis', async () => {
    wireProviderWrites([
      'source/.scratch/ghostlight-read-1.md',
      'source/.scratch/ghostlight-read-2.md',
      'source/.scratch/ghostlight-read-3.md',
      'source/reader-report.md',
    ]);

    const result = await run('Ghostlight');

    expect(provider.calls.length).toBe(4);

    // Batch prompts: chapter lists injected, prior-batch refs renumbered
    expect(provider.calls[0].messages[0].content).toContain('chapters/01-ch/draft.md');
    expect(provider.calls[1].messages[0].content).toContain('source/.scratch/ghostlight-read-1.md'); // reads prior
    expect(provider.calls[1].messages[0].content).toContain('source/.scratch/ghostlight-read-2.md'); // writes own
    expect(provider.calls[2].messages[0].content).toContain('source/.scratch/ghostlight-read-2.md');

    // Synthesis placeholders resolved
    const synthesis = provider.calls[3].messages[0].content;
    expect(synthesis).toContain('EXACTLY 3 files to read');
    expect(synthesis).toContain('- source/.scratch/ghostlight-read-1.md');
    expect(synthesis).toContain('- source/.scratch/ghostlight-read-3.md');

    // Read steps use the lightweight system prompt
    expect(provider.calls[0].systemPrompt).toContain('You are a careful manuscript reader');

    // Progress covers all 4 expanded steps
    const labels = events
      .filter((e) => e.type === 'multiCallProgress')
      .map((e) => (e.type === 'multiCallProgress' ? e.label : ''));
    expect(labels).toEqual(['Read Batch 1/3', 'Read Batch 2/3', 'Read Batch 3/3', 'Synthesize Reader Report']);

    // Scratch files cleaned up after successful synthesis; output remains
    expect([...fs.files.keys()].filter((k) => k.includes('.scratch'))).toEqual([]);
    expect(fs.files.has('book/source/reader-report.md')).toBe(true);
    expect(result.changedFiles).toContain('source/reader-report.md');
  });

  it('a failed read batch preserves scratch files from completed steps', async () => {
    wireProviderWrites([
      'source/.scratch/ghostlight-read-1.md',
      null, null, null, // batch 2 never writes → exhausts retries
    ]);

    await run('Ghostlight');

    expect(fs.files.has('book/source/.scratch/ghostlight-read-1.md')).toBe(true); // survives for retry
    expect(events.find((e) => e.type === 'error')?.message).toContain('Prior results saved in source/.scratch/');
  });
});
