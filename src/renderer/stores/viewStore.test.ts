import { describe, it, expect, beforeEach } from 'vitest';
import { useViewStore, navigateToPhase } from './viewStore';
import { installNovelEngineMock } from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useViewStore);

beforeEach(() => {
  installNovelEngineMock();
});

const STORAGE_KEY = 'novel-engine-view';

function readPersisted(): { state: { currentView: string; payload: Record<string, unknown> }; version: number } {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  expect(raw).not.toBeNull();
  return JSON.parse(raw!) as ReturnType<typeof readPersisted>;
}

describe('viewStore', () => {
  it('starts in the library view with an empty payload', () => {
    expect(useViewStore.getState().currentView).toBe('library');
    expect(useViewStore.getState().payload).toEqual({});
  });

  it('navigate switches the view and carries the payload', () => {
    useViewStore.getState().navigate('manuscript', { chapterSlug: '01-one', manuscriptMode: 'editor' });

    expect(useViewStore.getState().currentView).toBe('manuscript');
    expect(useViewStore.getState().payload).toEqual({ chapterSlug: '01-one', manuscriptMode: 'editor' });
  });

  it('navigate without a payload clears the previous payload', () => {
    useViewStore.getState().navigate('workspace', { phaseId: 'pitch' });
    useViewStore.getState().navigate('settings');

    expect(useViewStore.getState().currentView).toBe('settings');
    expect(useViewStore.getState().payload).toEqual({});
  });

  it('navigateToPhase deep-links into the workspace with the phase id', () => {
    navigateToPhase('first-draft');

    expect(useViewStore.getState().currentView).toBe('workspace');
    expect(useViewStore.getState().payload).toEqual({ phaseId: 'first-draft' });
  });

  it('persists currentView and payload to localStorage at version 6', () => {
    useViewStore.getState().navigate('exports');

    const persisted = readPersisted();
    expect(persisted.version).toBe(6);
    expect(persisted.state.currentView).toBe('exports');
    expect(persisted.state.payload).toEqual({});
  });

  it('rehydrates a same-version persisted view from localStorage', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { currentView: 'statistics', payload: {} }, version: 6 }),
    );

    await useViewStore.persist.rehydrate();

    expect(useViewStore.getState().currentView).toBe('statistics');
  });

  it('migrate forwards every legacy view to its streamlined-workspace replacement', async () => {
    const migrate = useViewStore.persist.getOptions().migrate;
    expect(migrate).toBeDefined();

    // v4 removed views chain through their old replacements first
    const cases: Array<[string, string]> = [
      ['motif-ledger', 'manuscript'], // → files → manuscript
      ['revision-queue', 'workspace'], // → dashboard → workspace
      ['dashboard', 'workspace'],
      ['chat', 'workspace'],
      ['reading', 'manuscript'],
      ['build', 'exports'],
      ['files', 'manuscript'],
    ];

    for (const [legacy, expected] of cases) {
      const migrated = await migrate!({ currentView: legacy, payload: {} }, 3);
      expect(migrated.currentView).toBe(expected);
    }
  });

  it('migrate passes current views through unchanged', async () => {
    const migrate = useViewStore.persist.getOptions().migrate!;

    for (const view of ['library', 'workspace', 'manuscript', 'query-manager', 'settings']) {
      const migrated = await migrate({ currentView: view, payload: {} }, 5);
      expect(migrated.currentView).toBe(view);
    }
  });

  it('rehydrating an old-version snapshot applies the migration end-to-end', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { currentView: 'reading', payload: {} }, version: 3 }),
    );

    await useViewStore.persist.rehydrate();

    expect(useViewStore.getState().currentView).toBe('manuscript');
  });
});
