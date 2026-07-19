import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SplitPane } from './SplitPane';

const RATIO_KEY = 'novel-engine:workbench-split';
const COLLAPSED_KEY = 'novel-engine:workbench-split-collapsed';

beforeEach(() => {
  window.localStorage.clear();
});

function renderPane() {
  const utils = render(
    <SplitPane left={<div>left content</div>} right={<div>right content</div>} />,
  );
  const leftPane = screen.getByText('left content').parentElement as HTMLElement;
  const rightPane = screen.getByText('right content').parentElement as HTMLElement;
  const divider = utils.container.querySelector('[role="separator"]') as HTMLElement;
  return { ...utils, leftPane, rightPane, divider };
}

describe('SplitPane', () => {
  it('renders both panes at the default 52% ratio', () => {
    const { leftPane, rightPane } = renderPane();
    expect(leftPane.style.width).toBe('52%');
    expect(rightPane).toBeVisible();
  });

  it('restores a persisted ratio from localStorage', () => {
    window.localStorage.setItem(RATIO_KEY, '0.6');
    const { leftPane } = renderPane();
    expect(leftPane.style.width).toBe('60%');
  });

  it('ignores an out-of-range persisted ratio', () => {
    window.localStorage.setItem(RATIO_KEY, '0.9'); // above MAX_RATIO 0.7
    const { leftPane } = renderPane();
    expect(leftPane.style.width).toBe('52%');
  });

  it('collapses the companion pane via the chevron and persists the choice', () => {
    const { leftPane, rightPane } = renderPane();

    fireEvent.click(screen.getByTitle('Hide companion pane'));

    expect(rightPane.className).toContain('hidden');
    // Companion stays mounted to preserve its state
    expect(screen.getByText('right content')).toBeInTheDocument();
    expect(leftPane.style.width).toBe('100%');
    expect(window.localStorage.getItem(COLLAPSED_KEY)).toBe('true');

    fireEvent.click(screen.getByTitle('Show companion pane'));
    expect(rightPane.className).not.toContain('hidden');
    expect(window.localStorage.getItem(COLLAPSED_KEY)).toBe('false');
  });

  it('restores the collapsed state from localStorage', () => {
    window.localStorage.setItem(COLLAPSED_KEY, 'true');
    const { rightPane } = renderPane();
    expect(rightPane.className).toContain('hidden');
  });

  it('drag-resizes within the clamp range and persists on mouseup', () => {
    const { container, leftPane, divider } = renderPane();
    const root = container.firstElementChild as HTMLElement;
    root.getBoundingClientRect = () =>
      ({ left: 0, width: 1000, top: 0, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    fireEvent.mouseDown(divider);
    fireEvent.mouseMove(document, { clientX: 400 });
    expect(leftPane.style.width).toBe('40%');

    // Below MIN_RATIO 0.3 → clamped
    fireEvent.mouseMove(document, { clientX: 100 });
    expect(leftPane.style.width).toBe('30%');

    fireEvent.mouseUp(document);
    expect(window.localStorage.getItem(RATIO_KEY)).toBe('0.3');
  });

  it('resets the ratio on divider double-click', () => {
    window.localStorage.setItem(RATIO_KEY, '0.6');
    const { leftPane, divider } = renderPane();

    fireEvent.doubleClick(divider);

    expect(leftPane.style.width).toBe('52%');
    expect(window.localStorage.getItem(RATIO_KEY)).toBe('0.52');
  });
});
