# SESSION-01 — Domain Types for Series Import

> **Feature:** import-series
> **Layer(s):** Domain
> **Depends on:** Nothing
> **Estimated effort:** 10 min

---

## Context

Novel Engine can import a single manuscript file into a new book (via `IManuscriptImportService`) and can manage series (via `ISeriesService`). This session adds the domain types and interface needed to import **multiple manuscripts at once** and group them as volumes in a new or existing series.

The existing single-book import types (`ImportPreview`, `ImportCommitConfig`, `ImportResult`) remain unchanged. The new series import types compose them — a series import is a collection of individual book imports plus series metadata.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | Modify | Add `SeriesImportVolume`, `SeriesImportPreview`, `SeriesImportCommitConfig`, `SeriesImportResult` |
| `src/domain/interfaces.ts` | Modify | Add `ISeriesImportService` interface |

---

## Implementation

### 1. Add Series Import Types to `src/domain/types.ts`

Read `src/domain/types.ts`. Add the following types after the existing `ImportResult` type block (around line 635), before the `SourceGenerationStep` section:

```typescript
// === Series Import ===

/** A single volume in a series import — wraps an ImportPreview with ordering. */
export type SeriesImportVolume = {
  /** Index in the import order (0-based). */
  index: number;
  /** The manuscript preview for this volume. */
  preview: ImportPreview;
  /** Volume number in the series (1-based). User can reorder. */
  volumeNumber: number;
  /** Whether the user has opted to skip importing this volume. */
  skipped: boolean;
};

/** Result of analyzing multiple files for series import. */
export type SeriesImportPreview = {
  /** Detected or user-provided series name. */
  seriesName: string;
  /** All volumes detected from the selected files. */
  volumes: SeriesImportVolume[];
  /** Total word count across all non-skipped volumes. */
  totalWordCount: number;
  /** Total chapter count across all non-skipped volumes. */
  totalChapterCount: number;
};

/** Configuration for committing a series import. User may have edited titles, reordered, etc. */
export type SeriesImportCommitConfig = {
  /** Series name (new series will be created, or existing slug to add to). */
  seriesName: string;
  /** Existing series slug — if set, volumes are added to this series instead of creating new. */
  existingSeriesSlug: string | null;
  /** Author name applied to all volumes. */
  author: string;
  /** The volumes to import (skipped volumes excluded by caller). */
  volumes: Array<{
    volumeNumber: number;
    title: string;
    chapters: DetectedChapter[];
  }>;
};

/** Result of committing a series import. */
export type SeriesImportResult = {
  /** The series slug (created or existing). */
  seriesSlug: string;
  /** The series display name. */
  seriesName: string;
  /** Results for each imported volume. */
  volumeResults: ImportResult[];
  /** Total books imported. */
  totalBooks: number;
  /** Total chapters across all books. */
  totalChapters: number;
  /** Total words across all books. */
  totalWordCount: number;
};
```

### 2. Add ISeriesImportService Interface to `src/domain/interfaces.ts`

Read `src/domain/interfaces.ts`. Add the import for the new types at the top import block:

```typescript
import type {
  // ... existing imports ...
  SeriesImportCommitConfig,
  SeriesImportPreview,
  SeriesImportResult,
} from './types';
```

Add the interface after `ISeriesService` (end of file):

```typescript
export interface ISeriesImportService {
  /**
   * Preview multiple manuscript files for series import.
   *
   * Runs the single-book preview for each file, wraps results as
   * SeriesImportVolume entries, and attempts to detect a common series
   * name from the file names or detected titles.
   *
   * @param filePaths Absolute paths to the source files (.md or .docx)
   */
  preview(filePaths: string[]): Promise<SeriesImportPreview>;

  /**
   * Commit the series import: create each book, create or attach to a
   * series, and link all books as volumes.
   *
   * Books are created in volume order. If any individual book import
   * fails, previously imported books remain (no rollback) and the error
   * is reported in the result.
   */
  commit(config: SeriesImportCommitConfig): Promise<SeriesImportResult>;
}
```

---

## Architecture Compliance

- [x] Domain files import from nothing (types.ts imports nothing, interfaces.ts imports only from types)
- [x] No business logic — pure type declarations and interface contracts
- [x] New types compose existing types (`ImportPreview`, `ImportResult`, `DetectedChapter`)
- [x] No `any` types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. The new types are exported from `src/domain/types.ts`
3. The new interface is exported from `src/domain/interfaces.ts`
4. No circular dependencies introduced

---

## State Update

After completing this session, update `prompts/feature/import-series/STATE.md`:
- Set SESSION-01 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
