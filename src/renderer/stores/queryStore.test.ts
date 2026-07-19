import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { QueryLetter, QueryTarget, QueryTracker } from '@domain/types';
import { useQueryStore } from './queryStore';
import { useBookStore } from './bookStore';
import { installNovelEngineMock, type NovelEngineMock } from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useBookStore, useQueryStore);

function makeTarget(overrides: Partial<QueryTarget> = {}): QueryTarget {
  return {
    id: 'tgt-1',
    name: 'Agent Smith',
    type: 'agent',
    contact: 'smith@lit.example',
    method: 'email',
    status: 'drafting',
    queryLetterPath: null,
    submittedDate: null,
    responseDate: null,
    notes: '',
    link: '',
    personalizationNotes: '',
    ...overrides,
  };
}

function makeTracker(overrides: Partial<QueryTracker> = {}): QueryTracker {
  return {
    bookSlug: 'book-a',
    lastUpdated: '2026-01-01T00:00:00.000Z',
    targets: [makeTarget()],
    ...overrides,
  };
}

const letter: QueryLetter = {
  targetName: 'Agent Smith',
  targetSlug: 'agent-smith',
  filePath: 'source/query-letters/agent-smith.md',
  content: 'Dear Agent Smith…',
  generatedAt: '2026-01-01T00:00:00.000Z',
};

let mock: NovelEngineMock;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mock = installNovelEngineMock();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  mock.query.loadTracker.mockResolvedValue(makeTracker());
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('queryStore', () => {
  it('load populates tracker and letters; failure sets the error', async () => {
    mock.query.listLetters.mockResolvedValue([letter]);
    await useQueryStore.getState().load('book-a');
    expect(useQueryStore.getState().tracker?.targets).toHaveLength(1);
    expect(useQueryStore.getState().letters).toHaveLength(1);

    mock.query.loadTracker.mockRejectedValue(new Error('tracker corrupt'));
    await useQueryStore.getState().load('book-a');
    expect(useQueryStore.getState().error).toBe('Failed to load query tracker');
    expect(useQueryStore.getState().loading).toBe(false);
  });

  it('target CRUD forwards to the bridge and reloads the tracker', async () => {
    const created = makeTarget({ id: 'tgt-2', name: 'New Agent' });
    mock.query.addTarget.mockResolvedValue(created);

    const returned = await useQueryStore.getState().addTarget('book-a', {
      name: 'New Agent', type: 'agent', contact: '', method: 'email', status: 'drafting',
      notes: '', link: '', personalizationNotes: '',
    });
    expect(returned).toEqual(created);

    await useQueryStore.getState().updateTargetStatus('book-a', 'tgt-1', 'queried', '2026-02-01');
    expect(mock.query.updateTargetStatus).toHaveBeenCalledWith('book-a', 'tgt-1', 'queried', '2026-02-01');

    await useQueryStore.getState().removeTarget('book-a', 'tgt-1');
    expect(mock.query.removeTarget).toHaveBeenCalledWith('book-a', 'tgt-1');

    expect(mock.query.loadTracker).toHaveBeenCalledTimes(3); // one reload per mutation
  });

  it('generateLetter tracks the generating flags and reloads on success', async () => {
    let resolveGen!: (l: QueryLetter) => void;
    mock.query.generateLetter.mockImplementation(
      () => new Promise<QueryLetter>((res) => { resolveGen = res; }),
    );

    const pending = useQueryStore.getState().generateLetter('book-a', 'tgt-1');
    expect(useQueryStore.getState().isGenerating).toBe(true);
    expect(useQueryStore.getState().generatingFor).toBe('tgt-1');

    resolveGen(letter);
    const result = await pending;

    expect(result).toEqual(letter);
    expect(useQueryStore.getState().isGenerating).toBe(false);
    expect(useQueryStore.getState().generatingFor).toBeNull();
    expect(mock.query.loadTracker).toHaveBeenCalled();
  });

  it('generateLetter failure returns null with an error', async () => {
    mock.query.generateLetter.mockRejectedValue(new Error('no letter'));

    const result = await useQueryStore.getState().generateLetter('book-a', 'tgt-1');

    expect(result).toBeNull();
    expect(useQueryStore.getState().error).toBe('Letter generation failed');
  });

  describe('researchTargets', () => {
    it('returns null without an active book and never calls the bridge', async () => {
      expect(await useQueryStore.getState().researchTargets()).toBeNull();
      expect(mock.query.researchTargets).not.toHaveBeenCalled();
    });

    it('stores the result and reloads on success', async () => {
      useBookStore.setState({ activeSlug: 'book-a' });
      const research = { addedTargets: 2, targetNames: ['A', 'B'], conversationId: 'conv-q' };
      mock.query.researchTargets.mockResolvedValue(research);

      const result = await useQueryStore.getState().researchTargets();

      expect(result).toEqual(research);
      expect(useQueryStore.getState().lastResearchResult).toEqual(research);
      expect(useQueryStore.getState().isResearching).toBe(false);
    });

    it('strips the Electron IPC prefix from rejection messages (pinned)', async () => {
      useBookStore.setState({ activeSlug: 'book-a' });
      mock.query.researchTargets.mockRejectedValue(
        new Error("Error invoking remote method 'query:researchTargets': Error: research crashed"),
      );

      const result = await useQueryStore.getState().researchTargets();

      expect(result).toBeNull();
      expect(useQueryStore.getState().error).toBe('research crashed');
    });
  });

  it('fillTargetField requires an active book and reloads on success', async () => {
    expect(await useQueryStore.getState().fillTargetField('tgt-1', 'contact')).toBeNull();

    useBookStore.setState({ activeSlug: 'book-a' });
    const fill = {
      targetId: 'tgt-1', field: 'contact' as const, oldValue: '', newValue: 'x@y.z',
      conversationId: 'conv-f',
    };
    mock.query.fillTargetField.mockResolvedValue(fill);

    const result = await useQueryStore.getState().fillTargetField('tgt-1', 'contact');
    expect(result).toEqual(fill);
    expect(useQueryStore.getState().fillingFor).toBeNull();

    mock.query.fillTargetField.mockRejectedValue(new Error('nope'));
    expect(await useQueryStore.getState().fillTargetField('tgt-1', 'contact')).toBeNull();
    expect(useQueryStore.getState().error).toBe('Field research failed');
  });

  it('readLetter passes through; saveLetter writes then reloads', async () => {
    mock.query.readLetter.mockResolvedValue('Dear…');
    expect(await useQueryStore.getState().readLetter('book-a', 'agent-smith')).toBe('Dear…');

    await useQueryStore.getState().saveLetter('book-a', 'agent-smith', 'Edited letter');
    expect(mock.query.saveLetter).toHaveBeenCalledWith('book-a', 'agent-smith', 'Edited letter');
    expect(mock.query.loadTracker).toHaveBeenCalled();
  });

  it('stream deltas route to the buffer matching the active operation', () => {
    const cleanup = useQueryStore.getState().initStreamListener();

    // Neither flag set — deltas are ignored
    mock.emit('query:onStream', { type: 'textDelta', text: 'ignored' });
    expect(useQueryStore.getState().streamBuffer).toBe('');

    useQueryStore.setState({ isGenerating: true });
    mock.emit('query:onStream', { type: 'textDelta', text: 'letter text' });
    expect(useQueryStore.getState().streamBuffer).toBe('letter text');
    expect(useQueryStore.getState().researchBuffer).toBe('');

    useQueryStore.setState({ isGenerating: false, isResearching: true });
    mock.emit('query:onStream', { type: 'textDelta', text: 'research text' });
    expect(useQueryStore.getState().researchBuffer).toBe('research text');

    cleanup();
    expect(mock.listenerCount('query:onStream')).toBe(0);
  });

  it('clear resets everything except the error field it explicitly nulls', async () => {
    mock.query.listLetters.mockResolvedValue([letter]);
    await useQueryStore.getState().load('book-a');

    useQueryStore.getState().clear();

    expect(useQueryStore.getState()).toMatchObject({
      tracker: null,
      letters: [],
      streamBuffer: '',
      lastResearchResult: null,
      error: null,
    });
  });
});
