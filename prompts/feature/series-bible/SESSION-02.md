# SESSION-02 — Infrastructure: SeriesService Implementation

> **Feature:** series-bible
> **Layer(s):** Infrastructure
> **Depends on:** SESSION-01
> **Estimated effort:** 30 min

---

## Context

SESSION-01 added domain types (`SeriesMeta`, `SeriesVolume`, `SeriesSummary`) and the `ISeriesService` interface. This session implements the concrete `SeriesService` class that manages series directories, manifests, and the series bible file on disk.

Series are stored at `{userData}/series/{slug}/`. Each series directory contains:
- `series.json` — the manifest (name, description, volumes array, dates)
- `series-bible.md` — the shared world bible / character registry / timeline

The service maintains an in-memory reverse-lookup cache (`bookSlug → seriesSlug`) for fast resolution, rebuilt on any mutation or explicit invalidation.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/infrastructure/series/SeriesService.ts` | Create | Full `ISeriesService` implementation |
| `src/infrastructure/series/index.ts` | Create | Barrel export |

---

## Implementation

### 1. Create `src/infrastructure/series/SeriesService.ts`

This class implements `ISeriesService` from `@domain/interfaces`.

**Constructor:** Takes `userDataDir: string`. The series root is `path.join(userDataDir, 'series')`.

**Key behaviors:**

#### File I/O

- **`readManifest(slug)`** (private): Reads `{seriesRoot}/{slug}/series.json`, parses it, returns `SeriesMeta`. Throws if not found.
- **`writeManifest(meta)`** (private): Writes `series.json` to the series directory. Updates the `updated` timestamp. Rebuilds the reverse cache.
- **`ensureSeriesDir(slug)`** (private): Creates `{seriesRoot}/{slug}/` if it doesn't exist.

#### CRUD

- **`listSeries()`**: Reads the `series/` directory, loads each `series.json`, computes `volumeCount` and `totalWordCount` (by summing word counts from each book's `about.json` or using 0 if the book doesn't exist). Returns `SeriesSummary[]`. For `totalWordCount`, read each book's word count by checking for the existence of `{booksDir}/{bookSlug}/` and reading about.json — but since this service doesn't have access to `booksDir`, just set `totalWordCount` to 0. The renderer will compute it from the book store data.
- **`getSeries(slug)`**: Reads a single manifest. Returns null if the directory or file doesn't exist.
- **`createSeries(name, description?)`**: Slugifies the name, creates the directory, writes the initial manifest with empty volumes. Returns `SeriesMeta`.
- **`updateSeries(slug, partial)`**: Reads existing manifest, merges the partial, writes back. Only allows `name` and `description` updates.
- **`deleteSeries(slug)`**: Removes the entire series directory (`rm -rf`). Invalidates cache.

#### Volume Management

- **`addVolume(seriesSlug, bookSlug, volumeNumber?)`**: Validates the book isn't already in another series. If `volumeNumber` is provided, inserts at that position and shifts others. If omitted, appends to the end. Writes updated manifest.
- **`removeVolume(seriesSlug, bookSlug)`**: Removes the volume entry, renumbers remaining volumes sequentially (1, 2, 3...). Writes updated manifest.
- **`reorderVolumes(seriesSlug, orderedSlugs)`**: Validates all slugs match existing volumes, rebuilds the volumes array in the new order with sequential numbering. Writes updated manifest.

#### Reverse Lookup

- **`getSeriesForBook(bookSlug)`**: Checks the reverse cache. If cache is empty, builds it by scanning all series manifests. Returns `SeriesMeta | null`.
- **`invalidateCache()`**: Clears the reverse-lookup map. Next `getSeriesForBook` call will rebuild it.

The reverse cache is a `Map<string, string>` mapping `bookSlug → seriesSlug`. Built lazily on first access, invalidated on every mutation (`addVolume`, `removeVolume`, `reorderVolumes`, `deleteSeries`) and on explicit `invalidateCache()` calls.

#### Series Bible

- **`readSeriesBible(seriesSlug)`**: Reads `{seriesRoot}/{slug}/series-bible.md`. Returns empty string if file doesn't exist.
- **`writeSeriesBible(seriesSlug, content)`**: Writes content to `{seriesRoot}/{slug}/series-bible.md`. Creates the file if it doesn't exist.
- **`getSeriesBiblePath(bookSlug)`**: Resolves the book's series via `getSeriesForBook()`. If the book is in a series, returns the absolute path to `series-bible.md`. Returns null otherwise.

#### Slugification

Use a local `slugify` function — infrastructure modules are isolated so don't import from filesystem/:

```typescript
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
```

#### Error Handling

- All file reads wrapped in try/catch — return null or empty for missing files, throw for parse errors
- Validate that a book isn't already in another series before adding (throw descriptive error)
- Validate that slugs in `reorderVolumes` match existing volumes (throw if mismatch)

### 2. Create `src/infrastructure/series/index.ts`

```typescript
export { SeriesService } from './SeriesService';
```

---

## Architecture Compliance

- [ ] Infrastructure imports only from domain + external packages (node:fs, node:path)
- [ ] Implements `ISeriesService` interface exactly — all methods present
- [ ] Does not import from application, main, or renderer
- [ ] Does not import from other infrastructure modules (e.g., filesystem/)
- [ ] Barrel export in `index.ts`

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `SeriesService` implements every method declared in `ISeriesService`
3. No cross-infrastructure imports (series/ does not import from filesystem/, database/, etc.)
4. Barrel export at `src/infrastructure/series/index.ts` re-exports `SeriesService`

---

## State Update

After completing this session, update `prompts/feature/series-bible/STATE.md`:
- Set SESSION-02 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
