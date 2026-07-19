import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { StructuralTab } from './StructuralTab';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeMotifLedger } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useMotifLedgerStore);

const DEVICE = {
  id: 'd1',
  name: 'Countdown',
  deviceType: 'chapter-opener',
  description: 'Days remaining',
  pattern: 'Opens each chapter',
  chapters: ['01-a', '02-b'],
  notes: '',
};

function renderTab(devices = [DEVICE]) {
  return renderApp(<StructuralTab />, {
    stores: [[useMotifLedgerStore, { ledger: makeMotifLedger({ structuralDevices: devices }) }]],
  });
}

describe('StructuralTab', () => {
  it('shows the empty state', () => {
    renderTab([]);
    expect(screen.getByText('No structural devices defined yet.')).toBeInTheDocument();
  });

  it('renders devices with their pattern', () => {
    renderTab();
    expect(screen.getByText('Countdown')).toBeInTheDocument();
    expect(screen.getByText(/Opens each chapter/)).toBeInTheDocument();
  });

  it('adds a device via the draft form', () => {
    renderTab([]);

    fireEvent.click(screen.getByRole('button', { name: '+ Add Device' }));
    fireEvent.change(screen.getByPlaceholderText(/Days to Thaen Mor countdown/), {
      target: { value: 'Refrain' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(useMotifLedgerStore.getState().ledger?.structuralDevices[0]).toMatchObject({
      name: 'Refrain',
    });
    expect(screen.getByText('Refrain')).toBeInTheDocument();
  });
});
