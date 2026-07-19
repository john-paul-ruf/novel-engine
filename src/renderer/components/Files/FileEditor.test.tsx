import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { FileEditor } from './FileEditor';
import { useBookStore } from '../../stores/bookStore';
import { useVersionStore } from '../../stores/versionStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useBookStore, useVersionStore);

function renderEditor(overrides: Partial<Parameters<typeof FileEditor>[0]> = {}) {
  const onSave = vi.fn(async () => undefined);
  const onClose = vi.fn();
  const utils = renderApp(
    <FileEditor
      filePath="source/pitch.md"
      initialContent="Original pitch."
      onSave={onSave}
      onClose={onClose}
      {...overrides}
    />,
    { stores: [[useBookStore, { activeSlug: 'book-a' }]] },
  );
  return { ...utils, onSave, onClose };
}

describe('FileEditor', () => {
  it('renders the file name, content, and live word count', () => {
    renderEditor();

    expect(screen.getByText('pitch.md')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Start writing...')).toHaveValue('Original pitch.');
    expect(screen.getByText('2 words')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('marks unsaved changes and saves through onSave', async () => {
    const { onSave } = renderEditor();
    const textarea = screen.getByPlaceholderText('Start writing...');

    fireEvent.change(textarea, { target: { value: 'Edited pitch text.' } });

    expect(screen.getByTitle('Unsaved changes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Edited pitch text.'));
    expect(await screen.findByRole('button', { name: 'Saved ✓' })).toBeInTheDocument();
    expect(screen.queryByTitle('Unsaved changes')).toBeNull();
  });

  it('saves on Cmd/Ctrl+S', async () => {
    const { onSave } = renderEditor();

    fireEvent.change(screen.getByPlaceholderText('Start writing...'), {
      target: { value: 'Keyboard save.' },
    });
    fireEvent.keyDown(window, { key: 's', metaKey: true });

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Keyboard save.'));
  });

  it('toggles the markdown preview pane', () => {
    renderEditor({ initialContent: 'A **bold** word' });

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(document.querySelector('strong')).toHaveTextContent('bold');

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(document.querySelector('strong')).toBeNull();
  });

  it('locks the textarea and suppresses saves while disabled', () => {
    const { onSave } = renderEditor({ disabled: true });
    const textarea = screen.getByPlaceholderText('Start writing...');

    expect(textarea).toHaveAttribute('readonly');
    fireEvent.keyDown(window, { key: 's', metaKey: true });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('closes via Cancel', () => {
    const { onClose } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('auto-saves unsaved changes through the bridge on unmount', async () => {
    const { bridge, unmount } = renderEditor();

    fireEvent.change(screen.getByPlaceholderText('Start writing...'), {
      target: { value: 'Unsaved on unmount.' },
    });
    unmount();

    await waitFor(() =>
      expect(bridge.files.write).toHaveBeenCalledWith(
        'book-a',
        'source/pitch.md',
        'Unsaved on unmount.',
      ),
    );
  });

  it('never auto-saves on unmount while disabled', () => {
    const { bridge, unmount } = renderEditor({ disabled: true });
    unmount();
    expect(bridge.files.write).not.toHaveBeenCalled();
  });

  it('opens the version history panel', async () => {
    renderEditor();

    fireEvent.click(screen.getByTitle('Version history'));

    expect(await screen.findByText('Version History')).toBeInTheDocument();
    expect(await screen.findByText('No version history yet.')).toBeInTheDocument();
  });
});
