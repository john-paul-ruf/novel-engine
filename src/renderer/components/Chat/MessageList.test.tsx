import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MessageList } from './MessageList';
import { useChatStore } from '../../stores/chatStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeMessage } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useChatStore);

beforeAll(() => {
  // jsdom gaps used by the auto-scroll machinery
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

describe('MessageList', () => {
  it('renders seeded messages in store order with role-specific alignment', () => {
    renderApp(<MessageList />, {
      stores: [
        [
          useChatStore,
          {
            messages: [
              makeMessage({ id: 'm1', role: 'user', content: 'First question' }),
              makeMessage({ id: 'm2', role: 'assistant', content: 'First answer' }),
            ],
          },
        ],
      ],
    });

    expect(screen.getByText('First question')).toBeInTheDocument();
    expect(screen.getByText('First answer')).toBeInTheDocument();

    const bubbles = document.querySelectorAll('.justify-end, .justify-start');
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0].className).toContain('justify-end'); // user first
    expect(bubbles[1].className).toContain('justify-start'); // assistant second
  });

  it('attaches tool activity to the matching message id', () => {
    renderApp(<MessageList />, {
      stores: [
        [
          useChatStore,
          {
            messages: [
              makeMessage({ id: 'm1', role: 'assistant', content: 'Wrote the chapter' }),
            ],
            messageToolActivity: { m1: ['chapters/01-a/draft.md'] },
          },
        ],
      ],
    });

    expect(screen.getByText('1 file written')).toBeInTheDocument();
    expect(screen.getByText('chapters/01-a/draft.md')).toBeInTheDocument();
  });

  it('shows the streaming message while the store is streaming', () => {
    renderApp(<MessageList />, {
      stores: [
        [useChatStore, { isStreaming: true, streamBuffer: 'Partial reply text' }],
      ],
    });

    expect(screen.getByText('Partial reply text')).toBeInTheDocument();
  });

  it('hides the streaming message when hideStreaming is set', () => {
    renderApp(<MessageList hideStreaming />, {
      stores: [
        [useChatStore, { isStreaming: true, streamBuffer: 'Partial reply text' }],
      ],
    });

    expect(screen.queryByText('Partial reply text')).toBeNull();
  });

  it('renders an empty list without messages', () => {
    renderApp(<MessageList />);
    expect(document.querySelectorAll('.justify-end, .justify-start')).toHaveLength(0);
  });
});
