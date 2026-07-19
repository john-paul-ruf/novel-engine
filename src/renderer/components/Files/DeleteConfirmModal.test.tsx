import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeleteConfirmModal } from './DeleteConfirmModal';

function renderModal(overrides: Partial<Parameters<typeof DeleteConfirmModal>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <DeleteConfirmModal
      name="pitch.md"
      isDirectory={false}
      deleting={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { ...utils, onConfirm, onCancel };
}

describe('DeleteConfirmModal', () => {
  it('confirms a file deletion', () => {
    const { onConfirm } = renderModal();

    expect(screen.getByText('Delete file?')).toBeInTheDocument();
    expect(screen.getByText('pitch.md')).toBeInTheDocument();
    expect(screen.queryByText(/all files inside it/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('warns about recursive deletion for folders', () => {
    renderModal({ name: 'chapters', isDirectory: true });

    expect(screen.getByText('Delete folder?')).toBeInTheDocument();
    expect(screen.getByText(/This will delete all files inside it/)).toBeInTheDocument();
  });

  it('shows the optional extra warning', () => {
    renderModal({ extraWarning: 'This is a Verity-authored draft.' });
    expect(screen.getByText('This is a Verity-authored draft.')).toBeInTheDocument();
  });

  it('cancels via the button and the backdrop', () => {
    const { onCancel, container } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('shows progress and disables actions while deleting', () => {
    renderModal({ deleting: true });

    const deleteButton = screen.getByRole('button', { name: 'Deleting...' });
    expect(deleteButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
