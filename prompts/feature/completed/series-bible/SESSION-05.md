# SESSION-05 — Renderer: Series Store

> **Feature:** series-bible
> **Layer(s):** Renderer
> **Depends on:** SESSION-04
> **Estimated effort:** 20 min

---

## Context

Sessions 01–04 built the full backend: domain types, infrastructure service, context integration, and IPC wiring. The preload bridge now exposes `window.novelEngine.series.*`. This session creates the Zustand store that the renderer uses to manage series state.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/seriesStore.ts` | Create | Zustand store for series CRUD, volume management, and bible editing |

---

## Implementation

### 1. Create `src/renderer/stores/seriesStore.ts`

Create a Zustand store following the same patterns as `bookStore.ts` and `pitchShelfStore.ts`.

#### State Shape

```typescript
import { create } from 'zustand';
import type { SeriesMeta, SeriesSummary } from '@domain/types';

type SeriesState = {
  /** All series with summary data. */
  seriesList: SeriesSummary[];

  /** Currently selected series for management (null when none selected). */
  activeSeries: SeriesMeta | null;

  /** Series bible content for the active series. */
  bibleContent: string;

  /** Whether the bible editor has unsaved changes. */
  bibleDirty: boolean;

  /** Loading state for async operations. */
  loading: boolean;

  /** Error message from the last failed operation. */
  error: string | null;

  // Actions

  /** Load all series from the backend. */
  loadSeries: () => Promise<void>;

  /** Create a new series. */
  createSeries: (name: string, description?: string) => Promise<SeriesMeta>;

  /** Update series metadata. */
  updateSeries: (slug: string, partial: Partial<Pick<SeriesMeta, 'name' | 'description'>>) => Promise<void>;

  /** Delete a series. Clears activeSeries if it was the deleted one. */
  deleteSeries: (slug: string) => Promise<void>;

  /** Select a series for management — loads its full data and bible. */
  selectSeries: (slug: string) => Promise<void>;

  /** Clear the active series selection. */
  clearSelection: () => void;

  /** Add a book to the active series. */
  addVolume: (bookSlug: string, volumeNumber?: number) => Promise<void>;

  /** Remove a book from the active series. */
  removeVolume: (bookSlug: string) => Promise<void>;

  /** Reorder volumes in the active series. */
  reorderVolumes: (orderedSlugs: string[]) => Promise<void>;

  /** Update the local bible content (marks dirty). */
  setBibleContent: (content: string) => void;

  /** Save the bible content to disk. */
  saveBible: () => Promise<void>;

  /** Load the bible content for a series. */
  loadBible: (seriesSlug: string) => Promise<void>;

  /**
   * Resolve which series the given book belongs to.
   * Returns the series meta, or null if the book is standalone.
   */
  getSeriesForBook: (bookSlug: string) => Promise<SeriesMeta | null>;
};
```

#### Implementation Notes

- **`loadSeries()`**: Calls `window.novelEngine.series.list()`. Sets `seriesList`. Clears `error`.
- **`createSeries(name, description?)`**: Calls `window.novelEngine.series.create(name, description)`. Then calls `loadSeries()` to refresh the list. Returns the created `SeriesMeta`.
- **`updateSeries(slug, partial)`**: Calls `window.novelEngine.series.update(slug, partial)`. Then refreshes both the list and `activeSeries` if it matches.
- **`deleteSeries(slug)`**: Calls `window.novelEngine.series.delete(slug)`. If `activeSeries?.slug === slug`, clears it. Refreshes the list.
- **`selectSeries(slug)`**: Calls `window.novelEngine.series.get(slug)`. Sets `activeSeries`. Calls `loadBible(slug)`.
- **`clearSelection()`**: Sets `activeSeries` to null, clears `bibleContent` and `bibleDirty`.
- **`addVolume(bookSlug, volumeNumber?)`**: Validates `activeSeries` is set. Calls `window.novelEngine.series.addVolume(activeSeries.slug, bookSlug, volumeNumber)`. Updates `activeSeries` with the returned meta. Refreshes list.
- **`removeVolume(bookSlug)`**: Similar pattern — validates, calls bridge, updates state.
- **`reorderVolumes(orderedSlugs)`**: Same pattern.
- **`setBibleContent(content)`**: Sets `bibleContent` and marks `bibleDirty = true`.
- **`saveBible()`**: Validates `activeSeries` is set. Calls `window.novelEngine.series.writeBible(activeSeries.slug, bibleContent)`. Sets `bibleDirty = false`.
- **`loadBible(seriesSlug)`**: Calls `window.novelEngine.series.readBible(seriesSlug)`. Sets `bibleContent`. Sets `bibleDirty = false`.
- **`getSeriesForBook(bookSlug)`**: Calls `window.novelEngine.series.getForBook(bookSlug)`. Pure passthrough — doesn't update store state.

#### Error Handling

Wrap all async operations in try/catch. Set `error` on failure, clear it on success. Set `loading` during operations.

---

## Architecture Compliance

- [ ] Renderer accesses backend only through `window.novelEngine.series.*`
- [ ] Only `import type` from domain — no value imports from domain, infrastructure, or application
- [ ] Follows Zustand patterns established in existing stores
- [ ] No direct IPC usage — everything through the preload bridge

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `useSeriesStore` is exported from `src/renderer/stores/seriesStore.ts`
3. All actions delegate to `window.novelEngine.series.*` methods
4. No value imports from outside the renderer layer

---

## State Update

After completing this session, update `prompts/feature/series-bible/STATE.md`:
- Set SESSION-05 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
