import { describe, it, expect, beforeEach } from 'vitest';
import { useTourStore } from './tourStore';
import { useViewStore } from './viewStore';
import { useBookStore } from './bookStore';
import { useChatStore } from './chatStore';
import { useWorkspaceStore } from './workspaceStore';
import { installNovelEngineMock, makeConversation, type NovelEngineMock } from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useViewStore, useBookStore, useChatStore, useWorkspaceStore, useTourStore);

let mock: NovelEngineMock;

beforeEach(() => {
  mock = installNovelEngineMock();
});

describe('tourStore', () => {
  it('hydrate loads the completed set from settings data', () => {
    useTourStore.getState().hydrate(['welcome']);

    expect(useTourStore.getState().isHydrated).toBe(true);
    expect(useTourStore.getState().isTourCompleted('welcome')).toBe(true);
    expect(useTourStore.getState().isTourCompleted('first-book')).toBe(false);
  });

  it('startTour lands in the workspace and refuses to stack tours', () => {
    useTourStore.getState().startTour('pipeline-intro');

    expect(useTourStore.getState().activeTourId).toBe('pipeline-intro');
    expect(useViewStore.getState().currentView).toBe('workspace');

    useTourStore.getState().startTour('welcome'); // another tour active — no-op
    expect(useTourStore.getState().activeTourId).toBe('pipeline-intro');
  });

  it('the welcome tour selects the pitch phase and auto-starts a Spark conversation', async () => {
    useBookStore.setState({ activeSlug: 'book-a' });
    mock.chat.createConversation.mockResolvedValue(
      makeConversation({ id: 'spark-conv', agentName: 'Spark', pipelinePhase: 'pitch' }),
    );

    useTourStore.getState().startTour('welcome');

    expect(useWorkspaceStore.getState().selectedPhaseId).toBe('pitch');
    expect(mock.chat.createConversation).toHaveBeenCalledWith({
      bookSlug: 'book-a',
      agentName: 'Spark',
      pipelinePhase: 'pitch',
      purpose: 'pipeline',
    });
  });

  it('the welcome tour skips the Spark auto-start without an active book', () => {
    useTourStore.getState().startTour('welcome');
    expect(mock.chat.createConversation).not.toHaveBeenCalled();
  });

  it('completeTour marks the active tour done and persists to settings; no-op when idle', async () => {
    await useTourStore.getState().completeTour();
    expect(mock.settings.update).not.toHaveBeenCalled();

    useTourStore.getState().startTour('welcome');
    await useTourStore.getState().completeTour();

    expect(useTourStore.getState().activeTourId).toBeNull();
    expect(useTourStore.getState().isTourCompleted('welcome')).toBe(true);
    expect(mock.settings.update).toHaveBeenCalledWith({ completedTours: ['welcome'] });
  });

  it('completeTour keeps the local completion even when persistence fails (pinned)', async () => {
    mock.settings.update.mockRejectedValue(new Error('disk full'));
    useTourStore.getState().startTour('first-book');

    await useTourStore.getState().completeTour();

    expect(useTourStore.getState().isTourCompleted('first-book')).toBe(true);
  });

  it('dismissTour clears the active tour WITHOUT marking it complete or persisting', () => {
    useTourStore.getState().startTour('welcome');

    useTourStore.getState().dismissTour();

    expect(useTourStore.getState().activeTourId).toBeNull();
    expect(useTourStore.getState().isTourCompleted('welcome')).toBe(false);
    expect(mock.settings.update).not.toHaveBeenCalled();
  });

  it('resetTour removes the completion and persists, enabling replay', async () => {
    useTourStore.getState().hydrate(['welcome', 'first-book']);

    await useTourStore.getState().resetTour('welcome');

    expect(useTourStore.getState().isTourCompleted('welcome')).toBe(false);
    expect(mock.settings.update).toHaveBeenCalledWith({ completedTours: ['first-book'] });

    // Re-entry after reset works
    useTourStore.getState().startTour('welcome');
    expect(useTourStore.getState().activeTourId).toBe('welcome');
  });
});
