import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { FlaggedPhrase } from '@domain/types';
import { FlaggedPhrasesTab } from './FlaggedPhrasesTab';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeMotifLedger } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useMotifLedgerStore);

const PHRASE: FlaggedPhrase = {
  id: 'p1',
  phrase: 'a beat passed',
  category: 'crutch',
  alternatives: ['silence held'],
  limit: 3,
  limitChapters: ['Ch 1'],
  notes: '',
};

function renderTab(flaggedPhrases = [PHRASE]) {
  return renderApp(<FlaggedPhrasesTab />, {
    stores: [[useMotifLedgerStore, { ledger: makeMotifLedger({ flaggedPhrases }) }]],
  });
}

describe('FlaggedPhrasesTab', () => {
  it('shows the empty state', () => {
    renderTab([]);
    expect(screen.getByText('No flagged phrases yet.')).toBeInTheDocument();
  });

  it('renders phrases with category, alternatives, and limit', () => {
    renderTab();

    expect(screen.getByText('crutch')).toBeInTheDocument();
    expect(screen.getByText('"a beat passed"')).toBeInTheDocument();
    expect(screen.getByText('silence held')).toBeInTheDocument();
    expect(screen.getByText('Max: 3 (in Ch 1)')).toBeInTheDocument();
  });

  it('adds a flagged phrase', () => {
    renderTab([]);

    fireEvent.click(screen.getByRole('button', { name: '+ Add Phrase' }));
    fireEvent.change(screen.getByPlaceholderText(/a beat passed/), {
      target: { value: 'somehow' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(useMotifLedgerStore.getState().ledger?.flaggedPhrases[0]).toMatchObject({
      phrase: 'somehow',
    });
  });
});
