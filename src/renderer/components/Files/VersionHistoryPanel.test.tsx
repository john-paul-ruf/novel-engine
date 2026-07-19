import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { FileDiff, FileVersionSummary } from '@domain/types';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { useVersionStore } from '../../stores/versionStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useVersionStore);

function makeVersion(overrides: Partial<FileVersionSummary> = {}): FileVersionSummary {
  return {
    id: 1,
    bookSlug: 'book-a',
    filePath: 'source/pitch.md',
    contentHash: 'hash',
    byteSize: 2048,
    source: 'agent',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const VERSIONS: FileVersionSummary[] = [
  makeVersion({ id: 8, source: 'user' }),
  makeVersion({ id: 7, source: 'agent' }),
];

function makeDiff(): FileDiff {
  return {
    oldVersion: makeVersion({ id: 7 }),
    newVersion: makeVersion({ id: 8, source: 'user' }),
    hunks: [
      {
        oldStart: 1,
        oldLines: 0,
        newStart: 1,
        newLines: 1,
        lines: [{ type: 'add', content: 'A brand new line', newLineNumber: 1 }],
      },
    ],
    totalAdditions: 1,
    totalDeletions: 0,
  };
}

function renderPanel(
  overrides: {
    versions?: FileVersionSummary[];
    onReverted?: () => void;
  } = {},
) {
  const versions = overrides.versions ?? VERSIONS;
  const onClose = vi.fn();
  const utils = renderApp(
    <VersionHistoryPanel
      bookSlug="book-a"
      filePath="source/pitch.md"
      onClose={onClose}
      onReverted={overrides.onReverted}
    />,
    {
      bridge: {
        versions: {
          getHistory: vi.fn(async () => versions),
          getCount: vi.fn(async () => versions.length),
          getDiff: vi.fn(async () => makeDiff()),
          revert: vi.fn(async () => ({ ...makeVersion({ id: 9, source: 'revert' }), content: '' })),
        },
      },
    },
  );
  return { ...utils, onClose };
}

describe('VersionHistoryPanel', () => {
  it('shows the empty state when a file has no versions', async () => {
    renderPanel({ versions: [] });

    expect(screen.getByText('Version History')).toBeInTheDocument();
    expect(screen.getByText('pitch.md')).toBeInTheDocument();
    expect(await screen.findByText('No version history yet.')).toBeInTheDocument();
  });

  it('lists versions newest-first with source badges and sizes', async () => {
    renderPanel();

    expect(await screen.findByText('2 versions')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getAllByText('2.0 KB')).toHaveLength(2);
    expect(
      screen.getByText('Select a version from the timeline above to view its changes'),
    ).toBeInTheDocument();
  });

  it('selects a version and diffs it against the next-older one', async () => {
    const { bridge } = renderPanel();
    await screen.findByText('2 versions');

    fireEvent.click(screen.getByText('You')); // version 8

    await waitFor(() =>
      expect(bridge.versions.getDiff).toHaveBeenCalledWith(7, 8),
    );
    expect(await screen.findByText('A brand new line')).toBeInTheDocument();
    expect(screen.getByText('+1 addition')).toBeInTheDocument();
  });

  it('reverts through an inline confirmation and reloads history', async () => {
    const onReverted = vi.fn();
    const { bridge } = renderPanel({ onReverted });
    await screen.findByText('2 versions');

    fireEvent.click(screen.getByText('Agent')); // select version 7
    fireEvent.click(await screen.findByText('Revert to this version'));

    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(bridge.versions.revert).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Yes, revert'));

    await waitFor(() =>
      expect(bridge.versions.revert).toHaveBeenCalledWith('book-a', 'source/pitch.md', 7),
    );
    expect(onReverted).toHaveBeenCalled();
    // History reloads after the revert snapshot is created
    expect(bridge.versions.getHistory.mock.calls.length).toBeGreaterThan(1);
  });

  it('closes via the header button and resets the store on unmount', async () => {
    const { onClose, unmount } = renderPanel();
    await screen.findByText('2 versions');

    fireEvent.click(screen.getByTitle('Close history'));
    expect(onClose).toHaveBeenCalled();

    unmount();
    expect(useVersionStore.getState().versions).toEqual([]);
  });
});
