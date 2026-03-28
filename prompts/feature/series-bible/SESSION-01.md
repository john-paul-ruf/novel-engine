# SESSION-01 — Domain Types, Interfaces & Constants for Series Support

> **Feature:** series-bible
> **Layer(s):** Domain
> **Depends on:** Nothing
> **Estimated effort:** 20 min

---

## Context

This is the first session for the series-bible feature. Nothing has been built yet. We are adding the ability to group multiple books into an ordered series with shared context (series bible, character registry, timeline) that persists across volumes and is automatically loaded into agent context.

A "series" is a lightweight container stored at `{userData}/series/{slug}/`. It holds a manifest (`series.json`) and shared documents (`series-bible.md`). The series manifest is the single source of truth for membership and volume ordering — `BookMeta` is not modified. The `SeriesService` resolves reverse lookups (book → series) by scanning manifests and caching in memory.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | Modify | Add `SeriesMeta`, `SeriesVolume`, `SeriesSummary` types |
| `src/domain/interfaces.ts` | Modify | Add `ISeriesService` interface |
| `src/domain/constants.ts` | Modify | Add `seriesBible` to `FILE_MANIFEST_KEYS`, update `AGENT_READ_GUIDANCE` |

---

## Implementation

### 1. Add Series Types to `src/domain/types.ts`

Read `src/domain/types.ts`. Add the following types after the `BookSummary` type block (after line ~37):

```typescript
// === Series ===

/** A single volume entry within a series — links a book to its position. */
export type SeriesVolume = {
  bookSlug: string;        // slug of the book in books/
  volumeNumber: number;    // 1-based position in the series
};

/** Stored metadata for a series. Persisted as series.json in the series directory. */
export type SeriesMeta = {
  slug: string;            // kebab-case directory name
  name: string;            // display name (e.g. "The Stormlight Archive")
  description: string;     // optional series-level blurb
  volumes: SeriesVolume[]; // ordered list of books in the series
  created: string;         // ISO date
  updated: string;         // ISO date
};

/** Lightweight summary for UI lists — SeriesMeta plus computed fields. */
export type SeriesSummary = SeriesMeta & {
  volumeCount: number;
  totalWordCount: number;
};
```

### 2. Add `ISeriesService` Interface to `src/domain/interfaces.ts`

Read `src/domain/interfaces.ts`. Add the import for the new types at the top:

```typescript
import type {
  // ...existing imports...
  SeriesMeta,
  SeriesSummary,
  SeriesVolume,
} from './types';
```

Add the following interface after `ISourceGenerationService`:

```typescript
export interface ISeriesService {
  /** List all series with computed summary fields. */
  listSeries(): Promise<SeriesSummary[]>;

  /** Get a single series by slug. Returns null if not found. */
  getSeries(slug: string): Promise<SeriesMeta | null>;

  /** Create a new series. Returns the created metadata. */
  createSeries(name: string, description?: string): Promise<SeriesMeta>;

  /** Update series metadata (name, description). Does not modify volumes. */
  updateSeries(slug: string, partial: Partial<Pick<SeriesMeta, 'name' | 'description'>>): Promise<SeriesMeta>;

  /** Delete a series. Does not delete the books — only removes the grouping. */
  deleteSeries(slug: string): Promise<void>;

  /** Add a book to a series at a specific position. Shifts existing volumes. */
  addVolume(seriesSlug: string, bookSlug: string, volumeNumber?: number): Promise<SeriesMeta>;

  /** Remove a book from a series. Renumbers remaining volumes. */
  removeVolume(seriesSlug: string, bookSlug: string): Promise<SeriesMeta>;

  /** Reorder volumes within a series. `orderedSlugs` is the new order. */
  reorderVolumes(seriesSlug: string, orderedSlugs: string[]): Promise<SeriesMeta>;

  /**
   * Find which series a book belongs to (if any).
   * Uses an in-memory reverse-lookup cache rebuilt on mutation.
   */
  getSeriesForBook(bookSlug: string): Promise<SeriesMeta | null>;

  /**
   * Read the series bible markdown content.
   * Returns empty string if the file doesn't exist yet.
   */
  readSeriesBible(seriesSlug: string): Promise<string>;

  /** Write (create or overwrite) the series bible markdown. */
  writeSeriesBible(seriesSlug: string, content: string): Promise<void>;

  /**
   * Get the absolute path to the series bible file.
   * Used by ContextBuilder to include in read guidance.
   * Returns null if the book is not part of a series.
   */
  getSeriesBiblePath(bookSlug: string): Promise<string | null>;

  /**
   * Invalidate the in-memory cache. Called when books are created/deleted/renamed
   * to ensure the reverse lookup stays consistent.
   */
  invalidateCache(): void;
}
```

### 3. Update Constants in `src/domain/constants.ts`

Read `src/domain/constants.ts`.

**3a.** Add `seriesBible` to the `FILE_MANIFEST_KEYS` array. Insert it after the `authorProfile` entry:

```typescript
{ key: 'seriesBible', path: 'series-bible.md' },  // resolved to absolute path at runtime
```

Note: Unlike other manifest keys which are relative to the book root, the series bible lives outside the book directory. The path here is a placeholder — `ContextBuilder` will resolve it to the absolute path at runtime when the book is part of a series.

**3b.** Update `AGENT_READ_GUIDANCE` to include the series bible for agents that need cross-volume context. Add `'series-bible.md'` to the `readIfRelevant` list for these agents:

- **Spark** — needs series context when pitching a sequel
- **Verity** — must maintain continuity across volumes
- **Ghostlight** — should know series context for reader experience
- **Lumen** — should assess structural coherence within the series
- **Sable** — must catch cross-volume inconsistencies
- **Forge** — revision planning may reference series continuity
- **Quill** — publication metadata should reference the series

Add `'series-bible.md'` to the `readIfRelevant` array for all 7 creative agents.

---

## Architecture Compliance

- [ ] Domain files import from nothing (types.ts has zero imports, interfaces.ts imports only from ./types, constants.ts imports only from ./types)
- [ ] No infrastructure, application, or renderer imports
- [ ] All new types are pure TypeScript declarations
- [ ] Interface methods use only domain types as parameters and return types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `SeriesMeta`, `SeriesVolume`, `SeriesSummary` types are exported from `src/domain/types.ts`
3. `ISeriesService` is exported from `src/domain/interfaces.ts`
4. `FILE_MANIFEST_KEYS` includes a `seriesBible` entry
5. All 7 creative agents have `'series-bible.md'` in their `readIfRelevant` lists

---

## State Update

After completing this session, update `prompts/feature/series-bible/STATE.md`:
- Set SESSION-01 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
