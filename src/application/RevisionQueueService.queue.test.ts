import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RevisionQueueEvent, StreamEvent } from '@domain/types';
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

function wranglerReply(json: unknown): StreamEvent[] {
  return [
    { type: 'textDelta', text: 'Here is the parsed plan:\n' + JSON.stringify(json) },
    { type: 'done', inputTokens: 1, outputTokens: 1, thinkingTokens: 0, filesTouched: {} },
  ];
}

let db: ReturnType<typeof makeDb>;
let fs: FakeFileSystem;
let provider: ScriptedProvider;
let service: RevisionQueueService;
let events: RevisionQueueEvent[];

function makeService(fsFake: FakeFileSystem, providerFake: ScriptedProvider, database: ReturnType<typeof makeDb>) {
  const svc = new RevisionQueueService(
    fsFake,
    makeFakeRegistry(providerFake, { models: [makeModelInfo(DEFAULT_SETTINGS.model)] }),
    makeFakeAgents(),
    database,
    makeFakeSettings(),
    makeFakeVersion()
  );
  return svc;
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  db = makeDb();
  fs = makeFakeFs({ 'source/revision-prompts.md': '## Session 1\nRevise.', 'source/project-tasks.md': TASKS_MD }, { bookSlug: 'book' });
  provider = makeScriptedProvider();
  service = makeService(fs, provider, db);
  events = [];
  service.onEvent((e) => events.push(e));
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe('loadPlan', () => {
  it('parses the plan via the Wrangler, builds pending sessions, and caches to disk', async () => {
    provider.scriptNext(wranglerReply(WRANGLER_JSON));

    const plan = await service.loadPlan('book');

    expect(plan.sessions.map((s) => ({ index: s.index, status: s.status }))).toEqual([
      { index: 1, status: 'pending' },
      { index: 2, status: 'pending' },
    ]);
    expect(plan.totalTasks).toBe(3);
    expect(plan.mode).toBe('manual');
    expect(provider.calls.length).toBe(1);
    expect(provider.calls[0].systemPrompt).toBe('[raw:WRANGLER-PARSE.md]');
    expect(provider.calls[0].maxTurns).toBe(15);

    const cache = JSON.parse(fs.files.get('book/source/revision-plan-cache.json') ?? '{}');
    expect(cache.parsed.sessions.length).toBe(2);
  });

  it('marks sessions approved when all their tasks are already completed', async () => {
    provider.scriptNext(
      wranglerReply({ ...WRANGLER_JSON, completedTaskNumbers: [3] })
    );

    const plan = await service.loadPlan('book');

    expect(plan.sessions.find((s) => s.index === 2)?.status).toBe('approved');
    expect(plan.sessions.find((s) => s.index === 1)?.status).toBe('pending');
  });

  it('reuses the disk cache — checkbox ticks do not invalidate the hash', async () => {
    provider.scriptNext(wranglerReply(WRANGLER_JSON));
    await service.loadPlan('book');

    // Tick a checkbox (what approveSession does) and reload via a FRESH service
    fs.files.set('book/source/project-tasks.md', TASKS_MD.replace('- [ ] **1.', '- [x] **1.'));
    const fresh = makeService(fs, provider, db);
    const plan = await fresh.loadPlan('book');

    expect(provider.calls.length).toBe(1); // no second Wrangler call
    expect(plan.sessions.length).toBe(2);
  });

  it('restores terminal session statuses from the state file but never ephemeral ones', async () => {
    provider.scriptNext(wranglerReply(WRANGLER_JSON));
    const first = await service.loadPlan('book');
    await service.skipSession(first.id, first.sessions[0].id); // persists state

    // Tamper: mark session 2 as 'running' in the state file — must not be restored
    const stateRaw = fs.files.get('book/source/revision-queue-state.json')!;
    const state = JSON.parse(stateRaw);
    state.sessions[2] = { status: 'running', conversationId: 'conv-ephemeral' };
    fs.files.set('book/source/revision-queue-state.json', JSON.stringify(state));

    const fresh = makeService(fs, provider, db);
    const plan = await fresh.loadPlan('book');

    expect(plan.sessions.find((s) => s.index === 1)?.status).toBe('skipped');
    expect(plan.sessions.find((s) => s.index === 2)?.status).toBe('pending');
    expect(plan.sessions.find((s) => s.index === 2)?.conversationId).toBe('conv-ephemeral');
  });

  it('retries the Wrangler with bumped turn budgets and surfaces final failure', async () => {
    // Two empty responses, then success
    provider.scriptNext([{ type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {} }]);
    provider.scriptNext([{ type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {} }]);
    provider.scriptNext(wranglerReply(WRANGLER_JSON));

    const plan = await service.loadPlan('book');

    expect(plan.sessions.length).toBe(2);
    expect(provider.calls.map((c) => c.maxTurns)).toEqual([15, 20, 25]);

    // All attempts empty → hard failure
    const failingFs = makeFakeFs({ 'source/revision-prompts.md': 'x', 'source/project-tasks.md': 'y' }, { bookSlug: 'book2' });
    const failingProvider = makeScriptedProvider();
    for (let i = 0; i < 3; i++) {
      failingProvider.scriptNext([{ type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {} }]);
    }
    const failing = makeService(failingFs, failingProvider, db);
    await expect(failing.loadPlan('book2')).rejects.toThrow(/Wrangler parse failed after 3 attempts/);
  });

  it('throws targeted errors when no plan files exist', async () => {
    const emptyFs = makeFakeFs({}, { bookSlug: 'bare' });
    await expect(makeService(emptyFs, provider, db).loadPlan('bare')).rejects.toThrow(/No revision plan found/);

    const auditedFs = makeFakeFs({ 'source/audit-report.md': 'audit' }, { bookSlug: 'audited' });
    await expect(makeService(auditedFs, provider, db).loadPlan('audited')).rejects.toThrow(/No mechanical fixes plan found/);
  });

  it('blocks the second cycle until first-cycle files are archived, then clears stale state on transition', async () => {
    // Audit exists but no archive → hard stop
    fs.files.set('book/source/audit-report.md', 'sable output');
    await expect(service.loadPlan('book')).rejects.toThrow(/have not been archived/);

    // Archive appears → second cycle loads; stale cycle-1 state is cleared first
    fs.files.set('book/source/project-tasks-v1.md', 'archived');
    fs.files.set(
      'book/source/revision-queue-state.json',
      JSON.stringify({ planHash: 'stale', mode: 'manual', revisionCycle: 1, sessions: { 1: { status: 'approved', conversationId: null } } })
    );
    provider.scriptNext(wranglerReply(WRANGLER_JSON));

    const plan = await service.loadPlan('book');

    expect(plan.sessions.every((s) => s.status === 'pending')).toBe(true); // stale approvals dropped
  });

  it('clearCache removes disk artifacts and in-memory plan state', async () => {
    provider.scriptNext(wranglerReply(WRANGLER_JSON));
    const plan = await service.loadPlan('book');

    await service.clearCache('book');

    expect(fs.files.has('book/source/revision-plan-cache.json')).toBe(false);
    expect(fs.files.has('book/source/revision-queue-state.json')).toBe(false);
    expect(service.getPlan(plan.id)).toBeNull();
    expect(service.getQueueStatus('book')).toEqual({ planId: null, isRunning: false, activeSessionId: null });
  });
});
