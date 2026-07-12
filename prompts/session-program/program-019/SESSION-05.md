# SESSION-05 — Renderer Store (queryStore)

> **Program:** Novel Engine
> **Feature:** query-manager
> **Modules:** M10 (renderer)
> **Depends on:** SESSION-03 (preload bridge shape)
> **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | renderer/stores | `src/renderer/stores/pipelineStore.ts` (Zustand pattern), `src/renderer/stores/bookStore.ts` (active book slug) | Pattern for store creation, book dependency |
| M09 | preload | `src/preload/index.ts` (query namespace shape from SESSION-03) | Bridge methods to call |

## Context

The backend is fully wired (types, service, IPC, preload, composition root). Now we build the renderer. This session creates the `queryStore` — a Zustand store that manages the query tracker state for the active book, calls the preload bridge, and exposes actions for the UI.

The store follows the pattern of existing stores: it reads the active book slug from `bookStore`, loads data via `window.novelEngine.query.*`, and exposes loading/error states.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/queryStore.ts` | Create | Full store implementation |

## Implementation

### 1. Read existing stores for patterns

Read `src/renderer/stores/pipelineStore.ts` — note:
- How it keyes cache by book slug
- Loading states
- Actions call `window.novelEngine.pipeline.*`
- After mutations, it calls `loadPipeline` to refresh

Read `src/renderer/stores/bookStore.ts` — find how `activeSlug` is exposed.

### 2. Create `src/renderer/stores/queryStore.ts`

```typescript
import { create } from 'zustand';
import type { QueryTracker, QueryTarget, QueryStatus, QueryLetter, StreamEvent } from '@domain/types';

type QueryStoreState = {
  /** The tracker for the currently active book. Null until loaded. */
  tracker: QueryTracker | null;
  /** All query letter files for the active book. */
  letters: QueryLetter[];
  loading: boolean;
  /** Currently generating a letter for this target ID (null when idle). */
  generatingFor: string | null;
  /** Stream events from letter generation. */
  streamBuffer: string;
  isGenerating: boolean;
  error: string | null;

  /** Load the tracker and letters for a book. */
  load: (bookSlug: string) => Promise<void>;
  /** Add a new submission target. Returns the created target. */
  addTarget: (bookSlug: string, target: Omit<QueryTarget, 'id' | 'queryLetterPath' | 'submittedDate' | 'responseDate'>) => Promise<QueryTarget>;
  /** Update a target's status. */
  updateTargetStatus: (bookSlug: string, targetId: string, status: QueryStatus, responseDate?: string) => Promise<void>;
  /** Remove a target. */
  removeTarget: (bookSlug: string, targetId: string) => Promise<void>;
  /** Generate a personalized query letter for a target. Streams via onStream. */
  generateLetter: (bookSlug: string, targetId: string) => Promise<QueryLetter | null>;
  /** Read a specific query letter's content. */
  readLetter: (bookSlug: string, targetSlug: string) => Promise<string>;
  /** Save manually edited letter content. */
  saveLetter: (bookSlug: string, targetSlug: string, content: string) => Promise<void>;
  /** Clear the store (called on book switch). */
  clear: () => void;
  /** Initialize the stream listener for letter generation. Returns cleanup fn. */
  initStreamListener: () => () => void;
};

export const useQueryStore = create<QueryStoreState>((set, get) => ({
  tracker: null,
  letters: [],
  loading: false,
  generatingFor: null,
  streamBuffer: '',
  isGenerating: false,
  error: null,

  load: async (bookSlug: string) => {
    set({ loading: true, error: null });
    try {
      const [tracker, letters] = await Promise.all([
        window.novelEngine.query.loadTracker(bookSlug),
        window.novelEngine.query.listLetters(bookSlug),
      ]);
      set({ tracker, letters, loading: false });
    } catch (err) {
      console.error('[queryStore] Failed to load:', err);
      set({ loading: false, error: 'Failed to load query tracker' });
    }
  },

  addTarget: async (bookSlug, target) => {
    const created = await window.novelEngine.query.addTarget(bookSlug, target);
    // Reload to get the updated tracker
    await get().load(bookSlug);
    return created;
  },

  updateTargetStatus: async (bookSlug, targetId, status, responseDate) => {
    await window.novelEngine.query.updateTargetStatus(bookSlug, targetId, status, responseDate);
    await get().load(bookSlug);
  },

  removeTarget: async (bookSlug, targetId) => {
    await window.novelEngine.query.removeTarget(bookSlug, targetId);
    await get().load(bookSlug);
  },

  generateLetter: async (bookSlug, targetId) => {
    set({ generatingFor: targetId, isGenerating: true, streamBuffer: '', error: null });
    try {
      const result = await window.novelEngine.query.generateLetter(bookSlug, targetId);
      set({ generatingFor: null, isGenerating: false, streamBuffer: '' });
      await get().load(bookSlug);
      return result;
    } catch (err) {
      console.error('[queryStore] Letter generation failed:', err);
      set({ generatingFor: null, isGenerating: false, error: 'Letter generation failed' });
      return null;
    }
  },

  readLetter: async (bookSlug, targetSlug) => {
    return window.novelEngine.query.readLetter(bookSlug, targetSlug);
  },

  saveLetter: async (bookSlug, targetSlug, content) => {
    await window.novelEngine.query.saveLetter(bookSlug, targetSlug, content);
    await get().load(bookSlug);
  },

  clear: () => {
    set({ tracker: null, letters: [], loading: false, error: null, generatingFor: null, isGenerating: false, streamBuffer: '' });
  },

  initStreamListener: () => {
    const cleanup = window.novelEngine.query.onStream((event: StreamEvent) => {
      if (event.type === 'textDelta') {
        set((state) => ({ streamBuffer: state.streamBuffer + event.text }));
      } else if (event.type === 'done' || event.type === 'error') {
        // Generation complete or failed — the generateLetter promise handles final state
      }
    });
    return cleanup;
  },
}));
```

## Verification

1. Run `npx tsc --noEmit` — must pass with zero errors
2. Verify `useQueryStore` is exported from `src/renderer/stores/queryStore.ts`
3. Verify all type imports resolve (`QueryTracker`, `QueryTarget`, `QueryStatus`, `QueryLetter`, `StreamEvent` from `@domain/types`)
4. Verify the store calls `window.novelEngine.query.*` (not any direct IPC)
5. Verify `initStreamListener` returns a cleanup function (pattern matches other stores)

## State Update

Update `prompts/session-program/program-019/STATE.md`:
- Set SESSION-05 status to `done`
- Add completion date
- Add handoff notes: Store is ready. UI view + IconRail entry needed in SESSION-06.