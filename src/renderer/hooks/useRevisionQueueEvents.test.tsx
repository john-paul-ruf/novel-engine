import { describe, it, expect } from 'vitest';
import { act } from '@testing-library/react';
import type { RevisionPlan, RevisionQueueEvent, RevisionSession } from '@domain/types';
import { useRevisionQueueEvents } from './useRevisionQueueEvents';
import { useBookStore } from '../stores/bookStore';
import { useFileChangeStore } from '../stores/fileChangeStore';
import { useRevisionQueueStore } from '../stores/revisionQueueStore';
import { renderApp } from '../../test/renderWithState';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useBookStore, useFileChangeStore, useRevisionQueueStore);

function makeSession(overrides: Partial<RevisionSession> = {}): RevisionSession {
  return {
    id: 's1',
    index: 1,
    title: 'Ch 1-3 Pacing Pass',
    chapters: ['01-opening'],
    taskNumbers: [1, 2],
    model: 'sonnet',
    prompt: 'Fix pacing.',
    notes: '',
    status: 'pending',
    conversationId: null,
    response: '',
    ...overrides,
  };
}

function makePlan(sessions: RevisionSession[]): RevisionPlan {
  return {
    id: 'plan-1',
    bookSlug: 'book-a',
    sessions,
    totalTasks: 4,
    completedTaskNumbers: [1],
    phases: [],
    mode: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    verificationConversationId: null,
  };
}

function Harness(): null {
  useRevisionQueueEvents();
  return null;
}

function mountHook(sessions: RevisionSession[] = [makeSession()]) {
  const utils = renderApp(<Harness />, {
    stores: [
      [useRevisionQueueStore, { plan: makePlan(sessions), planId: 'plan-1' }],
    ],
  });
  const emit = (event: RevisionQueueEvent) =>
    act(() => utils.bridge.emit('revision:event', event));
  return { ...utils, emit };
}

describe('useRevisionQueueEvents', () => {
  it('marks a session running and resets the stream buffers', () => {
    const { emit } = mountHook();
    useRevisionQueueStore.setState({ streamingResponse: 'stale', streamingThinking: 'stale' });

    emit({ type: 'session:status', sessionId: 's1', status: 'running', conversationId: 'conv-9' });

    const state = useRevisionQueueStore.getState();
    expect(state.plan?.sessions[0]).toMatchObject({ status: 'running', conversationId: 'conv-9' });
    expect(state.activeSessionId).toBe('s1');
    expect(state.viewingSessionId).toBe('s1');
    expect(state.isRunning).toBe(true);
    expect(state.streamingResponse).toBe('');
    expect(state.streamingThinking).toBe('');
  });

  it("ignores status events for sessions outside the loaded plan (another book's queue)", () => {
    const { emit } = mountHook();

    emit({ type: 'session:status', sessionId: 'foreign', status: 'running' });

    const state = useRevisionQueueStore.getState();
    expect(state.isRunning).toBe(false);
    expect(state.plan?.sessions[0].status).toBe('pending');
  });

  it('accumulates chunk and thinking text', () => {
    const { emit } = mountHook();

    emit({ type: 'session:chunk', sessionId: 's1', text: 'Hello ' });
    emit({ type: 'session:chunk', sessionId: 's1', text: 'world' });
    emit({ type: 'session:thinking', sessionId: 's1', text: 'hmm' });

    const state = useRevisionQueueStore.getState();
    expect(state.streamingResponse).toBe('Hello world');
    expect(state.streamingThinking).toBe('hmm');
  });

  it('surfaces approval gates for the gated session', () => {
    const { emit } = mountHook();

    emit({ type: 'session:gate', sessionId: 's1', gateText: 'Shall I proceed?' });

    const state = useRevisionQueueStore.getState();
    expect(state.gateSessionId).toBe('s1');
    expect(state.gateText).toBe('Shall I proceed?');
    expect(state.viewingSessionId).toBe('s1');
  });

  it('merges completed task numbers and clears the active session on done', () => {
    const { emit } = mountHook();
    const revisionBefore = useFileChangeStore.getState().revision;
    useRevisionQueueStore.setState({ activeSessionId: 's1', streamingResponse: 'text' });

    emit({ type: 'session:done', sessionId: 's1', taskNumbers: [1, 2] });

    const state = useRevisionQueueStore.getState();
    // 1 was already complete — deduplicated
    expect(state.plan?.completedTaskNumbers).toEqual([1, 2]);
    expect(state.activeSessionId).toBeNull();
    expect(state.streamingResponse).toBe('');
    expect(useFileChangeStore.getState().revision).toBe(revisionBefore + 1);
  });

  it('done events from other plans still fire the file-change notification', () => {
    const { emit } = mountHook();
    const revisionBefore = useFileChangeStore.getState().revision;

    emit({ type: 'session:done', sessionId: 'foreign', taskNumbers: [9] });

    const state = useRevisionQueueStore.getState();
    expect(state.plan?.completedTaskNumbers).toEqual([1]); // untouched
    expect(useFileChangeStore.getState().revision).toBe(revisionBefore + 1);
  });

  it('stops the queue only when queue:done matches the loaded plan', () => {
    const { emit } = mountHook();
    useRevisionQueueStore.setState({ isRunning: true, isPaused: true });

    emit({ type: 'queue:done', planId: 'other-plan' });
    expect(useRevisionQueueStore.getState().isRunning).toBe(true);

    emit({ type: 'queue:done', planId: 'plan-1' });
    const state = useRevisionQueueStore.getState();
    expect(state.isRunning).toBe(false);
    expect(state.isPaused).toBe(false);
  });

  it('records errors and halts the running flag', () => {
    const { emit } = mountHook();
    useRevisionQueueStore.setState({ isRunning: true });

    emit({ type: 'error', sessionId: 's1', message: 'CLI crashed' });

    const state = useRevisionQueueStore.getState();
    expect(state.error).toBe('CLI crashed');
    expect(state.isRunning).toBe(false);
  });

  it('tracks the plan loading step', () => {
    const { emit } = mountHook();

    emit({ type: 'plan:loading-step', step: 'Parsing sessions' });

    expect(useRevisionQueueStore.getState().loadingStep).toBe('Parsing sessions');
  });

  it('unsubscribes from revision events on unmount', () => {
    const { bridge, unmount } = mountHook();
    expect(bridge.listenerCount('revision:event')).toBe(1);

    unmount();
    expect(bridge.listenerCount('revision:event')).toBe(0);
  });
});
