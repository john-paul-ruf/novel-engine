import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { SourcesTab } from './SourcesTab';
import { useBookStore } from '../../../stores/bookStore';
import { useFileChangeStore } from '../../../stores/fileChangeStore';
import { renderApp } from '../../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../../test/resetStores';

resetStoresBeforeEach(useBookStore, useFileChangeStore);

function renderSources(
  existing: Record<string, string>,
  request: Parameters<typeof SourcesTab>[0]['request'] = null,
) {
  return renderApp(<SourcesTab request={request} />, {
    stores: [[useBookStore, { activeSlug: 'book-a' }]],
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

describe('SourcesTab', () => {
  it('shows the empty state without an active book', () => {
    renderApp(<SourcesTab request={null} />);
    expect(screen.getByText('No source documents yet.')).toBeInTheDocument();
  });

  it('auto-selects the first existing doc and renders it with a word-count chip', async () => {
    renderSources({ 'source/scene-outline.md': 'Act one act two act three' });

    expect(await screen.findByText('Act one act two act three')).toBeInTheDocument();

    const outlineChip = screen.getByRole('button', { name: 'Scene Outline' });
    expect(outlineChip).toHaveAttribute(
      'title',
      'Scene-by-scene story structure · 6 words',
    );
    // Missing docs advertise their absence
    expect(screen.getByRole('button', { name: 'Pitch' })).toHaveAttribute(
      'title',
      'The core story concept — not created yet',
    );
    // History affordance appears for an existing selection
    expect(screen.getByRole('button', { name: /History/ })).toBeInTheDocument();
  });

  it('shows the not-created placeholder when a missing doc is selected', async () => {
    renderSources({ 'source/pitch.md': 'A pitch.' });
    await screen.findByText('A pitch.');

    fireEvent.click(screen.getByRole('button', { name: 'Story Bible' }));

    expect(screen.getByText('Story Bible — not created yet')).toBeInTheDocument();
    expect(
      screen.getByText('Characters, world, and lore. It appears here once written.'),
    ).toBeInTheDocument();
  });

  it('points the missing voice profile at the command palette', async () => {
    renderSources({ 'source/pitch.md': 'A pitch.' });
    await screen.findByText('A pitch.');

    fireEvent.click(screen.getByRole('button', { name: 'Voice Profile' }));

    expect(
      screen.getByText('Set up your voice profile from the command palette (⌘K).'),
    ).toBeInTheDocument();
  });

  it('honours a companion doc request from the phase header', async () => {
    renderSources(
      {
        'source/pitch.md': 'A pitch.',
        'source/story-bible.md': 'Bible content here.',
      },
      { tab: 'sources', path: 'source/story-bible.md', nonce: 1 },
    );

    expect(await screen.findByText('Bible content here.')).toBeInTheDocument();
  });
});
