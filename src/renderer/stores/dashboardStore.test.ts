import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BookDashboardData } from '@domain/types';
import { useDashboardStore } from './dashboardStore';
import { installNovelEngineMock, type NovelEngineMock } from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useDashboardStore);

function makeDashboardData(overrides: Partial<BookDashboardData> = {}): BookDashboardData {
  return {
    bookSlug: 'book-a',
    pipeline: { currentPhase: null, completedCount: 2, totalCount: 15 },
    wordCount: { current: 12000, target: 90000, perChapter: [] },
    lastInteraction: null,
    revisionTasks: { total: 0, completed: 0, items: [] },
    recentFiles: [],
    daysInProgress: 3,
    bookTitle: 'Test Book',
    bookStatus: 'first-draft',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let mock: NovelEngineMock;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mock = installNovelEngineMock();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('dashboardStore', () => {
  it('load populates the dashboard aggregates', async () => {
    mock.dashboard.getData.mockResolvedValue(makeDashboardData());

    await useDashboardStore.getState().load('book-a');

    const state = useDashboardStore.getState();
    expect(state.data?.bookTitle).toBe('Test Book');
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.loadedSlug).toBe('book-a');
    expect(mock.dashboard.getData).toHaveBeenCalledWith('book-a');
  });

  it('load with an empty slug is a no-op', async () => {
    await useDashboardStore.getState().load('');
    expect(mock.dashboard.getData).not.toHaveBeenCalled();
  });

  it('bridge failure sets the error and clears loading', async () => {
    mock.dashboard.getData.mockRejectedValue(new Error('db locked'));

    await useDashboardStore.getState().load('book-a');

    expect(useDashboardStore.getState().error).toBe('Failed to load dashboard data');
    expect(useDashboardStore.getState().loading).toBe(false);
    expect(useDashboardStore.getState().data).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('a stale load result is discarded when another book was loaded meanwhile', async () => {
    const slow = deferred<BookDashboardData>();
    mock.dashboard.getData
      .mockImplementationOnce(() => slow.promise)
      .mockResolvedValueOnce(makeDashboardData({ bookSlug: 'book-b', bookTitle: 'Book B' }));

    const pendingA = useDashboardStore.getState().load('book-a');
    await useDashboardStore.getState().load('book-b');

    slow.resolve(makeDashboardData({ bookSlug: 'book-a', bookTitle: 'Stale A' }));
    await pendingA;

    expect(useDashboardStore.getState().data?.bookTitle).toBe('Book B');
  });

  it('refresh reloads the current slug and is a no-op before any load', async () => {
    await useDashboardStore.getState().refresh();
    expect(mock.dashboard.getData).not.toHaveBeenCalled();

    mock.dashboard.getData.mockResolvedValue(makeDashboardData());
    await useDashboardStore.getState().load('book-a');
    await useDashboardStore.getState().refresh();

    expect(mock.dashboard.getData).toHaveBeenCalledTimes(2);
    expect(mock.dashboard.getData).toHaveBeenLastCalledWith('book-a');
  });
});
