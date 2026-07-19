import { describe, it, expect, vi, beforeAll } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { PitchRoomView } from './PitchRoomView';
import { usePitchRoomStore } from '../../stores/pitchRoomStore';
import { usePitchShelfStore } from '../../stores/pitchShelfStore';
import { useBookStore } from '../../stores/bookStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useViewStore } from '../../stores/viewStore';
import { renderApp, type StoreSeed } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeConversation, makeMessage } from '../../../test/novelEngineMock';

resetStoresBeforeEach(
  usePitchRoomStore,
  usePitchShelfStore,
  useBookStore,
  useSettingsStore,
  useViewStore,
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

function renderView(stores: StoreSeed = []) {
  return renderApp(<PitchRoomView />, { stores });
}

describe('PitchRoomView', () => {
  it('renders the Spark header with the pitch-room badge and empty-state flavor', async () => {
    renderView();

    expect(screen.getByText('Spark')).toBeInTheDocument();
    expect(screen.getByText('Pitch Room')).toBeInTheDocument();
    expect(screen.getByText(/Brainstorm with Spark/)).toBeInTheDocument();
    // ensureConversation bootstraps a conversation on mount
    await waitFor(() =>
      expect(usePitchRoomStore.getState().activeConversation).not.toBeNull(),
    );
  });

  it('back affordance returns to the library', () => {
    renderView();

    fireEvent.click(screen.getByRole('button', { name: '← Library' }));
    expect(useViewStore.getState().currentView).toBe('library');
  });

  it('renders conversation messages and the active pitch title', () => {
    renderView([
      [
        usePitchRoomStore,
        {
          activeConversation: makeConversation({ title: 'Space heist' }),
          messages: [makeMessage({ id: 'm1', role: 'assistant', content: 'A daring heist!' })],
          ensureConversation: vi.fn(async () => undefined),
        },
      ],
    ]);

    expect(screen.getByText('— Space heist')).toBeInTheDocument();
    expect(screen.getByText('A daring heist!')).toBeInTheDocument();
  });

  it('Promote to Book appears with a pitch and activates the new book', async () => {
    const promoteActivePitch = vi.fn(async () => 'new-book');
    const { bridge } = renderView([
      [
        usePitchRoomStore,
        {
          hasPitch: true,
          activeConversation: makeConversation(),
          ensureConversation: vi.fn(async () => undefined),
          promoteActivePitch,
        },
      ],
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Promote to Book →' }));

    await waitFor(() => expect(promoteActivePitch).toHaveBeenCalled());
    await waitFor(() => expect(bridge.books.setActive).toHaveBeenCalledWith('new-book'));
  });

  it('shows the streamed response while Spark is answering', () => {
    renderView([
      [
        usePitchRoomStore,
        {
          isStreaming: true,
          streamBuffer: 'Here is a **fresh** idea',
          activeConversation: makeConversation(),
          ensureConversation: vi.fn(async () => undefined),
        },
      ],
    ]);

    expect(screen.getByText('fresh')).toBeInTheDocument();
  });
});
