import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FileDiff, FileVersionSummary } from '@domain/types';
import { DiffViewer } from './DiffViewer';

function versionSummary(id: number): FileVersionSummary {
  return {
    id,
    bookSlug: 'book-a',
    filePath: 'source/pitch.md',
    contentHash: `hash-${id}`,
    byteSize: 10,
    source: 'agent',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeDiff(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    oldVersion: versionSummary(1),
    newVersion: versionSummary(2),
    hunks: [
      {
        oldStart: 3,
        oldLines: 2,
        newStart: 3,
        newLines: 3,
        lines: [
          { type: 'context', content: 'unchanged line', oldLineNumber: 3, newLineNumber: 3 },
          { type: 'remove', content: 'old line', oldLineNumber: 4 },
          { type: 'add', content: 'new line one', newLineNumber: 4 },
          { type: 'add', content: 'new line two', newLineNumber: 5 },
        ],
      },
    ],
    totalAdditions: 2,
    totalDeletions: 1,
    ...overrides,
  };
}

describe('DiffViewer', () => {
  it('shows the empty state when there are no hunks', () => {
    render(
      <DiffViewer diff={makeDiff({ hunks: [], totalAdditions: 0, totalDeletions: 0 })} />,
    );
    expect(screen.getByText('No differences found')).toBeInTheDocument();
  });

  it('summarises additions and deletions with pluralisation', () => {
    render(<DiffViewer diff={makeDiff()} />);
    expect(screen.getByText('+2 additions')).toBeInTheDocument();
    expect(screen.getByText('-1 deletion')).toBeInTheDocument();
  });

  it('shows a No changes summary for pure-context hunks', () => {
    render(<DiffViewer diff={makeDiff({ totalAdditions: 0, totalDeletions: 0 })} />);
    expect(screen.getByText('No changes')).toBeInTheDocument();
  });

  it('renders the hunk header with old/new ranges', () => {
    render(<DiffViewer diff={makeDiff()} />);
    expect(screen.getByText('@@ -3,2 +3,3 @@')).toBeInTheDocument();
  });

  it('renders each line with its prefix and line numbers', () => {
    render(<DiffViewer diff={makeDiff()} />);

    expect(screen.getByText('unchanged line')).toBeInTheDocument();
    expect(screen.getByText('old line')).toBeInTheDocument();
    expect(screen.getByText('new line one')).toBeInTheDocument();
    expect(screen.getByText('new line two')).toBeInTheDocument();

    // 2 additions with '+', 1 removal with '-'
    expect(screen.getAllByText('+')).toHaveLength(2);
    expect(screen.getAllByText('-')).toHaveLength(1);
  });
});
