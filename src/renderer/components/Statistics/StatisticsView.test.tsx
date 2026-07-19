import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { BookStatistics } from '@domain/types';
import { StatisticsView } from './StatisticsView';
import { useStatisticsStore } from '../../stores/statisticsStore';
import { useBookStore } from '../../stores/bookStore';
import { renderApp, type StoreSeed } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeBookSummary } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useStatisticsStore, useBookStore);

function makeStats(overrides: Partial<BookStatistics> = {}): BookStatistics {
  return {
    usageOverTime: [
      { date: '2026-07-01', inputTokens: 1000, outputTokens: 500, thinkingTokens: 100 },
    ],
    perAgent: [
      {
        agentName: 'Spark',
        inputTokens: 1000,
        outputTokens: 500,
        thinkingTokens: 100,
        conversationCount: 2,
        estimatedCost: 1.25,
      },
    ],
    perPhase: [
      {
        phase: 'pitch',
        inputTokens: 1000,
        outputTokens: 500,
        thinkingTokens: 100,
        conversationCount: 2,
        estimatedCost: 1.25,
      },
    ],
    wordCountHistory: [
      { bookSlug: 'alpha', wordCount: 5000, chapterCount: 3, recordedAt: '2026-07-01T00:00:00Z' },
    ],
    totalCostEstimate: 2.5,
    wordsPerChapter: [{ slug: '02-opening', wordCount: 1500 }],
    totalTokens: { input: 3000, output: 2000, thinking: 1000 },
    conversationCount: 5,
    ...overrides,
  };
}

const EMPTY_STATS = makeStats({
  usageOverTime: [],
  perAgent: [],
  perPhase: [],
  wordCountHistory: [],
  wordsPerChapter: [],
  totalTokens: { input: 0, output: 0, thinking: 0 },
  totalCostEstimate: 0,
  conversationCount: 0,
});

function renderStats(stats: BookStatistics, stores: StoreSeed = []) {
  return renderApp(<StatisticsView />, {
    bridge: { statistics: { get: vi.fn(async () => stats) } },
    stores,
  });
}

describe('StatisticsView', () => {
  it('shows the empty state when nothing was recorded', async () => {
    renderStats(EMPTY_STATS);

    expect(await screen.findByText(/No usage data recorded yet\. Statistics will appear/)).toBeInTheDocument();
    expect(screen.queryByText('Total Tokens')).not.toBeInTheDocument();
  });

  it('renders summary cards and chart sections with seeded data', async () => {
    renderStats(makeStats());

    expect(await screen.findByText('6.0K')).toBeInTheDocument(); // total tokens
    expect(screen.getByText('3.0K in / 2.0K out / 1.0K think')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // conversations
    expect(screen.getByText('~$2.50')).toBeInTheDocument();

    expect(screen.getByText('Token Usage Over Time')).toBeInTheDocument();
    expect(screen.getByText('Usage by Agent')).toBeInTheDocument();
    expect(screen.getByText('Usage by Phase')).toBeInTheDocument();
    expect(screen.getByText('Word Count History')).toBeInTheDocument();
    expect(screen.getByText('$1.25')).toBeInTheDocument(); // agent legend cost

    // All-books view hides the per-book word cards
    expect(screen.queryByText('Total Words')).not.toBeInTheDocument();
    expect(screen.queryByText('Words Per Chapter')).not.toBeInTheDocument();
  });

  it('per-book filter adds word totals and reloads through the bridge', async () => {
    const { bridge } = renderStats(makeStats(), [
      [useBookStore, { books: [makeBookSummary({ slug: 'alpha', title: 'Alpha' })] }],
    ]);
    await screen.findByText('6.0K');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'alpha' } });

    await waitFor(() => expect(bridge.statistics.get).toHaveBeenCalledWith('alpha'));
    expect(await screen.findByText('Total Words')).toBeInTheDocument();
    expect(screen.getByText('1,500')).toBeInTheDocument();
    expect(screen.getByText('Words Per Chapter')).toBeInTheDocument();
  });

  it('shows the error state and retries', async () => {
    const get = vi
      .fn<() => Promise<BookStatistics>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(makeStats());
    renderApp(<StatisticsView />, { bridge: { statistics: { get } } });

    expect(await screen.findByText('Failed to load statistics')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('6.0K')).toBeInTheDocument();
  });
});
