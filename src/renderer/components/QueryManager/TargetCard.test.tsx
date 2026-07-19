import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { QueryLetter, QueryTarget } from '@domain/types';
import { TargetCard } from './TargetCard';
import { useQueryStore } from '../../stores/queryStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useQueryStore);

function makeTarget(overrides: Partial<QueryTarget> = {}): QueryTarget {
  return {
    id: 't1',
    name: 'Jane Agent',
    type: 'agent',
    contact: 'jane@lit.example',
    method: 'email',
    status: 'queried',
    queryLetterPath: null,
    submittedDate: null,
    responseDate: null,
    notes: 'No exclusivity',
    link: 'https://lit.example/jane',
    personalizationNotes: 'Loves grim fantasy',
    ...overrides,
  };
}

const LETTER: QueryLetter = {
  targetName: 'Jane Agent',
  targetSlug: 'jane-agent',
  filePath: 'source/queries/jane-agent.md',
  content: 'Dear Jane…',
  generatedAt: '2026-07-01T00:00:00.000Z',
};

function renderCard(target = makeTarget(), letter: QueryLetter | null = null) {
  const onPreviewLetter = vi.fn();
  const utils = renderApp(
    <TargetCard target={target} bookSlug="test-book" letter={letter} onPreviewLetter={onPreviewLetter} />,
  );
  return { ...utils, onPreviewLetter };
}

describe('TargetCard', () => {
  it('renders target details with the status pill and profile link', () => {
    renderCard();

    expect(screen.getByText('Jane Agent')).toBeInTheDocument();
    // Status appears as the pill and as the selected option
    expect(screen.getAllByText('Queried')).toHaveLength(2);
    expect(screen.getByText('jane@lit.example')).toBeInTheDocument();
    expect(screen.getByText('Loves grim fantasy')).toBeInTheDocument();
    expect(screen.getByText('No exclusivity')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile →' })).toHaveAttribute(
      'href',
      'https://lit.example/jane',
    );
  });

  it('changes the status through the select', async () => {
    const { bridge } = renderCard();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'offer' } });

    await waitFor(() =>
      expect(bridge.query.updateTargetStatus).toHaveBeenCalledWith(
        'test-book',
        't1',
        'offer',
        undefined,
      ),
    );
  });

  it('removes the target', async () => {
    const { bridge } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(bridge.query.removeTarget).toHaveBeenCalledWith('test-book', 't1'),
    );
  });

  it('offers Generate Letter without a letter, View/Regenerate with one', () => {
    const first = renderCard();
    expect(screen.getByRole('button', { name: 'Generate Letter' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View Letter' })).not.toBeInTheDocument();
    first.unmount();

    const second = renderCard(makeTarget(), LETTER);
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Letter' }));
    expect(second.onPreviewLetter).toHaveBeenCalledWith('jane-agent');
  });

  it('AI-fill buttons request the field fill', async () => {
    const fillTargetField = vi.fn(async () => undefined);
    renderApp(
      <TargetCard
        target={makeTarget()}
        bookSlug="test-book"
        letter={null}
        onPreviewLetter={vi.fn()}
      />,
      { stores: [[useQueryStore, { fillTargetField }]] },
    );

    fireEvent.click(screen.getByTitle('AI-fill contact'));
    expect(fillTargetField).toHaveBeenCalledWith('t1', 'contact');
  });
});
