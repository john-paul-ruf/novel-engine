import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import {
  installNovelEngineMock,
  type BridgeOverrides,
  type NovelEngineMock,
} from './novelEngineMock';

/** Structural view of a Zustand store hook — same `never` trick as resetStores. */
type SeedableStore = { setState: (state: never) => void };

/** `[store, partial state]` pairs applied via merging setState before render. */
export type StoreSeed = ReadonlyArray<readonly [SeedableStore, Record<string, unknown>]>;

type RenderAppOptions = {
  stores?: StoreSeed;
  bridge?: BridgeOverrides;
};

/**
 * Component-test entry point: installs the typed `window.novelEngine` mock
 * (with optional overrides), seeds store state, then renders with RTL.
 *
 *   const { bridge } = renderApp(<IconRail />, {
 *     stores: [[useBookStore, { activeSlug: 'my-book' }]],
 *     bridge: { books: { list: vi.fn(async () => [makeBookSummary()]) } },
 *   });
 */
export function renderApp(
  ui: ReactElement,
  { stores = [], bridge }: RenderAppOptions = {},
): RenderResult & { bridge: NovelEngineMock } {
  const mock = installNovelEngineMock(bridge);
  for (const [store, state] of stores) {
    store.setState(state as never);
  }
  return { ...render(ui), bridge: mock };
}
