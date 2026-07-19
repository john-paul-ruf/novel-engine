import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { VersionHistoryModal } from './VersionHistoryModal';
import { useVersionStore } from '../../stores/versionStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useVersionStore);

const PATH = 'chapters/01-intro/draft.md';

describe('VersionHistoryModal', () => {
  it('renders the version history panel for the given file and loads its history', async () => {
    const { bridge } = renderApp(
      <VersionHistoryModal bookSlug="my-book" filePath={PATH} onClose={vi.fn()} />,
    );

    expect(screen.getByText('Version History')).toBeInTheDocument();
    expect(screen.getByText('draft.md')).toBeInTheDocument();
    expect(await screen.findByText('No version history yet.')).toBeInTheDocument();
    expect(bridge.versions.getHistory).toHaveBeenCalledWith('my-book', PATH, expect.any(Number), 0);
    expect(bridge.versions.getCount).toHaveBeenCalledWith('my-book', PATH);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderApp(<VersionHistoryModal bookSlug="my-book" filePath={PATH} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click but not on inner content click', () => {
    const onClose = vi.fn();
    const { container } = renderApp(
      <VersionHistoryModal bookSlug="my-book" filePath={PATH} onClose={onClose} />,
    );

    fireEvent.click(screen.getByText('Version History'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(container.firstElementChild as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
