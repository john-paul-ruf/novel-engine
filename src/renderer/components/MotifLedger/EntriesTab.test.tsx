import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { MotifEntry } from '@domain/types';
import { EntriesTab } from './EntriesTab';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeMotifLedger } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useMotifLedgerStore);

function entry(id: string, character: string, phrase: string, systemId: string | null = null): MotifEntry {
  return {
    id,
    character,
    phrase,
    description: '',
    systemId,
    firstAppearance: 'Ch 1',
    occurrences: ['Ch 1', 'Ch 4'],
    notes: '',
  };
}

const LEDGER = makeMotifLedger({
  systems: [{ id: 'sys1', name: 'Teeth', description: '', components: [], arcTrajectory: '' }],
  entries: [entry('e1', 'Kael', 'Teeth clicking', 'sys1'), entry('e2', 'Maren', 'Cold hands')],
});

function renderTab(ledger = LEDGER) {
  return renderApp(<EntriesTab />, { stores: [[useMotifLedgerStore, { ledger }]] });
}

describe('EntriesTab', () => {
  it('shows the empty state', () => {
    renderTab(makeMotifLedger());
    expect(screen.getByText('No entries yet.')).toBeInTheDocument();
  });

  it('renders entries with character, system tag, and occurrences', () => {
    renderTab();

    expect(screen.getByText('Teeth clicking')).toBeInTheDocument();
    // Character appears in the badge and the character-filter option
    expect(screen.getAllByText('Kael').length).toBeGreaterThan(0);
    // Resolved system name (badge + filter option)
    expect(screen.getAllByText('Teeth').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Occurs: Ch 1, Ch 4')).toHaveLength(2);
  });

  it('filters by character and by unassigned system', () => {
    renderTab();

    const [characterFilter, systemFilter] = screen.getAllByRole('combobox');
    fireEvent.change(characterFilter, { target: { value: 'Kael' } });
    expect(screen.queryByText('Cold hands')).not.toBeInTheDocument();

    fireEvent.change(characterFilter, { target: { value: '' } });
    fireEvent.change(systemFilter, { target: { value: '__none__' } });
    expect(screen.getByText('Cold hands')).toBeInTheDocument();
    expect(screen.queryByText('Teeth clicking')).not.toBeInTheDocument();
  });

  it('adds an entry requiring character and phrase', () => {
    renderTab(makeMotifLedger());

    fireEvent.click(screen.getByRole('button', { name: '+ Add Entry' }));
    // Missing phrase — nothing added
    fireEvent.change(screen.getByPlaceholderText('e.g. Kael'), { target: { value: 'Pell' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(useMotifLedgerStore.getState().ledger?.entries).toHaveLength(0);

    fireEvent.change(screen.getByPlaceholderText('e.g. Teeth clicking'), {
      target: { value: 'Whistles off-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(useMotifLedgerStore.getState().ledger?.entries[0]).toMatchObject({
      character: 'Pell',
      phrase: 'Whistles off-key',
    });
    expect(screen.getByText('Whistles off-key')).toBeInTheDocument();
  });

  it('deletes an entry', () => {
    renderTab();

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    expect(useMotifLedgerStore.getState().ledger?.entries.map((e) => e.id)).toEqual(['e2']);
  });
});
