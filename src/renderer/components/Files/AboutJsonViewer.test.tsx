import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { AboutJsonViewer } from './AboutJsonViewer';
import { useBookStore } from '../../stores/bookStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeBookMeta } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useBookStore);

const ABOUT = {
  title: 'Test Book',
  author: 'Test Author',
  status: 'first-draft',
  created: '2026-01-05T00:00:00.000Z',
  coverImage: '',
  targetAudience: 'Adult readers',
  themes: ['hunger', 'ambition'],
};

function renderViewer(raw: string = JSON.stringify(ABOUT)) {
  const onEdit = vi.fn();
  const onOpenSpark = vi.fn();
  const utils = renderApp(
    <AboutJsonViewer bookSlug="test-book" onEdit={onEdit} onOpenSpark={onOpenSpark} />,
    {
      bridge: {
        files: { read: vi.fn(async () => raw) },
      },
    },
  );
  return { ...utils, onEdit, onOpenSpark };
}

describe('AboutJsonViewer', () => {
  it('renders the structured card with title, author, status, and created date', async () => {
    renderViewer();

    expect(await screen.findByText('Test Book')).toBeInTheDocument();
    expect(screen.getByText('Test Author')).toBeInTheDocument();
    expect(screen.getByText('first-draft')).toBeInTheDocument();
    // Rendered in the local timezone — Jan 4 or 5 depending on UTC offset
    expect(screen.getByText(/Created January [45], 2026/)).toBeInTheDocument();
    expect(screen.getByText('test-book')).toBeInTheDocument(); // read-only slug
  });

  it('renders unknown fields generically with humanised keys', async () => {
    renderViewer();

    expect(await screen.findByText('Target Audience')).toBeInTheDocument();
    expect(screen.getByText('Adult readers')).toBeInTheDocument();
    // Arrays collapse into a details block
    expect(screen.getByText('[2 items]')).toBeInTheDocument();
  });

  it('shows the upload affordance when there is no cover', async () => {
    const { bridge } = renderViewer();

    const upload = await screen.findByRole('button', { name: /Upload Cover/ });
    fireEvent.click(upload);

    await waitFor(() => expect(bridge.books.uploadCover).toHaveBeenCalledWith('test-book'));
  });

  it('saves an inline title edit through books.updateMeta', async () => {
    const { bridge } = renderViewer();
    bridge.books.updateMeta.mockResolvedValue(makeBookMeta({ slug: 'test-book' }));

    fireEvent.click(await screen.findByText('Test Book'));
    const input = screen.getByPlaceholderText('Book Title');
    fireEvent.change(input, { target: { value: 'Renamed Book' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(bridge.books.updateMeta).toHaveBeenCalledWith('test-book', {
        title: 'Renamed Book',
      }),
    );
  });

  it('changes the status through the dropdown', async () => {
    const { bridge } = renderViewer();
    bridge.books.updateMeta.mockResolvedValue(makeBookMeta({ slug: 'test-book' }));

    fireEvent.click(await screen.findByText('first-draft'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'revision-1' } });

    await waitFor(() =>
      expect(bridge.books.updateMeta).toHaveBeenCalledWith('test-book', {
        status: 'revision-1',
      }),
    );
  });

  it('wires the Edit JSON and Chat with Spark actions', async () => {
    const { onEdit, onOpenSpark } = renderViewer();
    await screen.findByText('Test Book');

    fireEvent.click(screen.getByRole('button', { name: 'Edit JSON' }));
    expect(onEdit).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Chat with Spark/ }));
    expect(onOpenSpark).toHaveBeenCalled();
  });

  it('reports unparseable about.json', async () => {
    renderViewer('{not json');
    expect(await screen.findByText('Failed to parse about.json')).toBeInTheDocument();
  });

  it('surfaces read errors', async () => {
    renderApp(
      <AboutJsonViewer bookSlug="test-book" onEdit={vi.fn()} onOpenSpark={vi.fn()} />,
      {
        bridge: {
          files: {
            read: vi.fn(async () => {
              throw new Error('ENOENT: about.json missing');
            }),
          },
        },
      },
    );

    expect(await screen.findByText('ENOENT: about.json missing')).toBeInTheDocument();
  });
});
