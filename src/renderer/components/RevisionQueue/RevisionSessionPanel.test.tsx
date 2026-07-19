import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { RevisionSessionPanel } from './RevisionSessionPanel';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { useBookStore } from '../../stores/bookStore';
import { useCliActivityStore } from '../../stores/cliActivityStore';
import { renderApp, type StoreSeed } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import {
  makeMessage,
  makeRevisionPlan,
  makeRevisionSession,
} from '../../../test/novelEngineMock';

resetStoresBeforeEach(useRevisionQueueStore, useBookStore, useCliActivityStore);

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
  if (typeof IntersectionObserver === 'undefined') {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
  }
});

afterEach(() => {
  useCliActivityStore.getState().destroyListener();
});

function seedPanel(extra: Record<string, unknown> = {}): StoreSeed {
  const session = makeRevisionSession({ id: 's1', title: 'Fix pacing' });
  return [
    [
      useRevisionQueueStore,
      {
        plan: makeRevisionPlan({ sessions: [session] }),
        planId: 'plan-1',
        viewingSessionId: 's1',
        ...extra,
      },
    ],
    [useBookStore, { activeSlug: 'test-book' }],
  ];
}

describe('RevisionSessionPanel', () => {
  it('shows the session header, collapsible prompt, and Run Session for pending sessions', () => {
    renderApp(<RevisionSessionPanel />, { stores: seedPanel() });

    expect(screen.getByText('Session 1: Fix pacing')).toBeInTheDocument();
    expect(screen.getByText('View session prompt')).toBeInTheDocument();
    expect(screen.getByText('Session prompt text')).toBeInTheDocument();
    expect(screen.getByText('Click "Run Session" to start')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run Session' })).toBeInTheDocument();
  });

  it('Run Session starts the viewed session', async () => {
    const { bridge } = renderApp(<RevisionSessionPanel />, { stores: seedPanel() });

    fireEvent.click(screen.getByRole('button', { name: 'Run Session' }));

    await waitFor(() =>
      expect(bridge.revision.runSession).toHaveBeenCalledWith('plan-1', 's1'),
    );
  });

  it('renders loaded panel messages', () => {
    renderApp(<RevisionSessionPanel />, {
      stores: seedPanel({
        panelMessages: [
          makeMessage({ id: 'm1', role: 'user', content: 'Start session' }),
          makeMessage({ id: 'm2', role: 'assistant', content: 'Working on chapter five' }),
        ],
      }),
    });

    expect(screen.getByText('Start session')).toBeInTheDocument();
    expect(screen.getByText('Working on chapter five')).toBeInTheDocument();
  });

  it('a gate shows approval controls that answer through the bridge', async () => {
    const { bridge } = renderApp(<RevisionSessionPanel />, {
      stores: seedPanel({ gateSessionId: 's1', gateText: 'Proceed?' }),
    });

    expect(screen.getByText('Verity is waiting for your approval')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(bridge.revision.respondToGate).toHaveBeenCalledWith(
        'plan-1',
        's1',
        'approve',
        undefined,
      ),
    );
  });

  it('sends gate feedback text as a reject-with-message', async () => {
    const { bridge } = renderApp(<RevisionSessionPanel />, {
      stores: seedPanel({ gateSessionId: 's1', gateText: 'Proceed?' }),
    });

    const textarea = screen.getByPlaceholderText('Send feedback to Verity...');
    fireEvent.change(textarea, { target: { value: 'Change the opening' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() =>
      expect(bridge.revision.respondToGate).toHaveBeenCalledWith(
        'plan-1',
        's1',
        'reject',
        'Change the opening',
      ),
    );
  });

  it('streams live response text for the active session', () => {
    renderApp(<RevisionSessionPanel />, {
      stores: seedPanel({ activeSessionId: 's1', streamingResponse: 'Rewriting scene two' }),
    });

    expect(screen.getByText('Rewriting scene two')).toBeInTheDocument();
  });

  it('shows the CLI activity feed for the rev-tagged call', () => {
    renderApp(<RevisionSessionPanel />, { stores: seedPanel() });
    // The IPC layer tags revision stream events with callId `rev:${sessionId}`
    act(() => {
      useCliActivityStore.getState().handleStreamEvent({
        type: 'callStart',
        agentName: 'Verity',
        model: 'test-model',
        bookSlug: 'test-book',
        callId: 'rev:s1',
        conversationId: 'conv-1',
      });
      useCliActivityStore.getState().handleStreamEvent({
        type: 'status',
        message: 'Reading draft.md',
        callId: 'rev:s1',
      });
    });

    expect(screen.getByText('CLI Activity')).toBeInTheDocument();
    expect(screen.getByText('Reading draft.md')).toBeInTheDocument();
  });

  it('renders the verification chat panel for the __verification__ pseudo-session', () => {
    renderApp(<RevisionSessionPanel />, {
      stores: seedPanel({
        viewingSessionId: '__verification__',
        verificationConversationId: 'conv-v',
        panelMessages: [],
      }),
    });

    expect(screen.getByText('Verification')).toBeInTheDocument();
    expect(
      screen.getByText('Send a message to start the verification chat with Verity'),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Chat with Verity about the revisions...'),
    ).toBeInTheDocument();
  });
});
