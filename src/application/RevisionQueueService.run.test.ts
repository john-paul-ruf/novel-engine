import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RevisionPlan, RevisionQueueEvent, StreamEvent } from '@domain/types';
import { RevisionQueueService } from './RevisionQueueService';
import { makeDb } from '../test/db';
import {
  makeFakeAgents,
  makeFakeFs,
  makeFakeRegistry,
  makeFakeSettings,
  makeFakeVersion,
  makeModelInfo,
  makeScriptedProvider,
  type FakeFileSystem,
  type ScriptedProvider,
} from '../test/fakes';
import { DEFAULT_SETTINGS } from '@domain/constants';

const WRANGLER_JSON = {
  sessions: [
    { index: 1, title: 'Session One', chapters: ['02-two'], taskNumbers: [1, 2], model: 'opus', prompt: 'Revise chapter two.', notes: '' },
    { index: 2, title: 'Session Two', chapters: ['03-three'], taskNumbers: [3], model: 'sonnet', prompt: 'Revise chapter three.', notes: '' },
  ],
  totalTasks: 3,
  completedTaskNumbers: [],
  phases: [{ number: 1, name: 'Structural', taskCount: 3, completedCount: 0, taskNumbers: [1, 2, 3] }],
};

const TASKS_MD = ['# Tasks', '- [ ] **1. Fix opening', '- [ ] **2. Tighten middle', '- [ ] **3. Polish ending'].join('\n');

// isApprovalGate scans the LAST paragraph for signal words — this reply has none.
const FINAL_REPLY = 'Revised the chapter as requested.\n\nAll tasks in this session are finished.';
const GATE_REPLY = 'Task 1 revised.\n\nShall I proceed with task 2?';

function reply(text: string): StreamEvent[] {
  return [
    { type: 'textDelta', text },
    { type: 'done', inputTokens: 5, outputTokens: 5, thinkingTokens: 0, filesTouched: {} },
  ];
}

let db: ReturnType<typeof makeDb>;
let fs: FakeFileSystem;
let provider: ScriptedProvider;
let service: RevisionQueueService;
let events: RevisionQueueEvent[];

async function loadPlan(): Promise<RevisionPlan> {
  provider.scriptNext([
    { type: 'textDelta', text: JSON.stringify(WRANGLER_JSON) },
    { type: 'done', inputTokens: 1, outputTokens: 1, thinkingTokens: 0, filesTouched: {} },
  ]);
  const plan = await service.loadPlan('book');
  provider.calls.length = 0; // ignore the wrangler call in per-test assertions
  return plan;
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  db = makeDb();
  fs = makeFakeFs(
    { 'source/revision-prompts.md': '## Sessions', 'source/project-tasks.md': TASKS_MD },
    { bookSlug: 'book' }
  );
  provider = makeScriptedProvider();
  service = new RevisionQueueService(
    fs,
    makeFakeRegistry(provider, { models: [makeModelInfo(DEFAULT_SETTINGS.model)] }),
    makeFakeAgents(),
    db,
    makeFakeSettings(),
    makeFakeVersion()
  );
  events = [];
  service.onEvent((e) => events.push(e));
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe('runSession', () => {
  it('runs a gate-free session to approval: conversation, checkboxes, progress, persisted state', async () => {
    const plan = await loadPlan();
    provider.scriptNext(reply(FINAL_REPLY));

    await service.runSession(plan.id, plan.sessions[0].id);

    const session = plan.sessions[0];
    expect(session.status).toBe('approved');
    expect(session.response).toBe(FINAL_REPLY);

    // Verity call carried the session prompt and registry turn budget
    expect(provider.calls[0].maxTurns).toBe(30);
    expect(provider.calls[0].messages[0].content).toBe('Revise chapter two.');
    expect(provider.calls[0].systemPrompt).toContain('Verity system prompt');

    // Conversation persisted with both sides
    const messages = db.getMessages(session.conversationId!);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);

    // Checkboxes ticked for tasks 1+2 only
    const tasks = fs.files.get('book/source/project-tasks.md')!;
    expect(tasks).toContain('- [x] **1.');
    expect(tasks).toContain('- [x] **2.');
    expect(tasks).toContain('- [ ] **3.');

    // Progress + phase accounting
    expect(plan.completedTaskNumbers.sort()).toEqual([1, 2]);
    expect(plan.phases[0].completedCount).toBe(2);
    const statuses = events.filter((e) => e.type === 'session:status').map((e) => (e.type === 'session:status' ? e.status : ''));
    expect(statuses).toEqual(['running', 'approved']);
    expect(events.some((e) => e.type === 'session:done')).toBe(true);
    expect(events.some((e) => e.type === 'plan:progress')).toBe(true);

    // State survives on disk
    const state = JSON.parse(fs.files.get('book/source/revision-queue-state.json')!);
    expect(state.sessions[1].status).toBe('approved');
  });

  it('only pending or rejected sessions are runnable; unknown ids throw', async () => {
    const plan = await loadPlan();
    provider.scriptNext(reply(FINAL_REPLY));
    await service.runSession(plan.id, plan.sessions[0].id);

    await expect(service.runSession(plan.id, plan.sessions[0].id)).rejects.toThrow(/not runnable/);
    await expect(service.runSession('nope', 'x')).rejects.toThrow(/Plan not found/);
    await expect(service.runSession(plan.id, 'nope')).rejects.toThrow(/Session not found/);
  });

  it('provider failure marks the session rejected and emits an error event', async () => {
    const plan = await loadPlan();
    provider.setImpl(async () => {
      throw new Error('CLI crashed');
    });

    await service.runSession(plan.id, plan.sessions[0].id);

    expect(plan.sessions[0].status).toBe('rejected');
    expect(events.some((e) => e.type === 'error' && e.message === 'CLI crashed')).toBe(true);
  });
});

describe('approval gates', () => {
  it('manual mode pauses at the gate; approve resumes the loop with a follow-up message', async () => {
    const plan = await loadPlan();
    const session = plan.sessions[0];
    provider.scriptNext(reply(GATE_REPLY));
    provider.scriptNext(reply(FINAL_REPLY));

    const run = service.runSession(plan.id, session.id);
    await vi.waitFor(() => {
      expect(session.status).toBe('awaiting-approval');
    });

    const gate = events.find((e) => e.type === 'session:gate');
    expect(gate && gate.type === 'session:gate' ? gate.gateText : '').toBe('Shall I proceed with task 2?');

    service.respondToGate(plan.id, session.id, 'approve');
    await run;

    expect(session.status).toBe('approved');
    const contents = db.getMessages(session.conversationId!).map((m) => m.content);
    expect(contents).toEqual([
      'Revise chapter two.',
      GATE_REPLY,
      'Approved. Continue with the next task.',
      FINAL_REPLY,
    ]);
  });

  it('the retry decision resets the session for a fresh run', async () => {
    const plan = await loadPlan();
    const session = plan.sessions[0];
    provider.scriptNext(reply(GATE_REPLY));

    const run = service.runSession(plan.id, session.id);
    await vi.waitFor(() => {
      expect(session.status).toBe('awaiting-approval');
    });

    service.respondToGate(plan.id, session.id, 'retry');
    await run;

    expect(session.status).toBe('rejected'); // rejected sessions are runnable again
    expect(session.response).toBe('');
    expect(session.conversationId).toBeNull();
  });

  it('auto-approve mode sails through gates without waiting', async () => {
    const plan = await loadPlan();
    service.setMode(plan.id, 'auto-approve');
    provider.scriptNext(reply(GATE_REPLY));
    provider.scriptNext(reply(FINAL_REPLY));

    await service.runSession(plan.id, plan.sessions[0].id);

    expect(plan.sessions[0].status).toBe('approved');
    expect(provider.calls.length).toBe(2);
    expect(events.some((e) => e.type === 'session:gate')).toBe(false);
  });
});

describe('queue orchestration', () => {
  it('runAll executes pending sessions in index order and reports queue:done', async () => {
    const plan = await loadPlan();
    provider.scriptNext(reply(FINAL_REPLY));
    provider.scriptNext(reply(FINAL_REPLY));

    await service.runAll(plan.id);

    expect(plan.sessions.map((s) => s.status)).toEqual(['approved', 'approved']);
    expect(provider.calls[0].messages[0].content).toBe('Revise chapter two.');
    expect(provider.calls[1].messages[0].content).toBe('Revise chapter three.');
    expect(events.at(-1)).toEqual({ type: 'queue:done', planId: plan.id });
  });

  it('pause stops the queue between sessions; concurrent runAll is rejected', async () => {
    const plan = await loadPlan();
    let concurrentError: Error | null = null;
    provider.setImpl(async (params) => {
      // Pause the queue and probe the concurrency guard mid-first-session
      service.pause(plan.id);
      await service.runAll(plan.id).catch((err: Error) => {
        concurrentError = err;
      });
      params.onEvent({ type: 'textDelta', text: FINAL_REPLY });
      params.onEvent({ type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {} });
    });

    await service.runAll(plan.id);

    expect(String(concurrentError)).toContain('already running');
    expect(plan.sessions[0].status).toBe('approved'); // first finished
    expect(plan.sessions[1].status).toBe('pending'); // second never started
    expect(service.getQueueStatus('book')).toEqual({ planId: plan.id, isRunning: false, activeSessionId: null });
  });

  it('reject and skip set terminal statuses; startVerification creates one reusable conversation', async () => {
    const plan = await loadPlan();

    await service.rejectSession(plan.id, plan.sessions[0].id);
    expect(plan.sessions[0].status).toBe('rejected');

    await service.skipSession(plan.id, plan.sessions[1].id);
    expect(plan.sessions[1].status).toBe('skipped');

    const conversationId = await service.startVerification(plan.id);
    expect(await service.startVerification(plan.id)).toBe(conversationId);
    expect(db.getConversation(conversationId)?.title).toContain('All revision sessions are complete');
  });
});
