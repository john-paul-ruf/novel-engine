import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import type { TimestampedToolUse } from '@domain/types';
import { StreamingMessage } from './StreamingMessage';
import { useChatStore } from '../../stores/chatStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useChatStore);

function seed(state: Record<string, unknown>) {
  return renderApp(<StreamingMessage />, {
    stores: [[useChatStore, state]],
  });
}

describe('StreamingMessage', () => {
  it('renders nothing when not streaming', () => {
    const { container } = seed({ isStreaming: false, streamBuffer: 'leftover' });
    expect(container.innerHTML).toBe('');
  });

  it('shows a rotating waiting status while streaming with no output yet', () => {
    const { container } = seed({ isStreaming: true });

    const status = container.querySelector('.shimmer-text');
    expect(status).not.toBeNull();
    expect(status?.textContent?.length).toBeGreaterThan(0);
  });

  it('renders the stream buffer as markdown and drops the waiting status', () => {
    const { container } = seed({ isStreaming: true, streamBuffer: 'A **bold** delta' });

    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelector('.shimmer-text')).toBeNull();
  });

  it('shows the thinking block while thinking streams', () => {
    seed({ isStreaming: true, isThinking: true, thinkingBuffer: 'pondering plot' });

    expect(screen.getByText('Thinking...')).toBeInTheDocument();
    expect(screen.getByText('pondering plot')).toBeInTheDocument();
  });

  it('renders multi-call progress with step counter and bar width', () => {
    const { container } = seed({
      isStreaming: true,
      multiCallProgress: { step: 2, totalSteps: 5, label: 'Reading batch 2' },
    });

    expect(screen.getByText('Reading batch 2')).toBeInTheDocument();
    expect(screen.getByText('Step 2/5')).toBeInTheDocument();
    const bar = container.querySelector('.transition-all') as HTMLElement;
    expect(bar.style.width).toBe('40%');
  });

  it('renders the provider warning banner', () => {
    seed({ isStreaming: true, warningMessage: 'Provider does not support thinking' });
    expect(screen.getByText('Provider does not support thinking')).toBeInTheDocument();
  });

  it('shows the activity panel with stage label and recent tool timings', () => {
    const timings: TimestampedToolUse[] = [
      {
        toolId: 't1',
        toolName: 'Read',
        filePath: '/books/my-book/source/pitch.md',
        status: 'complete',
        startedAt: 1,
        durationMs: 950,
      },
      {
        toolId: 't2',
        toolName: 'Write',
        filePath: '/books/my-book/chapters/01-a/draft.md',
        status: 'complete',
        startedAt: 2,
        durationMs: 1500,
      },
    ];
    seed({ isStreaming: true, progressStage: 'drafting', toolTimings: timings });

    expect(screen.getByText('Writing')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.getByText('Write')).toBeInTheDocument();
    // Paths are shortened to their last two segments
    expect(screen.getByText('source/pitch.md')).toBeInTheDocument();
    // Sub-second durations in ms, seconds with one decimal
    expect(screen.getByText('950ms')).toBeInTheDocument();
    expect(screen.getByText('1.5s')).toBeInTheDocument();
  });

  it('shows the thinking summary in the activity panel outside the thinking stage', () => {
    seed({
      isStreaming: true,
      progressStage: 'reading',
      thinkingSummary: 'Mapping the outline',
    });

    expect(screen.getByText(/Mapping the outline/)).toBeInTheDocument();
  });

  it('hides the thinking summary during the thinking stage itself', () => {
    seed({
      isStreaming: true,
      progressStage: 'thinking',
      thinkingSummary: 'Mapping the outline',
    });

    expect(screen.getByText('Thinking deeply')).toBeInTheDocument();
    expect(screen.queryByText(/Mapping the outline/)).toBeNull();
  });
});
