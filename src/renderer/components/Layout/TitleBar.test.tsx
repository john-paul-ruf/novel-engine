import { describe, it, expect } from 'vitest';
import { screen, fireEvent, act, waitFor } from '@testing-library/react';
import { PIPELINE_PHASES } from '@domain/constants';
import { TitleBar } from './TitleBar';
import { useViewStore } from '../../stores/viewStore';
import { useBookStore } from '../../stores/bookStore';
import { usePaletteStore } from '../../stores/paletteStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { renderApp } from '../../../test/renderWithState';
import { makeBookSummary } from '../../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../../test/resetStores';

// workspaceStore has cross-store subscriptions — register it last (S22 handoff)
resetStoresBeforeEach(useViewStore, useBookStore, usePaletteStore, useWorkspaceStore);

const BOOK = makeBookSummary({ slug: 'my-book', title: 'My Book' });

describe('TitleBar breadcrumb', () => {
  it('shows only the view label in the Library', () => {
    renderApp(<TitleBar />);
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.queryByText('My Book')).toBeNull();
  });

  it('shows "{book} / {view}" outside the Library when a book is active', () => {
    renderApp(<TitleBar />, {
      stores: [
        [useBookStore, { books: [BOOK], activeSlug: 'my-book' }],
        [useViewStore, { currentView: 'manuscript' }],
      ],
    });
    expect(screen.getByText('My Book')).toBeInTheDocument();
    expect(screen.getByText('Manuscript')).toBeInTheDocument();
  });

  it('shows the selected phase label in the Workspace', () => {
    const phase = PIPELINE_PHASES[0];
    renderApp(<TitleBar />, {
      stores: [
        [useBookStore, { books: [BOOK], activeSlug: 'my-book' }],
        [useViewStore, { currentView: 'workspace' }],
        [useWorkspaceStore, { selectedPhaseId: phase.id }],
      ],
    });
    expect(screen.getByText(phase.label)).toBeInTheDocument();
  });
});

describe('TitleBar word count', () => {
  it('is hidden in the Library and without a book', () => {
    renderApp(<TitleBar />, {
      stores: [[useBookStore, { totalWordCount: 987 }]],
    });
    expect(screen.queryByText('987 words')).toBeNull();
  });

  it('shows the active book word count outside the Library', () => {
    renderApp(<TitleBar />, {
      stores: [
        [useBookStore, { books: [BOOK], activeSlug: 'my-book', totalWordCount: 987 }],
        [useViewStore, { currentView: 'workspace' }],
      ],
    });
    expect(screen.getByText('987 words')).toBeInTheDocument();
  });
});

describe('TitleBar command pill', () => {
  it('opens the command palette', () => {
    renderApp(<TitleBar />);
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(usePaletteStore.getState().isOpen).toBe(true);
  });
});

describe('TitleBar window controls (non-mac)', () => {
  it('routes minimize/maximize/close to the bridge', async () => {
    const { bridge } = renderApp(<TitleBar />);
    await waitFor(() => expect(bridge.window.isMaximized).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(bridge.window.minimize).toHaveBeenCalledTimes(1);
    expect(bridge.window.maximize).toHaveBeenCalledTimes(1);
    expect(bridge.window.close).toHaveBeenCalledTimes(1);
  });

  it('flips Maximize to Restore on maximize-change push events', async () => {
    const { bridge } = renderApp(<TitleBar />);
    await waitFor(() => expect(bridge.listenerCount('window:maximizeChange')).toBe(1));

    act(() => bridge.emit('window:maximizeChange', true));
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maximize' })).toBeNull();

    act(() => bridge.emit('window:maximizeChange', false));
    expect(screen.getByRole('button', { name: 'Maximize' })).toBeInTheDocument();
  });
});
