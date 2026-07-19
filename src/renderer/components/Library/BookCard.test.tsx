import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { PipelinePhase, PipelinePhaseId, PhaseStatus } from '@domain/types';
import { BookCard } from './BookCard';
import { usePipelineStore } from '../../stores/pipelineStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeBookSummary } from '../../../test/novelEngineMock';

resetStoresBeforeEach(usePipelineStore);

function phase(id: string, status: PhaseStatus): PipelinePhase {
  return { id: id as PipelinePhaseId, label: id, agent: null, status, description: '' };
}

function renderCard(
  opts: {
    cache?: { phases: PipelinePhase[]; activePhase: PipelinePhase | null };
    volumeNumber?: number;
  } = {},
) {
  const book = makeBookSummary({ slug: 'test-book', title: 'Test Book', wordCount: 12345 });
  const handlers = {
    onSelect: vi.fn(),
    onChangeCover: vi.fn(),
    onInfo: vi.fn(),
    onArchive: vi.fn(),
  };
  const utils = renderApp(
    <BookCard book={book} volumeNumber={opts.volumeNumber} coverTimestamp={1} {...handlers} />,
    {
      stores: opts.cache ? [[usePipelineStore, { cache: { 'test-book': opts.cache } }]] : [],
    },
  );
  return { ...utils, handlers };
}

describe('BookCard', () => {
  it('renders title, status chip, and word count; no phase text without cache', () => {
    renderCard();

    expect(screen.getByText('Test Book')).toBeInTheDocument();
    expect(screen.getByText('first-draft')).toBeInTheDocument();
    expect(screen.getByText('12,345 words')).toBeInTheDocument();
    expect(screen.queryByText(/Phase \d/)).not.toBeInTheDocument();
    expect(screen.getByText('Resume →')).toBeInTheDocument();
  });

  it('derives the phase position from the pipeline cache', () => {
    renderCard({
      cache: {
        phases: [phase('pitch', 'complete'), phase('outline', 'active'), phase('draft', 'locked')],
        activePhase: phase('outline', 'active'),
      },
    });

    expect(screen.getByText('Phase 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Resume →')).toBeInTheDocument();
  });

  it('shows Open and the final phase when every phase is complete', () => {
    renderCard({
      cache: {
        phases: [phase('pitch', 'complete'), phase('outline', 'complete')],
        activePhase: null,
      },
    });

    expect(screen.getByText('Phase 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Open →')).toBeInTheDocument();
  });

  it('shows the volume number when provided', () => {
    renderCard({ volumeNumber: 3 });
    expect(screen.getByText('Vol. 3')).toBeInTheDocument();
  });

  it('selects on card click and on Enter', () => {
    const { handlers } = renderCard();
    const card = screen.getByRole('button', { name: /Test Book/ });

    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(handlers.onSelect).toHaveBeenCalledTimes(2);
  });

  it('cover click requests a cover change without selecting the book', () => {
    const { handlers } = renderCard();

    fireEvent.click(screen.getByTitle('Change cover'));

    expect(handlers.onChangeCover).toHaveBeenCalledTimes(1);
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it('overflow menu routes Book info and Archive without selecting', () => {
    const { handlers } = renderCard();

    fireEvent.click(screen.getByTitle('Book actions'));
    fireEvent.click(screen.getByText('Book info'));
    expect(handlers.onInfo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle('Book actions'));
    fireEvent.click(screen.getByText('Archive'));
    expect(handlers.onArchive).toHaveBeenCalledTimes(1);
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });
});
