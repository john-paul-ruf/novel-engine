import { describe, it, expect, beforeEach } from 'vitest';
import { render, renderHook, screen, waitFor, act } from '@testing-library/react';
import { ProseViewer, useBookFile } from './ProseViewer';
import { useFileChangeStore } from '../../stores/fileChangeStore';
import { installNovelEngineMock, type NovelEngineMock } from '../../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(useFileChangeStore);

describe('ProseViewer', () => {
  it('renders markdown as typeset HTML', () => {
    render(<ProseViewer content={'# The Title\n\nSome *emphasis* here.'} />);
    expect(screen.getByRole('heading', { level: 1, name: 'The Title' })).toBeInTheDocument();
    expect(screen.getByText('emphasis')).toBeInTheDocument();
  });

  it('renders raw mode as monospace preformatted text, unparsed', () => {
    const { container } = render(<ProseViewer content={'# not a heading'} raw />);
    const pre = container.querySelector('pre');
    expect(pre).toHaveTextContent('# not a heading');
    expect(container.querySelector('h1')).toBeNull();
  });

  it('widens the measure with the wide prop', () => {
    const { container } = render(<ProseViewer content="text" wide />);
    expect(container.firstElementChild?.className).toContain('max-w-[68ch]');
  });
});

describe('useBookFile', () => {
  let mock: NovelEngineMock;

  beforeEach(() => {
    mock = installNovelEngineMock();
  });

  it('reads the file and exposes its content', async () => {
    mock.files.read.mockResolvedValue('CONTENT');
    const { result } = renderHook(() => useBookFile('book', 'source/pitch.md'));

    await waitFor(() => expect(result.current.content).toBe('CONTENT'));
    expect(result.current).toEqual({ content: 'CONTENT', loading: false, error: null });
    expect(mock.files.read).toHaveBeenCalledWith('book', 'source/pitch.md');
  });

  it('resets to empty without reading when path is null', () => {
    const { result } = renderHook(() => useBookFile('book', null));
    expect(result.current).toEqual({ content: '', loading: false, error: null });
    expect(mock.files.read).not.toHaveBeenCalled();
  });

  it('surfaces read failures as an error message', async () => {
    mock.files.read.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useBookFile('book', 'source/pitch.md'));

    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.content).toBe('');
    expect(result.current.loading).toBe(false);
  });

  it('re-reads on file-change revision bump, keeping stale content on screen', async () => {
    mock.files.read.mockResolvedValue('V1');
    const { result } = renderHook(() => useBookFile('book', 'source/pitch.md'));
    await waitFor(() => expect(result.current.content).toBe('V1'));

    mock.files.read.mockResolvedValue('V2');
    act(() => useFileChangeStore.getState().notifyChange());

    // Same file refreshing → previous content stays visible (no flash)
    expect(result.current.content).toBe('V1');
    await waitFor(() => expect(result.current.content).toBe('V2'));
    expect(mock.files.read).toHaveBeenCalledTimes(2);
  });

  it('clears immediately when switching to a different file', async () => {
    mock.files.read.mockResolvedValue('FIRST');
    const { result, rerender } = renderHook(({ path }) => useBookFile('book', path), {
      initialProps: { path: 'source/pitch.md' },
    });
    await waitFor(() => expect(result.current.content).toBe('FIRST'));

    let resolveRead!: (content: string) => void;
    mock.files.read.mockImplementation(
      () => new Promise<string>((resolve) => { resolveRead = resolve; }),
    );
    rerender({ path: 'source/other.md' });

    // Different file → stale prose never shows
    expect(result.current).toEqual({ content: '', loading: true, error: null });
    resolveRead('SECOND');
    await waitFor(() => expect(result.current.content).toBe('SECOND'));
  });
});
