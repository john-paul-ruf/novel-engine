import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { BookStatistics } from '@domain/types';
import { App } from './App';
import { useSettingsStore } from './stores/settingsStore';
import { useBookStore } from './stores/bookStore';
import { useViewStore } from './stores/viewStore';
import { usePaletteStore } from './stores/paletteStore';
import { useTourStore } from './stores/tourStore';
import { useChatStore } from './stores/chatStore';
import { useCliActivityStore } from './stores/cliActivityStore';
import { useWorkspaceStore } from './stores/workspaceStore';
import { renderApp } from '../test/renderWithState';
import { resetStoresBeforeEach } from '../test/resetStores';
import { makeAppSettings, type BridgeOverrides } from '../test/novelEngineMock';

// workspaceStore has cross-store subscriptions — register it last (S22 rule)
resetStoresBeforeEach(
  useSettingsStore,
  useBookStore,
  useViewStore,
  usePaletteStore,
  useTourStore,
  useWorkspaceStore,
);

beforeAll(() => {
  // useTheme listens for OS theme changes — jsdom has no matchMedia
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string): MediaQueryList =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    });
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
  if (typeof IntersectionObserver === 'undefined') {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
  }
  if (typeof ResizeObserver === 'undefined') {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
  }
});

afterEach(() => {
  useChatStore.getState().destroyStreamListener();
  useCliActivityStore.getState().destroyListener();
});

const EMPTY_STATS: BookStatistics = {
  usageOverTime: [],
  perAgent: [],
  perPhase: [],
  wordCountHistory: [],
  totalCostEstimate: 0,
  wordsPerChapter: [],
  totalTokens: { input: 0, output: 0, thinking: 0 },
  conversationCount: 0,
};

function renderFullApp(bridge: BridgeOverrides = {}) {
  return renderApp(<App />, {
    bridge: {
      // StatisticsView mounts (hidden) and loads immediately
      statistics: { get: vi.fn(async () => EMPTY_STATS), recordSnapshot: vi.fn(async () => undefined) },
      settings: {
        load: vi.fn(async () => makeAppSettings({ completedTours: ['welcome'] })),
        ...bridge.settings,
      },
      ...bridge,
    },
  });
}

/** The wrapper divs in ViewContent hide every view except the active one. */
function isHiddenView(el: HTMLElement): boolean {
  return el.closest('.hidden') !== null;
}

describe('App smoke', () => {
  it('mounts the full shell with only the Library view visible and no console errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderFullApp();

    // Shell regions
    expect(await screen.findByText('Your bookshelf')).toBeInTheDocument(); // LibraryView
    expect(screen.getByText('Idle')).toBeInTheDocument(); // StatusBar

    // All views stay mounted; only the active one is shown
    expect(isHiddenView(screen.getByText('Your bookshelf'))).toBe(false);
    expect(isHiddenView(screen.getByText('Model Selection'))).toBe(true); // Settings
    expect(isHiddenView(screen.getByText('Writing Statistics'))).toBe(true);
    // No active book — QueryManagerView shows its book prompt, still hidden
    expect(
      isHiddenView(screen.getByText('Select a book in the Library to manage queries')),
    ).toBe(true);

    // Let mount-time loads settle before checking for errors
    await waitFor(() => expect(useSettingsStore.getState().settings).not.toBeNull());
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('navigating switches the visible view without remounting the shell', async () => {
    renderFullApp();
    await screen.findByText('Your bookshelf');

    act(() => {
      useViewStore.getState().navigate('settings');
    });

    expect(isHiddenView(screen.getByText('Model Selection'))).toBe(false);
    expect(isHiddenView(screen.getByText('Your bookshelf'))).toBe(true);
  });

  it('⌘K toggles the command palette and Escape closes it', async () => {
    renderFullApp();
    await screen.findByText('Your bookshelf');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByPlaceholderText(/Jump to a phase/)).toBeInTheDocument();
    expect(usePaletteStore.getState().isOpen).toBe(true);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(usePaletteStore.getState().isOpen).toBe(false);
  });

  it('hydrates the tour store from settings on mount', async () => {
    renderFullApp();
    await screen.findByText('Your bookshelf');

    await waitFor(() => expect(useTourStore.getState().isHydrated).toBe(true));
    expect(useTourStore.getState().isTourCompleted('welcome')).toBe(true);
  });

  it('gates uninitialized users into onboarding', async () => {
    renderFullApp({
      settings: { load: vi.fn(async () => makeAppSettings({ initialized: false })) },
    });

    expect(await screen.findByText('Novel Engine')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get Started' })).toBeInTheDocument();
    expect(screen.queryByText('Your bookshelf')).not.toBeInTheDocument();
  });
});
