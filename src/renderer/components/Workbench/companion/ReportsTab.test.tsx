import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { ReportsTab } from './ReportsTab';
import { useBookStore } from '../../../stores/bookStore';
import { useFileChangeStore } from '../../../stores/fileChangeStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { renderApp } from '../../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../../test/resetStores';

resetStoresBeforeEach(useBookStore, useFileChangeStore, useWorkspaceStore);

function renderReports(
  existing: Record<string, string>,
  {
    request = null,
    selectedPhaseId = null,
  }: {
    request?: Parameters<typeof ReportsTab>[0]['request'];
    selectedPhaseId?: string | null;
  } = {},
) {
  return renderApp(<ReportsTab request={request} />, {
    stores: [
      [useBookStore, { activeSlug: 'book-a' }],
      [useWorkspaceStore, { selectedPhaseId }],
    ],
    bridge: {
      files: {
        exists: vi.fn(async (_slug: string, path: string) => path in existing),
        read: vi.fn(async (_slug: string, path: string) => {
          const content = existing[path];
          if (content === undefined) throw new Error('ENOENT');
          return content;
        }),
      },
    },
  });
}

describe('ReportsTab', () => {
  it('lists reports grouped by agent, marking missing ones as not generated', async () => {
    renderReports({ 'source/reader-report.md': 'Loved the opening chapter.' });

    // Agent group headers
    for (const agent of ['Ghostlight', 'Lumen', 'Sable', 'Forge']) {
      expect(screen.getByText(agent)).toBeInTheDocument();
    }

    // Existing report becomes a button with its word count
    const readerReport = await screen.findByRole('button', { name: /Reader Report/ });
    expect(readerReport).toHaveTextContent('4w');

    // Missing reports are inert placeholders
    expect(screen.getAllByText('Not yet generated').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Dev Report/ })).toBeNull();
  });

  it('opens a report in the viewer and navigates back to the list', async () => {
    renderReports({ 'source/reader-report.md': 'Loved the opening chapter.' });

    fireEvent.click(await screen.findByRole('button', { name: /Reader Report/ }));

    expect(await screen.findByText('Loved the opening chapter.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Reports/ }));
    expect(screen.getByText('Ghostlight')).toBeInTheDocument(); // back on the list
  });

  it("preselects the selected phase's report", async () => {
    renderReports(
      { 'source/dev-report.md': 'Structure is sound.' },
      { selectedPhaseId: 'first-assessment' },
    );

    // Viewer opens directly on Lumen's dev report
    expect(await screen.findByText('Structure is sound.')).toBeInTheDocument();
    expect(screen.getByText('Dev Report')).toBeInTheDocument();
  });

  it('shows the not-generated placeholder for a missing preselected report', async () => {
    renderReports({}, { selectedPhaseId: 'copy-edit' });

    expect(await screen.findByText('Audit Report — not yet generated.')).toBeInTheDocument();
  });

  it('honours a companion doc request from the phase header', async () => {
    renderReports(
      { 'source/style-sheet.md': 'Names and hyphens.' },
      { request: { tab: 'reports', path: 'source/style-sheet.md', nonce: 1 } },
    );

    expect(await screen.findByText('Names and hyphens.')).toBeInTheDocument();
    expect(screen.getByText('Style Sheet')).toBeInTheDocument();
  });
});
