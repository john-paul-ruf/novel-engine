import { describe, it, expect, vi, beforeAll } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { RevisionQueueModal } from './RevisionQueueModal';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { useBookStore } from '../../stores/bookStore';
import { renderApp, type StoreSeed } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import {
  makeBookSummary,
  makeRevisionPlan,
  makeRevisionSession,
} from '../../../test/novelEngineMock';

resetStoresBeforeEach(useRevisionQueueStore, useBookStore);

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

// Seeding a plan whose bookSlug matches modalBookSlug keeps the auto-load
// effect from calling switchToBook (whose module-level per-book cache is not
// cleared by resetStores).
function seedOpenModal(extra: Record<string, unknown> = {}): StoreSeed {
  return [
    [
      useRevisionQueueStore,
      {
        isModalOpen: true,
        isMinimized: false,
        modalBookSlug: 'test-book',
        plan: makeRevisionPlan({
          sessions: [
            makeRevisionSession({ id: 's1', status: 'approved' }),
            makeRevisionSession({ id: 's2', index: 2, title: 'Polish dialogue' }),
          ],
        }),
        planId: 'plan-1',
        ...extra,
      },
    ],
    [useBookStore, { activeSlug: 'test-book' }],
  ];
}

describe('RevisionQueueModal', () => {
  it('renders nothing while closed', () => {
    const { container } = renderApp(<RevisionQueueModal />);
    expect(container).toBeEmptyDOMElement();
  });

  it('expanded modal lists sessions with controls and progress', () => {
    renderApp(<RevisionQueueModal />, { stores: seedOpenModal() });

    expect(screen.getByText('Revision Queue')).toBeInTheDocument();
    expect(screen.getByText('1/2 sessions')).toBeInTheDocument();
    expect(screen.getByText(/Session 1: Fix pacing/)).toBeInTheDocument();
    expect(screen.getByText(/Session 2: Polish dialogue/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run Next/ })).toBeInTheDocument();
  });

  it('clicking a session opens the side panel with its details', () => {
    renderApp(<RevisionQueueModal />, { stores: seedOpenModal() });

    fireEvent.click(screen.getByText(/Session 2: Polish dialogue/));

    expect(useRevisionQueueStore.getState().viewingSessionId).toBe('s2');
    expect(screen.getByText('View session prompt')).toBeInTheDocument();
    // Cards collapse to compact labels while the panel is open
    expect(screen.getByText(/S1: Fix pacing/)).toBeInTheDocument();
  });

  it('shows a badge instead of the modal when another book is active', () => {
    renderApp(<RevisionQueueModal />, {
      stores: [
        ...seedOpenModal(),
        [
          useBookStore,
          {
            activeSlug: 'other-book',
            books: [makeBookSummary({ slug: 'test-book', title: 'Test Book' })],
          },
        ],
      ],
    });

    expect(screen.getByText('Revision queue running on Test Book')).toBeInTheDocument();
    expect(screen.queryByText('Revision Queue')).not.toBeInTheDocument();
  });

  it('minimized bar shows progress and expands or closes', () => {
    renderApp(<RevisionQueueModal />, { stores: seedOpenModal({ isMinimized: true }) });

    expect(screen.getByText('Revision Queue')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Expand'));
    expect(useRevisionQueueStore.getState().isMinimized).toBe(false);
  });

  it('close button closes the modal', () => {
    renderApp(<RevisionQueueModal />, { stores: seedOpenModal() });

    fireEvent.click(screen.getByTitle('Close'));
    expect(useRevisionQueueStore.getState().isModalOpen).toBe(false);
  });

  it('shows the no-plan error state', async () => {
    const switchToBook = vi.fn(async () => undefined);
    renderApp(<RevisionQueueModal />, {
      stores: seedOpenModal({ plan: null, planId: null, error: 'No plan found', switchToBook }),
    });

    expect(screen.getByText('No Revision Plan')).toBeInTheDocument();
    expect(screen.getByText('No plan found')).toBeInTheDocument();
    // Auto-load kicked in because no plan is cached
    await waitFor(() => expect(switchToBook).toHaveBeenCalledWith('test-book'));
  });
});
