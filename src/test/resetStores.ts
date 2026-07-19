import { beforeEach } from 'vitest';

/**
 * Minimal structural view of a Zustand store (hook or vanilla api).
 * The `never`-typed setState parameter makes every concretely-typed store
 * assignable here without resorting to `any`.
 */
type ResettableStore = {
  getState: () => Record<string, unknown>;
  setState: (state: never, replace: true) => void;
};

/**
 * Snapshot the given stores' current state (call at module scope, before any
 * test mutates them — i.e. their pristine initial state) and register a
 * `beforeEach` that restores each snapshot with a full-state replace.
 *
 * Also clears `localStorage` so persisted-store keys (`novel-engine-view`)
 * and chatStore's per-book conversation keys never leak between tests.
 *
 * Usage (top of a store/component test file):
 *
 *   resetStoresBeforeEach(useBookStore, useChatStore, useViewStore);
 */
export function resetStoresBeforeEach(...stores: ResettableStore[]): void {
  const snapshots = stores.map((store) => ({ store, state: { ...store.getState() } }));

  beforeEach(() => {
    window.localStorage.clear();
    for (const { store, state } of snapshots) {
      store.setState(state as never, true);
    }
  });
}
