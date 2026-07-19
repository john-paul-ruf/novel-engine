import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { AuditLogTab } from './AuditLogTab';
import { useMotifLedgerStore } from '../../stores/motifLedgerStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeMotifLedger } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useMotifLedgerStore);

const RECORD = {
  id: 'r1',
  chapterSlug: '03-the-descent',
  auditedAt: '2026-07-01T00:00:00.000Z',
  entriesAdded: 2,
  entriesUpdated: 1,
  notes: 'Found new teeth motif',
};

function renderTab(auditLog = [RECORD], unauditedChapters: string[] = []) {
  return renderApp(<AuditLogTab />, {
    stores: [[useMotifLedgerStore, { ledger: makeMotifLedger({ auditLog }), unauditedChapters }]],
  });
}

describe('AuditLogTab', () => {
  it('shows the empty state', () => {
    renderTab([]);
    expect(screen.getByText('No audits recorded yet.')).toBeInTheDocument();
  });

  it('renders audit records with counts and notes', () => {
    renderTab();

    expect(screen.getByText('03-the-descent')).toBeInTheDocument();
    expect(screen.getByText('+2 added')).toBeInTheDocument();
    expect(screen.getByText('~1 updated')).toBeInTheDocument();
    expect(screen.getByText('Found new teeth motif')).toBeInTheDocument();
  });

  it('warns about unaudited chapters and offers them in the log form', () => {
    renderTab([], ['04-the-climb']);

    expect(screen.getByText('1 chapter not yet audited:')).toBeInTheDocument();
    expect(screen.getByText('04-the-climb')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+ Log Audit' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '04-the-climb' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log' }));

    expect(useMotifLedgerStore.getState().ledger?.auditLog[0]).toMatchObject({
      chapterSlug: '04-the-climb',
    });
  });
});
