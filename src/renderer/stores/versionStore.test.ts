import { describe, it, expect, beforeEach } from 'vitest';
import type { FileDiff, FileVersionSummary } from '@domain/types';
import { useVersionStore } from './versionStore';
import { installNovelEngineMock, type NovelEngineMock } from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useVersionStore);

function makeVersionSummary(id: number, overrides: Partial<FileVersionSummary> = {}): FileVersionSummary {
  return {
    id,
    bookSlug: 'book-a',
    filePath: 'chapters/01-one/draft.md',
    contentHash: `hash-${id}`,
    byteSize: 100,
    source: 'agent',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeDiff(oldId: number | null, newId: number): FileDiff {
  return {
    oldVersion: oldId === null ? null : makeVersionSummary(oldId),
    newVersion: makeVersionSummary(newId),
    hunks: [],
    totalAdditions: 1,
    totalDeletions: 0,
  };
}

let mock: NovelEngineMock;

beforeEach(() => {
  mock = installNovelEngineMock();
});

// Versions are sorted newest-first: [30, 20, 10]
const history = [makeVersionSummary(30), makeVersionSummary(20), makeVersionSummary(10)];

async function loadHistory(): Promise<void> {
  mock.versions.getHistory.mockResolvedValue(history);
  mock.versions.getCount.mockResolvedValue(3);
  await useVersionStore.getState().loadHistory('book-a', 'chapters/01-one/draft.md');
}

describe('versionStore', () => {
  it('loadHistory loads the first page and the total count', async () => {
    await loadHistory();

    const state = useVersionStore.getState();
    expect(state.versions.map((v) => v.id)).toEqual([30, 20, 10]);
    expect(state.totalCount).toBe(3);
    expect(state.isLoading).toBe(false);
    expect(mock.versions.getHistory).toHaveBeenCalledWith('book-a', 'chapters/01-one/draft.md', 30, 0);
  });

  it('loadHistory failure stores the error message', async () => {
    mock.versions.getHistory.mockRejectedValue(new Error('db locked'));
    mock.versions.getCount.mockResolvedValue(0);

    await useVersionStore.getState().loadHistory('book-a', 'chapters/01-one/draft.md');

    expect(useVersionStore.getState().error).toBe('db locked');
    expect(useVersionStore.getState().isLoading).toBe(false);
  });

  it('loadMoreHistory appends the next page and stops when everything is loaded', async () => {
    await loadHistory();
    useVersionStore.setState({ totalCount: 5 });
    mock.versions.getHistory.mockResolvedValue([makeVersionSummary(5), makeVersionSummary(1)]);

    await useVersionStore.getState().loadMoreHistory();

    expect(mock.versions.getHistory).toHaveBeenLastCalledWith('book-a', 'chapters/01-one/draft.md', 30, 3);
    expect(useVersionStore.getState().versions.map((v) => v.id)).toEqual([30, 20, 10, 5, 1]);

    // All loaded — no further bridge call
    mock.versions.getHistory.mockClear();
    await useVersionStore.getState().loadMoreHistory();
    expect(mock.versions.getHistory).not.toHaveBeenCalled();
  });

  it('selectVersion diffs against the next-older version; the oldest diffs from nothing', async () => {
    await loadHistory();
    mock.versions.getDiff.mockResolvedValue(makeDiff(10, 20));

    await useVersionStore.getState().selectVersion(20);

    expect(mock.versions.getDiff).toHaveBeenCalledWith(10, 20);
    expect(useVersionStore.getState().selectedVersionId).toBe(20);
    expect(useVersionStore.getState().diff?.newVersion.id).toBe(20);
    expect(useVersionStore.getState().isDiffLoading).toBe(false);

    mock.versions.getDiff.mockResolvedValue(makeDiff(null, 10));
    await useVersionStore.getState().selectVersion(10);
    expect(mock.versions.getDiff).toHaveBeenLastCalledWith(null, 10);
  });

  it('selectVersion failure stores the error; clearSelection drops the diff', async () => {
    await loadHistory();
    mock.versions.getDiff.mockRejectedValue(new Error('diff exploded'));

    await useVersionStore.getState().selectVersion(30);
    expect(useVersionStore.getState().error).toBe('diff exploded');

    useVersionStore.getState().clearSelection();
    expect(useVersionStore.getState().selectedVersionId).toBeNull();
    expect(useVersionStore.getState().diff).toBeNull();
  });

  it('revertToVersion reverts via the bridge and reloads the history; no-op without a file', async () => {
    await useVersionStore.getState().revertToVersion(20);
    expect(mock.versions.revert).not.toHaveBeenCalled();

    await loadHistory();
    mock.versions.revert.mockResolvedValue({
      ...makeVersionSummary(40, { source: 'revert' }),
      content: 'reverted content',
    });

    await useVersionStore.getState().revertToVersion(20);

    expect(mock.versions.revert).toHaveBeenCalledWith('book-a', 'chapters/01-one/draft.md', 20);
    // Reload happened (two initial calls + one after revert)
    expect(mock.versions.getHistory).toHaveBeenCalledTimes(2);
  });

  it('revert failure stores the error without clearing the current list', async () => {
    await loadHistory();
    mock.versions.revert.mockRejectedValue(new Error('version gone'));

    await useVersionStore.getState().revertToVersion(99);

    expect(useVersionStore.getState().error).toBe('version gone');
    expect(useVersionStore.getState().versions).toHaveLength(3);
  });

  it('reset restores the pristine state', async () => {
    await loadHistory();

    useVersionStore.getState().reset();

    expect(useVersionStore.getState()).toMatchObject({
      activeBookSlug: '',
      activeFilePath: '',
      versions: [],
      totalCount: 0,
      selectedVersionId: null,
      diff: null,
      error: null,
    });
  });
});
