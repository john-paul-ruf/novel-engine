import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { IconRail } from './IconRail';
import { useViewStore } from '../../stores/viewStore';
import { useBookStore } from '../../stores/bookStore';
import { useHelperStore } from '../../stores/helperStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useViewStore, useBookStore, useHelperStore);

const WORKSPACE_LABEL = 'Workspace — pipeline & agent chat';

describe('IconRail', () => {
  it('renders all nav items plus the Help button', () => {
    renderApp(<IconRail />);
    for (const label of [
      'Library — your bookshelf',
      WORKSPACE_LABEL,
      'Manuscript — read & edit',
      'Exports — DOCX, EPUB, PDF',
      'Query Manager — agents & submissions',
      'Statistics — usage & word counts',
      'Settings',
      'Help — ask the assistant',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('disables book-scoped items when no book is active', () => {
    renderApp(<IconRail />);
    const workspace = screen.getByRole('button', { name: WORKSPACE_LABEL });
    expect(workspace).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(workspace);
    expect(useViewStore.getState().currentView).toBe('library');
  });

  it('always allows book-independent navigation', () => {
    renderApp(<IconRail />);
    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(settings).toHaveAttribute('aria-disabled', 'false');

    fireEvent.click(settings);
    expect(useViewStore.getState().currentView).toBe('settings');
  });

  it('navigates to book-scoped views once a book is active', () => {
    renderApp(<IconRail />, {
      stores: [[useBookStore, { activeSlug: 'my-book' }]],
    });
    const workspace = screen.getByRole('button', { name: WORKSPACE_LABEL });
    expect(workspace).toHaveAttribute('aria-disabled', 'false');

    fireEvent.click(workspace);
    expect(useViewStore.getState().currentView).toBe('workspace');
  });

  it('toggles the Helper panel', () => {
    const { bridge } = renderApp(<IconRail />);
    fireEvent.click(screen.getByRole('button', { name: 'Help — ask the assistant' }));
    expect(useHelperStore.getState().isOpen).toBe(true);
    expect(bridge.helper.getOrCreateConversation).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Help — ask the assistant' }));
    expect(useHelperStore.getState().isOpen).toBe(false);
  });
});
