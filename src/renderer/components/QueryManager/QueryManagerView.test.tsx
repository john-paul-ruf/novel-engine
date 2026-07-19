import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { QueryTarget, QueryTracker } from '@domain/types';
import { QueryManagerView } from './QueryManagerView';
import { useBookStore } from '../../stores/bookStore';
import { useQueryStore } from '../../stores/queryStore';
import { renderApp, type StoreSeed } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { type BridgeOverrides } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useBookStore, useQueryStore);

function makeTarget(overrides: Partial<QueryTarget> = {}): QueryTarget {
  return {
    id: 't1',
    name: 'Jane Agent',
    type: 'agent',
    contact: 'jane@lit.example',
    method: 'email',
    status: 'drafting',
    queryLetterPath: null,
    submittedDate: null,
    responseDate: null,
    notes: '',
    link: '',
    personalizationNotes: '',
    ...overrides,
  };
}

function makeTracker(targets: QueryTarget[]): QueryTracker {
  return { bookSlug: 'test-book', lastUpdated: '2026-07-01T00:00:00.000Z', targets };
}

function renderView(targets: QueryTarget[], bridge: BridgeOverrides = {}) {
  const stores: StoreSeed = [[useBookStore, { activeSlug: 'test-book' }]];
  return renderApp(<QueryManagerView />, {
    stores,
    bridge: {
      query: {
        loadTracker: vi.fn(async () => makeTracker(targets)),
        ...bridge.query,
      },
      ...bridge,
    },
  });
}

describe('QueryManagerView', () => {
  it('asks for a book when none is active', () => {
    renderApp(<QueryManagerView />);
    expect(screen.getByText('Select a book in the Library to manage queries')).toBeInTheDocument();
  });

  it('shows the empty tracker state', async () => {
    renderView([]);
    expect(await screen.findByText(/No submission targets yet/)).toBeInTheDocument();
  });

  it('summarises target counts in the header', async () => {
    renderView([
      makeTarget({ id: 't1', status: 'queried' }),
      makeTarget({ id: 't2', name: 'Big House', type: 'publisher', status: 'rejected' }),
      makeTarget({ id: 't3', name: 'Offerer', status: 'offer' }),
    ]);

    expect(await screen.findByText(/3 targets/)).toBeInTheDocument();
    expect(screen.getByText(/1 queried/)).toBeInTheDocument();
    expect(screen.getByText(/1 offers/)).toBeInTheDocument();
    expect(screen.getByText(/1 rejected/)).toBeInTheDocument();
  });

  it('filters targets and clears filters again', async () => {
    renderView([
      makeTarget({ id: 't1', name: 'Email Agent', method: 'email' }),
      makeTarget({ id: 't2', name: 'Form Agent', method: 'form' }),
    ]);
    await screen.findByText('Email Agent');

    // FilterBar's method select is the first combobox on the page
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'form' } });
    expect(screen.queryByText('Email Agent')).not.toBeInTheDocument();
    expect(screen.getByText('Form Agent')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear (1)' }));
    expect(screen.getByText('Email Agent')).toBeInTheDocument();
  });

  it('adds a target through the form', async () => {
    const created = makeTarget({ id: 't9', name: 'New Agent' });
    // addTarget reloads the tracker afterwards — serve the new target then
    const loadTracker = vi
      .fn<() => Promise<QueryTracker>>()
      .mockResolvedValueOnce(makeTracker([]))
      .mockResolvedValue(makeTracker([created]));
    const { bridge } = renderView([], {
      query: {
        loadTracker,
        addTarget: vi.fn(async () => created),
      },
    });
    await screen.findByText(/No submission targets yet/);

    fireEvent.click(screen.getByRole('button', { name: '+ Add Target' }));
    fireEvent.change(screen.getByPlaceholderText('Agent / Publisher name'), {
      target: { value: 'New Agent' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Target' }));

    await waitFor(() =>
      expect(bridge.query.addTarget).toHaveBeenCalledWith(
        'test-book',
        expect.objectContaining({ name: 'New Agent', type: 'agent', method: 'email' }),
      ),
    );
    expect(await screen.findByText('New Agent')).toBeInTheDocument();
  });

  it('runs target research and reports the outcome', async () => {
    const research = vi.fn(async () => ({
      addedTargets: 2,
      targetNames: ['A', 'B'],
      conversationId: 'conv-r',
    }));
    const { bridge } = renderView([], {
      query: {
        loadTracker: vi.fn(async () => makeTracker([])),
        researchTargets: research,
      },
    });
    await screen.findByText(/No submission targets yet/);

    fireEvent.click(screen.getByRole('button', { name: 'Research Targets' }));

    await waitFor(() => expect(bridge.query.researchTargets).toHaveBeenCalledWith('test-book'));
    expect(await screen.findByText(/Research complete — added 2 targets/)).toBeInTheDocument();
    expect(screen.getByText(/: A, B/)).toBeInTheDocument();
  });
});
