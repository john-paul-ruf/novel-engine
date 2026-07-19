import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { FileDiff, FileVersion, FileVersionSummary } from '@domain/types';
import { UserEditsDiffModal } from './UserEditsDiffModal';
import { renderApp } from '../../../test/renderWithState';

function makeVersionSummary(overrides: Partial<FileVersionSummary> = {}): FileVersionSummary {
  return {
    id: 7,
    bookSlug: 'book-a',
    filePath: 'chapters/02-the-burger/draft.md',
    contentHash: 'abc123',
    byteSize: 100,
    source: 'agent',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeDiff(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    oldVersion: makeVersionSummary(),
    newVersion: makeVersionSummary({ id: 8, source: 'user' }),
    hunks: [
      {
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 1,
        lines: [
          { type: 'remove', content: 'He ate the burger.', oldLineNumber: 1 },
          { type: 'add', content: 'He devoured the burger.', newLineNumber: 1 },
        ],
      },
    ],
    totalAdditions: 1,
    totalDeletions: 1,
    ...overrides,
  };
}

function renderModal(
  getUserEdits: () => Promise<FileDiff | null>,
  revert?: () => Promise<FileVersion>,
) {
  const onClose = vi.fn();
  const onReverted = vi.fn();
  const utils = renderApp(
    <UserEditsDiffModal
      bookSlug="book-a"
      filePath="chapters/02-the-burger/draft.md"
      chapterTitle="The Burger"
      onClose={onClose}
      onReverted={onReverted}
    />,
    {
      bridge: {
        versions: {
          getUserEdits: vi.fn(getUserEdits),
          ...(revert ? { revert: vi.fn(revert) } : {}),
        },
      },
    },
  );
  return { ...utils, onClose, onReverted };
}

describe('UserEditsDiffModal', () => {
  it('shows the no-edits message when there is no pending diff', async () => {
    renderModal(async () => null);

    expect(screen.getByText('My changes — The Burger')).toBeInTheDocument();
    expect(
      await screen.findByText("No edits since Verity's last draft."),
    ).toBeInTheDocument();
    // No discard affordance without a diff
    expect(screen.queryByText('Discard my edits')).toBeNull();
  });

  it('renders the diff with summary counts and hunk lines', async () => {
    renderModal(async () => makeDiff());

    expect(await screen.findByText('+1 addition')).toBeInTheDocument();
    expect(screen.getByText('-1 deletion')).toBeInTheDocument();
    expect(screen.getByText('He ate the burger.')).toBeInTheDocument();
    expect(screen.getByText('He devoured the burger.')).toBeInTheDocument();
  });

  it('discards edits via a confirm step, reverting to the agent baseline', async () => {
    const revert = vi.fn(async () => ({ ...makeVersionSummary({ id: 9 }), content: '' }));
    const { bridge, onClose, onReverted } = renderModal(async () => makeDiff(), revert);

    fireEvent.click(await screen.findByText('Discard my edits'));
    expect(screen.getByText(/Really discard\?/)).toBeInTheDocument();
    expect(bridge.versions.revert).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(bridge.versions.revert).toHaveBeenCalledWith(
        'book-a',
        'chapters/02-the-burger/draft.md',
        7, // oldVersion.id — the agent baseline
      ),
    );
    expect(onReverted).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('disables discarding when there is no agent baseline', async () => {
    renderModal(async () => makeDiff({ oldVersion: null }));

    expect(await screen.findByText('Discard my edits')).toBeDisabled();
  });

  it('surfaces load errors', async () => {
    renderModal(async () => {
      throw new Error('versions table missing');
    });

    expect(await screen.findByText('versions table missing')).toBeInTheDocument();
  });

  it('closes on Escape and backdrop click', async () => {
    const { onClose, container } = renderModal(async () => null);
    await screen.findByText("No edits since Verity's last draft.");

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
