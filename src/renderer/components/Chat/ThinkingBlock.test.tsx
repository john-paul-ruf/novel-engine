import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThinkingBlock } from './ThinkingBlock';
import { useSettingsStore } from '../../stores/settingsStore';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { installNovelEngineMock, makeAppSettings } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useSettingsStore);

afterEach(() => {
  vi.useRealTimers();
});

describe('ThinkingBlock', () => {
  it('starts collapsed for persisted blocks when autoCollapseThinking is on (default)', () => {
    installNovelEngineMock();
    // settings === null → autoCollapseThinking falls back to true
    render(<ThinkingBlock content="Deep **plot** analysis" isStreaming={false} />);

    expect(screen.getByText('Agent Thinking')).toBeInTheDocument();
    // Collapsed: markdown body absent, preview snippet (markdown-stripped) shown
    expect(document.querySelector('strong')).toBeNull();
    expect(screen.getByText('Deep plot analysis')).toBeInTheDocument();
    expect(screen.getByText('▶')).toBeInTheDocument();
  });

  it('starts expanded for persisted blocks when autoCollapseThinking is off', () => {
    installNovelEngineMock();
    useSettingsStore.setState({
      settings: makeAppSettings({ autoCollapseThinking: false }),
    });
    render(<ThinkingBlock content="Deep **plot** analysis" isStreaming={false} />);

    expect(document.querySelector('strong')).toHaveTextContent('plot');
    expect(screen.getByText('▼')).toBeInTheDocument();
  });

  it('expands on toggle click and renders the markdown body', () => {
    installNovelEngineMock();
    render(<ThinkingBlock content="Deep **plot** analysis" isStreaming={false} />);

    fireEvent.click(screen.getByRole('button'));
    expect(document.querySelector('strong')).toHaveTextContent('plot');
  });

  it('streaming blocks are always expanded and labelled Thinking...', () => {
    installNovelEngineMock();
    render(<ThinkingBlock content="live thought" isStreaming={true} />);

    expect(screen.getByText('Thinking...')).toBeInTheDocument();
    expect(screen.getByText('live thought')).toBeInTheDocument();
  });

  it('shows the waiting placeholder when expanded with empty content', () => {
    installNovelEngineMock();
    render(<ThinkingBlock content="" isStreaming={true} />);

    expect(screen.getByText('Waiting for thinking output...')).toBeInTheDocument();
  });

  it('shows the token estimate when provided and positive', () => {
    installNovelEngineMock();
    render(
      <ThinkingBlock content="thoughts" isStreaming={false} tokenEstimate={1250} />,
    );

    expect(screen.getByText('~1,250 tokens')).toBeInTheDocument();
  });

  it('hides a zero token estimate', () => {
    installNovelEngineMock();
    render(<ThinkingBlock content="thoughts" isStreaming={false} tokenEstimate={0} />);

    expect(screen.queryByText(/tokens/)).toBeNull();
  });

  it('auto-collapses 1.5s after streaming ends in place (S27 bug, fixed)', () => {
    // Regression: the collapse timer used to be cancelled by the sibling
    // setWasStreaming re-render before it could fire. Prev-streaming now
    // lives in a ref, so the timer survives and collapses the block.
    installNovelEngineMock();
    useSettingsStore.setState({
      settings: makeAppSettings({ autoCollapseThinking: true }),
    });
    vi.useFakeTimers();
    const { rerender } = render(
      <ThinkingBlock content="live thought" isStreaming={true} />,
    );
    expect(screen.getByText('▼')).toBeInTheDocument();

    rerender(<ThinkingBlock content="live thought" isStreaming={false} />);
    // Still expanded immediately after streaming ends…
    expect(screen.getByText('▼')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // …then collapses in place
    expect(screen.getByText('▶')).toBeInTheDocument();
    expect(screen.getByText('Agent Thinking')).toBeInTheDocument();
  });

  it('does not auto-collapse when autoCollapseThinking is off', () => {
    installNovelEngineMock();
    useSettingsStore.setState({
      settings: makeAppSettings({ autoCollapseThinking: false }),
    });
    vi.useFakeTimers();
    const { rerender } = render(
      <ThinkingBlock content="live thought" isStreaming={true} />,
    );

    rerender(<ThinkingBlock content="live thought" isStreaming={false} />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByText('▼')).toBeInTheDocument();
  });

  it('truncates long preview snippets at 120 characters', () => {
    installNovelEngineMock();
    const long = 'a'.repeat(150);
    render(<ThinkingBlock content={long} isStreaming={false} />);

    expect(screen.getByText('a'.repeat(120) + '…')).toBeInTheDocument();
  });
});
