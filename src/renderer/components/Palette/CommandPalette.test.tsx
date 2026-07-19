import { describe, it, expect, vi, beforeAll } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';
import { usePaletteStore, type PaletteItem } from '../../stores/paletteStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';

resetStoresBeforeEach(usePaletteStore);

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

function item(overrides: Partial<PaletteItem> & { id: string }): PaletteItem {
  return {
    group: 'Actions',
    label: overrides.id,
    run: vi.fn(),
    ...overrides,
  };
}

function renderPalette(items: PaletteItem[], extra: Record<string, unknown> = {}) {
  return renderApp(<CommandPalette />, {
    stores: [
      [
        usePaletteStore,
        { isOpen: true, query: '', staticItems: items, dynamicProviders: [], ...extra },
      ],
    ],
  });
}

describe('CommandPalette', () => {
  it('renders nothing while closed', () => {
    const { container } = renderApp(<CommandPalette />, {
      stores: [[usePaletteStore, { isOpen: false }]],
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('opens with grouped items and hints', () => {
    renderPalette([
      item({ id: 'a1', label: 'Do a thing', hint: '⌘T' }),
      item({ id: 'n1', label: 'Go somewhere', group: 'Navigate' }),
    ]);

    expect(screen.getByPlaceholderText(/Jump to a phase/)).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByText('Navigate')).toBeInTheDocument();
    expect(screen.getByText('Do a thing')).toBeInTheDocument();
    expect(screen.getByText('⌘T')).toBeInTheDocument();
  });

  it('typing filters items and shows No matches when nothing fits', () => {
    renderPalette([
      item({ id: 'a1', label: 'Open Library' }),
      item({ id: 'a2', label: 'Run Build', keywords: ['compile'] }),
    ]);

    const input = screen.getByPlaceholderText(/Jump to a phase/);
    fireEvent.change(input, { target: { value: 'compile' } });
    expect(screen.getByText('Run Build')).toBeInTheDocument();
    expect(screen.queryByText('Open Library')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('Enter runs the highlighted item and closes the palette', () => {
    const run = vi.fn();
    renderPalette([item({ id: 'a1', label: 'First', run }), item({ id: 'a2', label: 'Second' })]);

    fireEvent.keyDown(screen.getByPlaceholderText(/Jump to a phase/), { key: 'Enter' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(usePaletteStore.getState().isOpen).toBe(false);
  });

  it('arrow keys move the highlight before running', () => {
    const first = vi.fn();
    const second = vi.fn();
    renderPalette([
      item({ id: 'a1', label: 'First', run: first }),
      item({ id: 'a2', label: 'Second', run: second }),
    ]);

    const input = screen.getByPlaceholderText(/Jump to a phase/);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('clicking an item runs it; disabled items are inert', () => {
    const run = vi.fn();
    const disabledRun = vi.fn();
    renderPalette([
      item({ id: 'a1', label: 'Enabled item', run }),
      item({ id: 'a2', label: 'Disabled item', run: disabledRun, enabled: () => false }),
    ]);

    fireEvent.click(screen.getByText('Disabled item'));
    expect(disabledRun).not.toHaveBeenCalled();
    expect(usePaletteStore.getState().isOpen).toBe(true);

    fireEvent.click(screen.getByText('Enabled item'));
    expect(run).toHaveBeenCalledTimes(1);
    expect(usePaletteStore.getState().isOpen).toBe(false);
  });
});
