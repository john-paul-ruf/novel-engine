import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { SystemsTab } from './SystemsTab';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeMotifLedger } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useMotifLedgerStore);

const SYSTEM = {
  id: 's1',
  name: 'The Teeth System',
  description: 'Sound and hunger',
  components: ['sound', 'touch'],
  arcTrajectory: 'From noise to silence',
};

function renderTab(systems = [SYSTEM]) {
  return renderApp(<SystemsTab />, {
    stores: [[useMotifLedgerStore, { ledger: makeMotifLedger({ systems }) }]],
  });
}

describe('SystemsTab', () => {
  it('shows the empty state', () => {
    renderTab([]);
    expect(screen.getByText('No motif systems defined yet.')).toBeInTheDocument();
  });

  it('renders systems with components and arc', () => {
    renderTab();

    expect(screen.getByText('The Teeth System')).toBeInTheDocument();
    expect(screen.getByText('sound')).toBeInTheDocument();
    expect(screen.getByText('Arc: From noise to silence')).toBeInTheDocument();
  });

  it('adds a system through the draft form', () => {
    renderTab([]);

    fireEvent.click(screen.getByRole('button', { name: '+ Add System' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. The Teeth System'), {
      target: { value: 'Cold' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const { ledger, isDirty } = useMotifLedgerStore.getState();
    expect(ledger?.systems.map((s) => s.name)).toEqual(['Cold']);
    expect(isDirty).toBe(true);
    expect(screen.getByText('Cold')).toBeInTheDocument();
  });

  it('edits and deletes a system', () => {
    renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByDisplayValue('The Teeth System'), {
      target: { value: 'Renamed System' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(screen.getByText('Renamed System')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('No motif systems defined yet.')).toBeInTheDocument();
  });
});
