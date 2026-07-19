import { describe, it, expect, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { CliActivityContent } from './CliActivityPanel';
import { useCliActivityStore } from '../../stores/cliActivityStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useCliActivityStore);

afterEach(() => {
  useCliActivityStore.getState().destroyListener();
});

function startCall(callId: string, agentName = 'Spark'): void {
  useCliActivityStore.getState().handleStreamEvent({
    type: 'callStart',
    agentName: agentName as never,
    model: 'test-model',
    bookSlug: 'test-book',
    callId,
    conversationId: 'conv-1',
  });
}

describe('CliActivityContent', () => {
  it('shows the empty state before any call', () => {
    renderApp(<CliActivityContent />);
    expect(screen.getByText('No CLI activity yet')).toBeInTheDocument();
  });

  it('renders a live call with its activity feed and active badge', () => {
    renderApp(<CliActivityContent />);

    act(() => {
      startCall('call-1');
      useCliActivityStore.getState().handleStreamEvent({
        type: 'status',
        message: 'Reading source files',
        callId: 'call-1',
      });
    });

    expect(screen.getByText('1 Active')).toBeInTheDocument();
    expect(screen.getByText('Reading source files')).toBeInTheDocument();
    // Spawn entry from callStart
    expect(screen.getByText(/Spark call started/)).toBeInTheDocument();
  });

  it('Clear empties the feed back to the empty state', () => {
    renderApp(<CliActivityContent />);
    act(() => startCall('call-1'));

    fireEvent.click(screen.getByTitle('Clear all'));
    expect(screen.getByText('No CLI activity yet')).toBeInTheDocument();
  });

  it('lists multiple calls and switches the selected call', () => {
    renderApp(<CliActivityContent />);
    act(() => {
      startCall('call-1', 'Spark');
      useCliActivityStore.getState().handleStreamEvent({
        type: 'status',
        message: 'Spark status line',
        callId: 'call-1',
      });
      startCall('call-2', 'Verity');
      useCliActivityStore.getState().handleStreamEvent({
        type: 'status',
        message: 'Verity status line',
        callId: 'call-2',
      });
    });

    // Newest call auto-selected? The first active call stays selected (pinned
    // store behavior) — Spark's feed is visible until we click Verity's tab.
    const state = useCliActivityStore.getState();
    expect(state.callOrder).toEqual(['call-2', 'call-1']);

    act(() => useCliActivityStore.getState().selectCall('call-2'));
    expect(screen.getByText('Verity status line')).toBeInTheDocument();

    act(() => useCliActivityStore.getState().selectCall('call-1'));
    expect(screen.getByText('Spark status line')).toBeInTheDocument();
  });
});
