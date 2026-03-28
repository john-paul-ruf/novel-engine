# SESSION-05 — Version Store & DiffViewer Component

> **Feature:** content-version-control
> **Layer(s):** Renderer
> **Depends on:** SESSION-04
> **Estimated effort:** 25 min

---

## Context

SESSION-04 wired the `VersionService` into the Electron app with IPC channels and a preload bridge. The renderer can now call `window.novelEngine.versions.*` to access version history, diffs, and reverts. This session creates the Zustand store and the core `DiffViewer` component that renders human-readable diffs.

The `DiffViewer` is a standalone component that takes a `FileDiff` and renders it as a color-coded unified diff — green for additions, red for deletions, neutral for context lines. It's designed to be embedded anywhere in the UI where file diffs need to be shown.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/versionStore.ts` | Create | Zustand store for version history state and actions |
| `src/renderer/components/Files/DiffViewer.tsx` | Create | Renders a `FileDiff` as human-readable color-coded unified diff |

---

## Implementation

### 1. Create `src/renderer/stores/versionStore.ts`

```typescript
import { create } from 'zustand';
import type { FileDiff, FileVersionSummary } from '@domain/types';

type VersionState = {
  // Current file being viewed
  activeBookSlug: string;
  activeFilePath: string;

  // Version list
  versions: FileVersionSummary[];
  totalCount: number;
  isLoading: boolean;

  // Selected versions for diff
  selectedVersionId: number | null;
  diff: FileDiff | null;
  isDiffLoading: boolean;

  // Error state
  error: string | null;

  // Actions
  loadHistory: (bookSlug: string, filePath: string) => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  selectVersion: (versionId: number) => Promise<void>;
  clearSelection: () => void;
  revertToVersion: (versionId: number) => Promise<void>;
  reset: () => void;
};

const PAGE_SIZE = 30;

export const useVersionStore = create<VersionState>((set, get) => ({
  activeBookSlug: '',
  activeFilePath: '',
  versions: [],
  totalCount: 0,
  isLoading: false,
  selectedVersionId: null,
  diff: null,
  isDiffLoading: false,
  error: null,

  loadHistory: async (bookSlug: string, filePath: string) => {
    set({
      activeBookSlug: bookSlug,
      activeFilePath: filePath,
      versions: [],
      totalCount: 0,
      isLoading: true,
      selectedVersionId: null,
      diff: null,
      error: null,
    });

    try {
      const [versions, totalCount] = await Promise.all([
        window.novelEngine.versions.getHistory(bookSlug, filePath, PAGE_SIZE, 0),
        window.novelEngine.versions.getCount(bookSlug, filePath),
      ]);

      set({ versions, totalCount, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load version history',
      });
    }
  },

  loadMoreHistory: async () => {
    const { activeBookSlug, activeFilePath, versions, totalCount, isLoading } = get();
    if (isLoading || versions.length >= totalCount) return;

    set({ isLoading: true });

    try {
      const more = await window.novelEngine.versions.getHistory(
        activeBookSlug,
        activeFilePath,
        PAGE_SIZE,
        versions.length,
      );
      set((state) => ({
        versions: [...state.versions, ...more],
        isLoading: false,
      }));
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load more versions',
      });
    }
  },

  selectVersion: async (versionId: number) => {
    const { versions } = get();
    set({ selectedVersionId: versionId, isDiffLoading: true, error: null });

    try {
      // Find the previous version (the one right after this one in the list,
      // since versions are sorted newest-first)
      const idx = versions.findIndex((v) => v.id === versionId);
      const previousVersion = idx >= 0 && idx < versions.length - 1
        ? versions[idx + 1]
        : null;

      const diff = await window.novelEngine.versions.getDiff(
        previousVersion?.id ?? null,
        versionId,
      );

      set({ diff, isDiffLoading: false });
    } catch (err) {
      set({
        isDiffLoading: false,
        error: err instanceof Error ? err.message : 'Failed to compute diff',
      });
    }
  },

  clearSelection: () => {
    set({ selectedVersionId: null, diff: null });
  },

  revertToVersion: async (versionId: number) => {
    const { activeBookSlug, activeFilePath } = get();
    if (!activeBookSlug || !activeFilePath) return;

    try {
      await window.novelEngine.versions.revert(activeBookSlug, activeFilePath, versionId);
      // Reload history to include the new revert snapshot
      await get().loadHistory(activeBookSlug, activeFilePath);
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to revert',
      });
    }
  },

  reset: () => {
    set({
      activeBookSlug: '',
      activeFilePath: '',
      versions: [],
      totalCount: 0,
      isLoading: false,
      selectedVersionId: null,
      diff: null,
      isDiffLoading: false,
      error: null,
    });
  },
}));
```

### 2. Create `src/renderer/components/Files/DiffViewer.tsx`

This component renders a `FileDiff` as a unified diff with:
- Green background for added lines
- Red background for removed lines
- Neutral background for context lines
- Line numbers in both old and new columns
- Hunk headers showing line ranges
- Summary bar showing total additions/deletions

```typescript
import type { DiffHunk, DiffLine, FileDiff } from '@domain/types';

type DiffViewerProps = {
  diff: FileDiff;
  className?: string;
};

function HunkHeader({ hunk }: { hunk: DiffHunk }): React.ReactElement {
  return (
    <div className="bg-zinc-800 text-zinc-400 px-3 py-1 text-xs font-mono border-y border-zinc-700">
      @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
    </div>
  );
}

function DiffLineRow({ line }: { line: DiffLine }): React.ReactElement {
  const bgClass =
    line.type === 'add'
      ? 'bg-green-950/40'
      : line.type === 'remove'
        ? 'bg-red-950/40'
        : '';

  const textClass =
    line.type === 'add'
      ? 'text-green-300'
      : line.type === 'remove'
        ? 'text-red-300'
        : 'text-zinc-400';

  const prefix =
    line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';

  return (
    <div className={`flex font-mono text-xs leading-5 ${bgClass}`}>
      {/* Old line number */}
      <span className="w-12 text-right pr-2 text-zinc-600 select-none shrink-0 border-r border-zinc-800">
        {line.oldLineNumber ?? ''}
      </span>
      {/* New line number */}
      <span className="w-12 text-right pr-2 text-zinc-600 select-none shrink-0 border-r border-zinc-800">
        {line.newLineNumber ?? ''}
      </span>
      {/* Prefix */}
      <span className={`w-5 text-center select-none shrink-0 ${textClass}`}>
        {prefix}
      </span>
      {/* Content */}
      <span className={`flex-1 px-2 whitespace-pre-wrap break-all ${textClass}`}>
        {line.content}
      </span>
    </div>
  );
}

function DiffSummary({ diff }: { diff: FileDiff }): React.ReactElement {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-zinc-900 border-b border-zinc-700 text-xs">
      {diff.totalAdditions > 0 && (
        <span className="text-green-400 font-medium">
          +{diff.totalAdditions} addition{diff.totalAdditions !== 1 ? 's' : ''}
        </span>
      )}
      {diff.totalDeletions > 0 && (
        <span className="text-red-400 font-medium">
          -{diff.totalDeletions} deletion{diff.totalDeletions !== 1 ? 's' : ''}
        </span>
      )}
      {diff.totalAdditions === 0 && diff.totalDeletions === 0 && (
        <span className="text-zinc-500">No changes</span>
      )}
    </div>
  );
}

export function DiffViewer({ diff, className = '' }: DiffViewerProps): React.ReactElement {
  if (diff.hunks.length === 0) {
    return (
      <div className={`flex items-center justify-center py-8 text-zinc-500 text-sm ${className}`}>
        No differences found
      </div>
    );
  }

  return (
    <div className={`border border-zinc-700 rounded-lg overflow-hidden ${className}`}>
      <DiffSummary diff={diff} />
      <div className="overflow-auto max-h-[600px]">
        {diff.hunks.map((hunk, hunkIdx) => (
          <div key={hunkIdx}>
            <HunkHeader hunk={hunk} />
            {hunk.lines.map((line, lineIdx) => (
              <DiffLineRow key={`${hunkIdx}-${lineIdx}`} line={line} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages
- [x] Application imports only from domain interfaces (not concrete classes)
- [x] IPC handlers are one-liner delegations
- [x] Renderer accesses backend only through `window.novelEngine`
- [x] Store uses `import type` for domain types — no value imports from domain
- [x] Component uses `import type` for domain types — no value imports from domain
- [x] All async operations have error handling
- [x] No `any` types
- [x] Tailwind utility classes only — dark theme using zinc scale, green for additions, red for deletions

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `useVersionStore` exports all expected actions: `loadHistory`, `loadMoreHistory`, `selectVersion`, `clearSelection`, `revertToVersion`, `reset`
3. `DiffViewer` renders hunks with correct line numbering and color coding
4. Store calls `window.novelEngine.versions.*` methods — not direct IPC
5. Pagination works via `loadMoreHistory` with offset tracking

---

## State Update

After completing this session, update `prompts/feature/content-version-control/STATE.md`:
- Set SESSION-05 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
