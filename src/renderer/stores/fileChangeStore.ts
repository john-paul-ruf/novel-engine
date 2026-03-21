import { create } from 'zustand';

/**
 * Lightweight store that tracks file system changes.
 *
 * Components that display book files (FileTree, SourcePanel, ChaptersPanel,
 * AgentOutputPanel, FileBrowser) subscribe to `revision` and re-fetch their
 * data whenever it increments. This eliminates the need for manual refresh
 * after agent interactions write files.
 */
type FileChangeState = {
  /** Monotonically increasing counter — bumped whenever files change on disk. */
  revision: number;

  /** Signal that files have changed — increments revision to trigger re-renders. */
  notifyChange: () => void;
};

export const useFileChangeStore = create<FileChangeState>((set) => ({
  revision: 0,

  notifyChange: () => {
    set((state) => ({ revision: state.revision + 1 }));
  },
}));
