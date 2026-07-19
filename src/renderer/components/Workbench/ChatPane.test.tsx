import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { PipelinePhase } from '@domain/types';
import { ChatPane } from './ChatPane';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useViewStore } from '../../stores/viewStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeAppSettings, makeConversation } from '../../../test/novelEngineMock';

resetStoresBeforeEach(
  useBookStore,
  useChatStore,
  useSettingsStore,
  useViewStore,
  useWorkspaceStore,
);

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
  useChatStore.getState().destroyStreamListener();
});

const SCAFFOLD: PipelinePhase = {
  id: 'scaffold',
  label: 'Story Scaffold',
  agent: 'Verity',
  status: 'active',
  description: 'Build the scene outline and story bible from the pitch',
};

const scaffoldConv = (overrides: Partial<ReturnType<typeof makeConversation>> = {}) =>
  makeConversation({
    id: 'conv-s1',
    agentName: 'Verity',
    pipelinePhase: 'scaffold',
    bookSlug: 'book-a',
    title: 'Outline work',
    ...overrides,
  });

describe('ChatPane', () => {
  it('shows the no-phase placeholder', () => {
    renderApp(<ChatPane phase={null} />);
    expect(screen.getByText('No phase selected')).toBeInTheDocument();
    expect(screen.getByText('No conversation for this phase yet')).toBeInTheDocument();
  });

  it('starts a phase conversation from the empty state', () => {
    const createConversation = vi.fn(async () => undefined);
    renderApp(<ChatPane phase={SCAFFOLD} />, {
      stores: [
        [useBookStore, { activeSlug: 'book-a' }],
        [useChatStore, { createConversation }],
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start with Verity' }));
    expect(createConversation).toHaveBeenCalledWith('Verity', 'book-a', 'scaffold');
  });

  it('renders chat input and sends with the agent default thinking budget', () => {
    const sendMessage = vi.fn(async () => undefined);
    renderApp(<ChatPane phase={SCAFFOLD} />, {
      stores: [
        [useBookStore, { activeSlug: 'book-a' }],
        [useSettingsStore, { settings: makeAppSettings() }],
        [
          useChatStore,
          {
            conversations: [scaffoldConv()],
            activeConversation: scaffoldConv(),
            sendMessage,
          },
        ],
      ],
    });

    const textarea = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(textarea, { target: { value: 'Draft the outline' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    // Verity's registry thinking budget (10000)
    expect(sendMessage).toHaveBeenCalledWith('Draft the outline', 10000);
  });

  it('auto-activates the most recent phase conversation while the workspace is active', async () => {
    const setActiveConversation = vi.fn(async () => undefined);
    renderApp(<ChatPane phase={SCAFFOLD} />, {
      stores: [
        [useBookStore, { activeSlug: 'book-a' }],
        [useViewStore, { currentView: 'workspace' }],
        [
          useChatStore,
          {
            conversations: [
              scaffoldConv({ id: 'older', updatedAt: '2026-01-01T00:00:00.000Z' }),
              scaffoldConv({ id: 'newer', updatedAt: '2026-02-01T00:00:00.000Z' }),
            ],
            activeConversation: null,
            setActiveConversation,
          },
        ],
      ],
    });

    await waitFor(() => expect(setActiveConversation).toHaveBeenCalledWith('newer'));
  });

  it('does not auto-activate outside the workspace view', () => {
    const setActiveConversation = vi.fn(async () => undefined);
    renderApp(<ChatPane phase={SCAFFOLD} />, {
      stores: [
        [useBookStore, { activeSlug: 'book-a' }],
        [useViewStore, { currentView: 'library' }],
        [
          useChatStore,
          {
            conversations: [scaffoldConv()],
            activeConversation: null,
            setActiveConversation,
          },
        ],
      ],
    });

    expect(setActiveConversation).not.toHaveBeenCalled();
  });

  it('lists phase conversations in the dropdown chip and selects one', () => {
    const setActiveConversation = vi.fn(async () => undefined);
    const active = scaffoldConv({ id: 'a', title: 'Active convo' });
    renderApp(<ChatPane phase={SCAFFOLD} />, {
      stores: [
        [useBookStore, { activeSlug: 'book-a' }],
        [
          useChatStore,
          {
            conversations: [
              active,
              scaffoldConv({ id: 'b', title: 'Other convo' }),
              // Different phase — must NOT appear in the dropdown
              scaffoldConv({ id: 'c', title: 'Pitch convo', pipelinePhase: 'pitch', agentName: 'Spark' }),
            ],
            activeConversation: active,
            setActiveConversation,
          },
        ],
      ],
    });

    fireEvent.click(screen.getByTitle('Switch conversation'));

    expect(screen.getByText('Other convo')).toBeInTheDocument();
    expect(screen.queryByText('Pitch convo')).toBeNull();

    fireEvent.click(screen.getByText('Other convo'));
    expect(setActiveConversation).toHaveBeenCalledWith('b');
  });

  it('treats non-active phases as read-only', () => {
    const conv = scaffoldConv();
    renderApp(<ChatPane phase={{ ...SCAFFOLD, status: 'complete' }} />, {
      stores: [
        [useBookStore, { activeSlug: 'book-a' }],
        [useChatStore, { conversations: [conv], activeConversation: conv }],
      ],
    });

    expect(
      screen.getByPlaceholderText('This phase is complete — conversation is read-only'),
    ).toBeInTheDocument();
  });

  it('shows the ad-hoc banner and returns to phase conversations on dismiss', () => {
    const adhoc = makeConversation({
      id: 'adhoc-1',
      agentName: 'Ghostlight',
      pipelinePhase: null,
      title: 'Hot take',
    });
    renderApp(<ChatPane phase={SCAFFOLD} />, {
      stores: [
        [useBookStore, { activeSlug: 'book-a' }],
        [useChatStore, { conversations: [adhoc], activeConversation: adhoc }],
        [useWorkspaceStore, { adhocConversationId: 'adhoc-1' }],
      ],
    });

    expect(screen.getByText('Ghostlight — Hot take')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Back to phase conversations'));
    expect(useWorkspaceStore.getState().adhocConversationId).toBeNull();
  });

  it('surfaces and dismisses the interrupted-session banner', () => {
    renderApp(<ChatPane phase={SCAFFOLD} />, {
      stores: [
        [useBookStore, { activeSlug: 'book-a' }],
        [
          useChatStore,
          {
            interruptedSession: {
              id: 's1',
              conversationId: 'conv-s1',
              agentName: 'Verity',
              model: 'test-model',
              bookSlug: 'book-a',
              startedAt: '2026-01-01T00:00:00.000Z',
              endedAt: null,
              finalStage: 'drafting',
              filesTouched: {},
              interrupted: true,
            },
          },
        ],
      ],
    });

    expect(screen.getByText(/session was interrupted/)).toBeInTheDocument();
    expect(screen.getByText('drafting')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/session was interrupted/)).toBeNull();
  });
});
