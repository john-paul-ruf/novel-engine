import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { ShelvedPitchMeta } from '@domain/types';
import { PitchRail } from './PitchRail';
import { usePitchRoomStore } from '../../stores/pitchRoomStore';
import { usePitchShelfStore } from '../../stores/pitchShelfStore';
import { useBookStore } from '../../stores/bookStore';
import { useViewStore } from '../../stores/viewStore';
import { renderApp, type StoreSeed } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeConversation, type BridgeOverrides } from '../../../test/novelEngineMock';

resetStoresBeforeEach(usePitchRoomStore, usePitchShelfStore, useBookStore, useViewStore);

const PITCH: ShelvedPitchMeta = {
  slug: 'space-heist',
  title: 'Space Heist',
  logline: 'A crew steals a moon.',
  shelvedAt: '2026-06-01T00:00:00.000Z',
  shelvedFrom: 'old-book',
};

function renderRail(stores: StoreSeed = [], bridge: BridgeOverrides = {}) {
  return renderApp(<PitchRail />, { stores, bridge });
}

describe('PitchRail', () => {
  it('shows empty states for sessions and shelved pitches', async () => {
    renderRail();

    expect(screen.getByText('No pitch sessions yet')).toBeInTheDocument();
    expect(await screen.findByText(/No shelved pitches yet/)).toBeInTheDocument();
  });

  it('lists sessions and starts a new pitch', async () => {
    const startNewConversation = vi.fn(async () => undefined);
    renderRail([
      [
        usePitchRoomStore,
        {
          conversations: [
            makeConversation({ id: 'c1', title: 'Moon heist' }),
            makeConversation({ id: 'c2', title: '' }),
          ],
          activeConversation: makeConversation({ id: 'c1', title: 'Moon heist' }),
          startNewConversation,
        },
      ],
    ]);

    expect(screen.getByText('Moon heist')).toBeInTheDocument();
    expect(screen.getByText('New pitch')).toBeInTheDocument(); // untitled fallback

    fireEvent.click(screen.getByRole('button', { name: /New Pitch/ }));
    expect(startNewConversation).toHaveBeenCalledTimes(1);
  });

  it('deleting a session requires a second click', async () => {
    const { bridge } = renderRail([
      [
        usePitchRoomStore,
        { conversations: [makeConversation({ id: 'c1', title: 'Moon heist' })] },
      ],
    ]);

    const deleteButton = screen.getByTitle('Delete');
    fireEvent.click(deleteButton);
    expect(bridge.chat.deleteConversation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Click again to confirm'));
    await waitFor(() => expect(bridge.chat.deleteConversation).toHaveBeenCalledWith('c1'));
  });

  it('renders shelved pitches and restores one into a book', async () => {
    const { bridge } = renderRail([], { pitches: { list: vi.fn(async () => [PITCH]) } });

    expect(await screen.findByText('Space Heist')).toBeInTheDocument();
    expect(screen.getByText('A crew steals a moon.')).toBeInTheDocument();
    expect(screen.getByText(/from old-book/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(screen.getByText('Create book from pitch?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() => expect(bridge.pitches.restore).toHaveBeenCalledWith('space-heist'));
    // Restored meta's slug becomes the active book and we land in the workspace
    await waitFor(() => expect(bridge.books.setActive).toHaveBeenCalledWith('test-book'));
    expect(useViewStore.getState().currentView).toBe('workspace');
  });

  it('deletes a shelved pitch after confirmation', async () => {
    const { bridge } = renderRail([], { pitches: { list: vi.fn(async () => [PITCH]) } });
    await screen.findByText('Space Heist');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete permanently?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() => expect(bridge.pitches.delete).toHaveBeenCalledWith('space-heist'));
  });

  it('shelves the current pitch for the active book', async () => {
    // The store prepends the shelve result to the list — must resolve a meta
    const shelve = vi.fn(async () => PITCH);
    renderRail(
      [[useBookStore, { activeSlug: 'test-book' }]],
      { pitches: { shelve } },
    );

    const button = screen.getByRole('button', { name: /Shelve Current Pitch/ });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => expect(shelve).toHaveBeenCalled());
    expect(await screen.findByText('Pitch shelved')).toBeInTheDocument();
  });

  it('cannot shelve without an active book', () => {
    renderRail();
    expect(screen.getByRole('button', { name: /Shelve Current Pitch/ })).toBeDisabled();
  });
});
