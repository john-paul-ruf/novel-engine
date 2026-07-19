import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RevisionPlan, RevisionSession } from '@domain/types';
import { useRevisionQueueStore } from './revisionQueueStore';
import { installNovelEngineMock, makeMessage, type NovelEngineMock } from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useRevisionQueueStore);

// NOTE: the store keeps a module-level per-book cache that survives store
// resets — switchToBook tests each use unique slugs to stay isolated.

function makeSession(overrides: Partial<RevisionSession> = {}): RevisionSession {
  return {
    id: 'sess-1',
    index: 1,
    title: 'Ch 1-3 Audit',
    chapters: ['01-one'],
    taskNumbers: [1, 2],
    model: 'opus',
    prompt: 'Do the thing.',
    notes: '',
    status: 'pending',
    conversationId: null,
    response: '',
    ...overrides,
  };
}

function makePlan(overrides: Partial<RevisionPlan> = {}): RevisionPlan {
  const sessions = overrides.sessions ?? [
    makeSession(),
    makeSession({ id: 'sess-2', index: 2, status: 'approved' }),
  ];
  return {
    id: 'plan-1',
    bookSlug: 'book-a',
    totalTasks: 4,
    completedTaskNumbers: [],
    phases: [],
    mode: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    verificationConversationId: null,
    ...overrides,
    sessions,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let mock: NovelEngineMock;

beforeEach(() => {
  mock = installNovelEngineMock();
});

describe('revisionQueueStore', () => {
  describe('loadPlan', () => {
    it('loads the plan and selects every session by default', async () => {
      mock.revision.loadPlan.mockResolvedValue(makePlan());

      await useRevisionQueueStore.getState().loadPlan('book-a');

      const state = useRevisionQueueStore.getState();
      expect(state.plan?.id).toBe('plan-1');
      expect(state.planId).toBe('plan-1');
      expect(state.isLoading).toBe(false);
      expect([...state.selectedSessionIds].sort()).toEqual(['sess-1', 'sess-2']);
    });

    it('is a no-op when the same book plan with sessions is already loaded', async () => {
      mock.revision.loadPlan.mockResolvedValue(makePlan());
      await useRevisionQueueStore.getState().loadPlan('book-a');
      mock.revision.loadPlan.mockClear();

      await useRevisionQueueStore.getState().loadPlan('book-a');

      expect(mock.revision.loadPlan).not.toHaveBeenCalled();
    });

    it('surfaces bridge failures as the error message', async () => {
      mock.revision.loadPlan.mockRejectedValue(new Error('no revision plan found'));

      await useRevisionQueueStore.getState().loadPlan('book-a');

      expect(useRevisionQueueStore.getState().error).toBe('no revision plan found');
      expect(useRevisionQueueStore.getState().isLoading).toBe(false);
    });

    it('reloadPlan forces a reload even with a plan loaded', async () => {
      mock.revision.loadPlan.mockResolvedValue(makePlan());
      await useRevisionQueueStore.getState().loadPlan('book-a');

      await useRevisionQueueStore.getState().reloadPlan('book-a');

      expect(mock.revision.loadPlan).toHaveBeenCalledTimes(2);
    });

    it('clearCache clears the backend cache before reloading', async () => {
      mock.revision.loadPlan.mockResolvedValue(makePlan());

      await useRevisionQueueStore.getState().clearCache('book-a');

      expect(mock.revision.clearCache).toHaveBeenCalledWith('book-a');
      expect(mock.revision.clearCache.mock.invocationCallOrder[0]).toBeLessThan(
        mock.revision.loadPlan.mock.invocationCallOrder[0],
      );
      expect(useRevisionQueueStore.getState().plan?.id).toBe('plan-1');
    });
  });

  describe('running sessions', () => {
    beforeEach(async () => {
      mock.revision.loadPlan.mockResolvedValue(makePlan());
      await useRevisionQueueStore.getState().loadPlan('book-a');
    });

    it('runNext runs the first pending session and resets running state afterwards', async () => {
      const run = deferred<void>();
      mock.revision.runSession.mockImplementation(() => run.promise);

      const pending = useRevisionQueueStore.getState().runNext();
      expect(useRevisionQueueStore.getState().isRunning).toBe(true);
      expect(useRevisionQueueStore.getState().activeSessionId).toBe('sess-1');
      expect(useRevisionQueueStore.getState().viewingSessionId).toBe('sess-1');

      run.resolve();
      await pending;

      expect(mock.revision.runSession).toHaveBeenCalledWith('plan-1', 'sess-1');
      expect(useRevisionQueueStore.getState().isRunning).toBe(false);
      expect(useRevisionQueueStore.getState().activeSessionId).toBeNull();
    });

    it('runNext is a no-op when no session is pending', async () => {
      useRevisionQueueStore.setState({
        plan: makePlan({ sessions: [makeSession({ status: 'approved' })] }),
      });

      await useRevisionQueueStore.getState().runNext();

      expect(mock.revision.runSession).not.toHaveBeenCalled();
    });

    it('runSession failures land in the error field', async () => {
      mock.revision.runSession.mockRejectedValue(new Error('CLI busy'));

      await useRevisionQueueStore.getState().runSession('sess-1');

      expect(useRevisionQueueStore.getState().error).toBe('CLI busy');
      expect(useRevisionQueueStore.getState().isRunning).toBe(false);
    });

    it('a run that finishes after the plan changed does not touch the new plan state (pinned)', async () => {
      const run = deferred<void>();
      mock.revision.runSession.mockImplementation(() => run.promise);

      const pending = useRevisionQueueStore.getState().runSession('sess-1');
      useRevisionQueueStore.setState({ planId: 'plan-2' }); // plan swapped mid-run

      run.reject(new Error('stale failure'));
      await pending;

      // Neither the error nor the running reset applies to the swapped plan
      expect(useRevisionQueueStore.getState().error).toBeNull();
      expect(useRevisionQueueStore.getState().isRunning).toBe(true);
    });

    it('runAll passes the selected ids in selective mode and undefined otherwise', async () => {
      await useRevisionQueueStore.getState().runAll();
      expect(mock.revision.runAll).toHaveBeenCalledWith('plan-1', undefined);

      useRevisionQueueStore.setState({
        plan: makePlan({ mode: 'selective' }),
        selectedSessionIds: new Set(['sess-2']),
      });
      await useRevisionQueueStore.getState().runAll();
      expect(mock.revision.runAll).toHaveBeenLastCalledWith('plan-1', ['sess-2']);
    });
  });

  describe('gates and session verdicts', () => {
    beforeEach(async () => {
      mock.revision.loadPlan.mockResolvedValue(makePlan());
      await useRevisionQueueStore.getState().loadPlan('book-a');
    });

    it('respondToGate clears the gate locally before answering the backend', async () => {
      useRevisionQueueStore.setState({ gateSessionId: 'sess-1', gateText: 'Approve?' });

      await useRevisionQueueStore.getState().respondToGate('approve');

      expect(useRevisionQueueStore.getState().gateSessionId).toBeNull();
      expect(useRevisionQueueStore.getState().gateText).toBe('');
      expect(mock.revision.respondToGate).toHaveBeenCalledWith('plan-1', 'sess-1', 'approve', undefined);
    });

    it('sendGateMessage appends an optimistic user message and rejects with the message', async () => {
      useRevisionQueueStore.setState({ gateSessionId: 'sess-1', gateText: 'Approve?' });

      await useRevisionQueueStore.getState().sendGateMessage('tighten chapter 2 first');

      expect(useRevisionQueueStore.getState().panelMessages.at(-1)).toMatchObject({
        role: 'user',
        content: 'tighten chapter 2 first',
      });
      expect(mock.revision.respondToGate).toHaveBeenCalledWith(
        'plan-1', 'sess-1', 'reject', 'tighten chapter 2 first',
      );
    });

    it('approve/reject/skip forward to the bridge with the planId', async () => {
      await useRevisionQueueStore.getState().approveSession('sess-1');
      await useRevisionQueueStore.getState().rejectSession('sess-1');
      await useRevisionQueueStore.getState().skipSession('sess-2');

      expect(mock.revision.approveSession).toHaveBeenCalledWith('plan-1', 'sess-1');
      expect(mock.revision.rejectSession).toHaveBeenCalledWith('plan-1', 'sess-1');
      expect(mock.revision.skipSession).toHaveBeenCalledWith('plan-1', 'sess-2');
    });

    it('pause and setMode update local state optimistically before the bridge call (pinned)', () => {
      useRevisionQueueStore.getState().pause();
      expect(useRevisionQueueStore.getState().isPaused).toBe(true);
      expect(mock.revision.pause).toHaveBeenCalledWith('plan-1');

      useRevisionQueueStore.getState().setMode('auto-approve');
      expect(useRevisionQueueStore.getState().plan?.mode).toBe('auto-approve');
      expect(mock.revision.setMode).toHaveBeenCalledWith('plan-1', 'auto-approve');
    });
  });

  describe('selection and session panel', () => {
    beforeEach(async () => {
      mock.revision.loadPlan.mockResolvedValue(
        makePlan({ sessions: [makeSession({ conversationId: 'conv-s1' }), makeSession({ id: 'sess-2', index: 2 })] }),
      );
      await useRevisionQueueStore.getState().loadPlan('book-a');
    });

    it('toggle/selectAll/deselectAll manage the selection set', () => {
      useRevisionQueueStore.getState().toggleSessionSelection('sess-1');
      expect(useRevisionQueueStore.getState().selectedSessionIds.has('sess-1')).toBe(false);

      useRevisionQueueStore.getState().deselectAllSessions();
      expect(useRevisionQueueStore.getState().selectedSessionIds.size).toBe(0);

      useRevisionQueueStore.getState().selectAllSessions();
      expect(useRevisionQueueStore.getState().selectedSessionIds.size).toBe(2);
    });

    it('setViewingSession loads panel messages for the session conversation', async () => {
      mock.chat.getMessages.mockResolvedValue([makeMessage({ conversationId: 'conv-s1' })]);

      useRevisionQueueStore.getState().setViewingSession('sess-1');

      await vi.waitFor(() =>
        expect(useRevisionQueueStore.getState().panelMessagesConvId).toBe('conv-s1'),
      );
      expect(useRevisionQueueStore.getState().panelMessages).toHaveLength(1);

      // Sessions without a conversation clear the panel
      useRevisionQueueStore.getState().setViewingSession('sess-2');
      expect(useRevisionQueueStore.getState().panelMessages).toEqual([]);
      expect(useRevisionQueueStore.getState().panelMessagesConvId).toBeNull();

      // null clears everything including chat mode
      useRevisionQueueStore.getState().setViewingSession(null);
      expect(useRevisionQueueStore.getState().viewingSessionId).toBeNull();
    });

    it('startVerification stores the verification conversation and views it', async () => {
      mock.revision.startVerification.mockResolvedValue('verify-conv');
      mock.chat.getMessages.mockResolvedValue([]);

      await useRevisionQueueStore.getState().startVerification();

      const state = useRevisionQueueStore.getState();
      expect(mock.revision.startVerification).toHaveBeenCalledWith('plan-1');
      expect(state.verificationConversationId).toBe('verify-conv');
      expect(state.viewingSessionId).toBe('__verification__');
      expect(state.isVerifying).toBe(false);
    });
  });

  describe('switchToBook + per-book cache', () => {
    it('loads a fresh book and picks up a queue already running on the backend', async () => {
      mock.revision.loadPlan.mockResolvedValue(makePlan({ id: 'plan-f', bookSlug: 'fresh-book' }));
      mock.revision.getQueueStatus.mockResolvedValue({
        planId: 'plan-f',
        isRunning: true,
        activeSessionId: 'sess-1',
      });

      await useRevisionQueueStore.getState().switchToBook('fresh-book');

      const state = useRevisionQueueStore.getState();
      expect(state.plan?.bookSlug).toBe('fresh-book');
      expect(state.isRunning).toBe(true);
      expect(state.activeSessionId).toBe('sess-1');
    });

    it('restores cached state when returning to a book, without reloading the plan', async () => {
      mock.revision.getQueueStatus.mockResolvedValue({ planId: null, isRunning: false, activeSessionId: null });
      mock.revision.loadPlan
        .mockResolvedValueOnce(makePlan({ id: 'plan-c1', bookSlug: 'cache-book-1' }))
        .mockResolvedValueOnce(makePlan({ id: 'plan-c2', bookSlug: 'cache-book-2' }));

      await useRevisionQueueStore.getState().switchToBook('cache-book-1');
      useRevisionQueueStore.getState().setViewingSession('sess-2'); // distinctive cached detail
      await useRevisionQueueStore.getState().switchToBook('cache-book-2');
      expect(useRevisionQueueStore.getState().plan?.id).toBe('plan-c2');

      mock.revision.loadPlan.mockClear();
      await useRevisionQueueStore.getState().switchToBook('cache-book-1');

      const state = useRevisionQueueStore.getState();
      expect(state.plan?.id).toBe('plan-c1');
      expect(state.viewingSessionId).toBe('sess-2');
      expect(mock.revision.loadPlan).not.toHaveBeenCalled();
    });

    it('reloads from disk when the cached queue finished while viewing another book', async () => {
      mock.revision.getQueueStatus.mockResolvedValue({ planId: null, isRunning: false, activeSessionId: null });
      mock.revision.loadPlan
        .mockResolvedValueOnce(makePlan({ id: 'plan-r1', bookSlug: 'run-book-1' }))
        .mockResolvedValueOnce(makePlan({ id: 'plan-r2', bookSlug: 'run-book-2' }));

      await useRevisionQueueStore.getState().switchToBook('run-book-1');
      useRevisionQueueStore.setState({ isRunning: true, activeSessionId: 'sess-1' }); // running when we left
      await useRevisionQueueStore.getState().switchToBook('run-book-2');

      // Returning: backend says the queue is no longer running → plan reloaded from disk
      const finished = makePlan({
        id: 'plan-r1',
        bookSlug: 'run-book-1',
        sessions: [makeSession({ status: 'approved' })],
      });
      mock.revision.loadPlan.mockResolvedValue(finished);
      await useRevisionQueueStore.getState().switchToBook('run-book-1');

      const state = useRevisionQueueStore.getState();
      expect(state.isRunning).toBe(false);
      expect(state.activeSessionId).toBeNull();
      expect(state.plan?.sessions[0].status).toBe('approved');
    });
  });

  describe('modal', () => {
    it('openModal opens for the book and loads its plan; closeModal minimizes while running', async () => {
      mock.revision.loadPlan.mockResolvedValue(makePlan({ bookSlug: 'modal-book' }));
      mock.revision.getQueueStatus.mockResolvedValue({ planId: null, isRunning: false, activeSessionId: null });

      useRevisionQueueStore.getState().openModal('modal-book');
      expect(useRevisionQueueStore.getState().isModalOpen).toBe(true);
      expect(useRevisionQueueStore.getState().modalBookSlug).toBe('modal-book');
      await vi.waitFor(() =>
        expect(useRevisionQueueStore.getState().plan?.bookSlug).toBe('modal-book'),
      );

      // Running: close minimizes instead of closing
      useRevisionQueueStore.setState({ isRunning: true });
      useRevisionQueueStore.getState().closeModal();
      expect(useRevisionQueueStore.getState().isModalOpen).toBe(true);
      expect(useRevisionQueueStore.getState().isMinimized).toBe(true);

      // Opening a DIFFERENT book while running is blocked
      useRevisionQueueStore.setState({ isMinimized: false });
      useRevisionQueueStore.getState().openModal('other-book');
      expect(useRevisionQueueStore.getState().modalBookSlug).toBe('modal-book');

      // Idle: close really closes
      useRevisionQueueStore.setState({ isRunning: false });
      useRevisionQueueStore.getState().closeModal();
      expect(useRevisionQueueStore.getState().isModalOpen).toBe(false);

      useRevisionQueueStore.getState().toggleMinimize();
      expect(useRevisionQueueStore.getState().isMinimized).toBe(true);
    });
  });
});
