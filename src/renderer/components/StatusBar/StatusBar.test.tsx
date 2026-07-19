import { describe, it, expect, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import type { StreamEvent } from '@domain/types';
import { StatusBar } from './StatusBar';
import { useCliActivityStore } from '../../stores/cliActivityStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useCliActivityStore);

afterEach(() => {
  useCliActivityStore.getState().destroyListener();
});

type TaggedEvent = StreamEvent & { callId?: string; conversationId?: string };

function handle(event: TaggedEvent): void {
  act(() => useCliActivityStore.getState().handleStreamEvent(event));
}

function startCall(callId: string): void {
  handle({
    type: 'callStart',
    agentName: 'Spark',
    model: 'claude-opus-4-20250514',
    bookSlug: 'book-a',
    callId,
    conversationId: 'conv-1',
  });
}

describe('StatusBar', () => {
  it('shows the idle state with zero session tokens', () => {
    renderApp(<StatusBar />);
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByText('0 tokens this session')).toBeInTheDocument();
  });

  it('shows the active agent while a call is running', () => {
    renderApp(<StatusBar />);
    startCall('call-1');

    expect(screen.queryByText('Idle')).toBeNull();
    expect(screen.getByText('Spark')).toBeInTheDocument();
  });

  it('returns to idle and totals session tokens after the call completes', () => {
    renderApp(<StatusBar />);
    startCall('call-1');
    handle({
      type: 'done',
      inputTokens: 1000,
      outputTokens: 400,
      thinkingTokens: 100,
      filesTouched: {},
      callId: 'call-1',
    });

    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByText('1.5K tokens this session')).toBeInTheDocument();
  });

  it('toggles the activity drawer', () => {
    renderApp(<StatusBar />);
    const toggle = screen.getByRole('button', { name: /Activity/ });
    expect(useCliActivityStore.getState().drawerOpen).toBe(false);

    fireEvent.click(toggle);
    expect(useCliActivityStore.getState().drawerOpen).toBe(true);
    expect(toggle).toHaveAttribute('title', 'Hide activity drawer');

    fireEvent.click(toggle);
    expect(useCliActivityStore.getState().drawerOpen).toBe(false);
  });
});
