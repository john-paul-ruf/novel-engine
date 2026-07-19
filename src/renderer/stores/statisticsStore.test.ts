import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BookStatistics } from '@domain/types';
import { useStatisticsStore } from './statisticsStore';
import { installNovelEngineMock, type NovelEngineMock } from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useStatisticsStore);

// NOTE: session-prompt drift — there are no time ranges here; the only axis is
// the optional per-book filter (undefined = all books).
function makeStatistics(overrides: Partial<BookStatistics> = {}): BookStatistics {
  return {
    usageOverTime: [],
    perAgent: [],
    perPhase: [],
    wordCountHistory: [],
    totalCostEstimate: 1.23,
    wordsPerChapter: [],
    totalTokens: { input: 100, output: 200, thinking: 0 },
    conversationCount: 4,
    ...overrides,
  };
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

describe('statisticsStore', () => {
  it('load without a slug or filter requests all-book statistics', async () => {
    mock.statistics.get.mockResolvedValue(makeStatistics());

    await useStatisticsStore.getState().load();

    expect(mock.statistics.get).toHaveBeenCalledWith(undefined);
    expect(useStatisticsStore.getState().data?.conversationCount).toBe(4);
    expect(useStatisticsStore.getState().loading).toBe(false);
  });

  it('load prefers the explicit slug, then falls back to the stored filter', async () => {
    mock.statistics.get.mockResolvedValue(makeStatistics());
    useStatisticsStore.setState({ bookFilter: 'book-filter' });

    await useStatisticsStore.getState().load('book-explicit');
    expect(mock.statistics.get).toHaveBeenLastCalledWith('book-explicit');

    await useStatisticsStore.getState().load();
    expect(mock.statistics.get).toHaveBeenLastCalledWith('book-filter');
  });

  it('setBookFilter stores the filter and immediately reloads with it', async () => {
    mock.statistics.get.mockResolvedValue(makeStatistics());

    useStatisticsStore.getState().setBookFilter('book-a');
    await vi.waitFor(() => expect(mock.statistics.get).toHaveBeenCalledWith('book-a'));
    expect(useStatisticsStore.getState().bookFilter).toBe('book-a');

    useStatisticsStore.getState().setBookFilter(null);
    await vi.waitFor(() => expect(mock.statistics.get).toHaveBeenLastCalledWith(undefined));
  });

  it('bridge failure sets the error and clears loading, keeping any previous data', async () => {
    mock.statistics.get.mockResolvedValue(makeStatistics());
    await useStatisticsStore.getState().load();

    mock.statistics.get.mockRejectedValue(new Error('db locked'));
    await useStatisticsStore.getState().load();

    expect(useStatisticsStore.getState().error).toBe('Failed to load statistics');
    expect(useStatisticsStore.getState().loading).toBe(false);
    expect(useStatisticsStore.getState().data).not.toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});
