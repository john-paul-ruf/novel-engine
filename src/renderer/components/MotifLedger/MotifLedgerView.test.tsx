import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MotifLedgerView } from './MotifLedgerView';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';
import { useBookStore } from '../../stores/bookStore';
import { renderApp, type StoreSeed } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import {
  makeBookSummary,
  makeMotifLedger,
  type BridgeOverrides,
} from '../../../test/novelEngineMock';

resetStoresBeforeEach(useMotifLedgerStore, useBookStore);

const LEDGER = makeMotifLedger({
  systems: [
    { id: 's1', name: 'Teeth', description: '', components: [], arcTrajectory: '' },
  ],
  entries: [
    {
      id: 'e1',
      character: 'Kael',
      phrase: 'Teeth clicking',
      description: '',
      systemId: 's1',
      firstAppearance: 'Ch 3',
      occurrences: [],
      notes: '',
    },
  ],
});

function renderView(bridge: BridgeOverrides = {}, stores: StoreSeed = []) {
  return renderApp(<MotifLedgerView />, {
    bridge: {
      motifLedger: { load: vi.fn(async () => LEDGER), ...bridge.motifLedger },
      ...bridge,
    },
    stores: [
      [
        useBookStore,
        {
          activeSlug: 'test-book',
          books: [makeBookSummary({ slug: 'test-book', title: 'Test Book' })],
        },
      ],
      ...stores,
    ],
  });
}

describe('MotifLedgerView', () => {
  it('asks for a book when none is active', () => {
    renderApp(<MotifLedgerView />);
    expect(screen.getByText('Select a book to view its motif ledger.')).toBeInTheDocument();
  });

  it('loads the ledger and shows tabs with counts', async () => {
    const { bridge } = renderView();

    await waitFor(() => expect(bridge.motifLedger.load).toHaveBeenCalledWith('test-book'));
    expect(screen.getByText('Motif Ledger')).toBeInTheDocument();
    // Systems tab is the default and lists the seeded system
    expect(await screen.findByText('Teeth')).toBeInTheDocument();
    // Count badges on Systems and Entries tabs
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(2);
  });

  it('switches tabs', async () => {
    renderView();
    await screen.findByText('Teeth');

    fireEvent.click(screen.getByRole('button', { name: /Entries/ }));
    expect(screen.getByText('Teeth clicking')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Audit Log/ }));
    expect(screen.getByText('No audits recorded yet.')).toBeInTheDocument();
  });

  it('shows the unsaved marker and saves via the bridge', async () => {
    const { bridge } = renderView();
    await screen.findByText('Teeth');

    act(() => {
      useMotifLedgerStore.getState().addSystem({
        id: 's2',
        name: 'Cold',
        description: '',
        components: [],
        arcTrajectory: '',
      });
    });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(bridge.motifLedger.save).toHaveBeenCalledWith(
        'test-book',
        expect.objectContaining({ systems: expect.arrayContaining([expect.objectContaining({ id: 's2' })]) }),
      ),
    );
  });

  it('shows the normalizing state while the AI converts the ledger', async () => {
    const { bridge } = renderView();
    await screen.findByText('Teeth');

    act(() => {
      bridge.emit('motifLedger:normalizing', 'started');
    });
    expect(screen.getByText('Normalizing ledger format via AI...')).toBeInTheDocument();

    act(() => {
      bridge.emit('motifLedger:normalizing', 'done');
    });
    expect(screen.queryByText('Normalizing ledger format via AI...')).not.toBeInTheDocument();
  });
});
