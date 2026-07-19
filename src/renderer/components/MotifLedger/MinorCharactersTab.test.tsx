import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { MinorCharactersTab } from './MinorCharactersTab';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeMotifLedger } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useMotifLedgerStore);

const MINOR = { id: 'm1', character: 'Fen', motifs: 'Always counting coins', notes: '' };

function renderTab(minorCharacters = [MINOR]) {
  return renderApp(<MinorCharactersTab />, {
    stores: [[useMotifLedgerStore, { ledger: makeMotifLedger({ minorCharacters }) }]],
  });
}

describe('MinorCharactersTab', () => {
  it('shows the empty state', () => {
    renderTab([]);
    expect(screen.getByText('No minor characters tracked yet.')).toBeInTheDocument();
  });

  it('renders tracked characters with their motifs', () => {
    renderTab();
    expect(screen.getByText('Fen')).toBeInTheDocument();
    expect(screen.getByText('Always counting coins')).toBeInTheDocument();
  });

  it('adds a character through the draft form', () => {
    renderTab([]);

    fireEvent.click(screen.getByRole('button', { name: '+ Add Character' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Fen, Thessen, Pell'), {
      target: { value: 'Thessen' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(useMotifLedgerStore.getState().ledger?.minorCharacters[0]).toMatchObject({
      character: 'Thessen',
    });
  });
});
