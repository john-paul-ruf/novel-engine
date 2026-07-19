import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { LetterPreview } from './LetterPreview';
import { useQueryStore } from '../../stores/queryStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useQueryStore);

function renderPreview() {
  const onClose = vi.fn();
  const utils = renderApp(
    <LetterPreview bookSlug="test-book" targetSlug="jane-agent" onClose={onClose} />,
    { bridge: { query: { readLetter: vi.fn(async () => 'Dear Jane, my novel…') } } },
  );
  return { ...utils, onClose };
}

describe('LetterPreview', () => {
  it('loads and displays the letter content', async () => {
    renderPreview();

    expect(screen.getByText('Query Letter — jane-agent')).toBeInTheDocument();
    expect(await screen.findByText('Dear Jane, my novel…')).toBeInTheDocument();
  });

  it('edits and saves the letter', async () => {
    const { bridge } = renderPreview();
    await screen.findByText('Dear Jane, my novel…');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const textarea = screen.getByDisplayValue('Dear Jane, my novel…');
    fireEvent.change(textarea, { target: { value: 'Dear Jane, revised.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(bridge.query.saveLetter).toHaveBeenCalledWith(
        'test-book',
        'jane-agent',
        'Dear Jane, revised.',
      ),
    );
    // Back to read mode
    await waitFor(() =>
      expect(screen.queryByDisplayValue('Dear Jane, revised.')).not.toBeInTheDocument(),
    );
  });

  it('closes on backdrop click and Close button', async () => {
    const { onClose } = renderPreview();
    await screen.findByText('Dear Jane, my novel…');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
