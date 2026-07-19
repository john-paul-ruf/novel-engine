import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { ForeshadowEntry, ForeshadowStatus } from '@domain/types';
import { ForeshadowTab } from './ForeshadowTab';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeMotifLedger } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useMotifLedgerStore);

function thread(id: string, description: string, status: ForeshadowStatus): ForeshadowEntry {
  return {
    id,
    description,
    plantedIn: 'Ch 5',
    expectedPayoff: 'The parallel lands',
    expectedPayoffIn: 'Ch 20',
    status,
    notes: '',
  };
}

function renderTab(foreshadows: ForeshadowEntry[]) {
  return renderApp(<ForeshadowTab />, {
    stores: [[useMotifLedgerStore, { ledger: makeMotifLedger({ foreshadows }) }]],
  });
}

describe('ForeshadowTab', () => {
  it('shows the empty state', () => {
    renderTab([]);
    expect(screen.getByText('No foreshadow threads registered yet.')).toBeInTheDocument();
  });

  it('buckets threads by status with counts', () => {
    renderTab([
      thread('f1', 'The consumed woman', 'planted'),
      thread('f2', 'The broken crown', 'paid-off'),
      thread('f3', 'The old map', 'abandoned'),
    ]);

    expect(screen.getByText('Planted (1)')).toBeInTheDocument();
    expect(screen.getByText('Paid Off (1)')).toBeInTheDocument();
    expect(screen.getByText('Abandoned (1)')).toBeInTheDocument();
    expect(screen.getByText('The consumed woman')).toBeInTheDocument();
    expect(screen.getAllByText('Planted: Ch 5')).toHaveLength(3);
  });

  it('adds a thread requiring a description', () => {
    renderTab([]);

    fireEvent.click(screen.getByRole('button', { name: '+ Add Thread' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(useMotifLedgerStore.getState().ledger?.foreshadows).toHaveLength(0);

    fireEvent.change(screen.getByPlaceholderText(/preview/), {
      target: { value: 'A new debt' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(useMotifLedgerStore.getState().ledger?.foreshadows[0]).toMatchObject({
      description: 'A new debt',
      status: 'planted',
    });
  });
});
