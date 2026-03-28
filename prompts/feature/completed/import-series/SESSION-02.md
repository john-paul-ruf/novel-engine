# SESSION-02 — SeriesImportService (Application Layer)

> **Feature:** import-series
> **Layer(s):** Application
> **Depends on:** SESSION-01
> **Estimated effort:** 20 min

---

## Context

SESSION-01 added domain types (`SeriesImportPreview`, `SeriesImportCommitConfig`, `SeriesImportResult`) and the `ISeriesImportService` interface. This session implements the application service that orchestrates the multi-book import + series creation flow.

The service composes two existing interfaces: `IManuscriptImportService` (for individual book preview/commit) and `ISeriesService` (for series creation + volume linking). It does not import any concrete infrastructure classes.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/application/SeriesImportService.ts` | Create | Implements `ISeriesImportService` |

---

## Implementation

### 1. Create `src/application/SeriesImportService.ts`

Read `src/domain/interfaces.ts` and `src/domain/types.ts` to confirm the interface signatures.

```typescript
import type {
  ISeriesImportService,
  IManuscriptImportService,
  ISeriesService,
} from '@domain/interfaces';
import type {
  SeriesImportPreview,
  SeriesImportCommitConfig,
  SeriesImportResult,
  SeriesImportVolume,
  ImportResult,
} from '@domain/types';

/**
 * SeriesImportService — Orchestrates importing multiple manuscripts as a series.
 *
 * Delegates individual book imports to IManuscriptImportService and series
 * management to ISeriesService. This service handles:
 * - Batch preview of multiple files
 * - Common series name detection from file names
 * - Sequential book creation + series volume linking
 */
export class SeriesImportService implements ISeriesImportService {
  constructor(
    private manuscriptImport: IManuscriptImportService,
    private series: ISeriesService,
  ) {}

  async preview(filePaths: string[]): Promise<SeriesImportPreview> {
    if (filePaths.length === 0) {
      throw new Error('No files selected for series import');
    }

    // Preview each file individually
    const volumes: SeriesImportVolume[] = [];

    for (let i = 0; i < filePaths.length; i++) {
      try {
        const preview = await this.manuscriptImport.preview(filePaths[i]);
        volumes.push({
          index: i,
          preview,
          volumeNumber: i + 1,
          skipped: false,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to preview file "${filePaths[i]}": ${message}`);
      }
    }

    // Detect a common series name from the file titles
    const seriesName = this.detectSeriesName(
      volumes.map((v) => v.preview.detectedTitle),
      filePaths,
    );

    const activeVolumes = volumes.filter((v) => !v.skipped);
    const totalWordCount = activeVolumes.reduce((sum, v) => sum + v.preview.totalWordCount, 0);
    const totalChapterCount = activeVolumes.reduce((sum, v) => sum + v.preview.chapters.length, 0);

    return {
      seriesName,
      volumes,
      totalWordCount,
      totalChapterCount,
    };
  }

  async commit(config: SeriesImportCommitConfig): Promise<SeriesImportResult> {
    if (config.volumes.length === 0) {
      throw new Error('No volumes to import');
    }

    // 1. Create or resolve the series
    let seriesSlug: string;
    let seriesName: string;

    if (config.existingSeriesSlug) {
      const existing = await this.series.getSeries(config.existingSeriesSlug);
      if (!existing) {
        throw new Error(`Series "${config.existingSeriesSlug}" not found`);
      }
      seriesSlug = existing.slug;
      seriesName = existing.name;
    } else {
      const created = await this.series.createSeries(config.seriesName);
      seriesSlug = created.slug;
      seriesName = created.name;
    }

    // 2. Import each volume sequentially and link to series
    const volumeResults: ImportResult[] = [];
    const sortedVolumes = [...config.volumes].sort((a, b) => a.volumeNumber - b.volumeNumber);

    for (const volume of sortedVolumes) {
      try {
        const result = await this.manuscriptImport.commit({
          title: volume.title,
          author: config.author,
          chapters: volume.chapters,
        });

        // Link the imported book to the series
        await this.series.addVolume(seriesSlug, result.bookSlug, volume.volumeNumber);
        volumeResults.push(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to import volume ${volume.volumeNumber} "${volume.title}": ${message}`,
        );
      }
    }

    const totalChapters = volumeResults.reduce((sum, r) => sum + r.chapterCount, 0);
    const totalWordCount = volumeResults.reduce((sum, r) => sum + r.totalWordCount, 0);

    return {
      seriesSlug,
      seriesName,
      volumeResults,
      totalBooks: volumeResults.length,
      totalChapters,
      totalWordCount,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Attempt to detect a common series name from detected titles.
   *
   * Strategy:
   * 1. Find the longest common prefix among all titles (trimmed of trailing
   *    punctuation, numbers, and connector words like "Book", "Vol", etc.)
   * 2. If that produces a reasonable string (>= 3 chars), use it
   * 3. Otherwise try to find a common parent directory name from file paths
   * 4. Fall back to "Imported Series"
   */
  private detectSeriesName(titles: string[], filePaths: string[]): string {
    // Try common prefix from titles
    const cleanTitles = titles
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (cleanTitles.length >= 2) {
      const prefix = this.longestCommonPrefix(cleanTitles);
      // Strip trailing noise: numbers, "Book", "Vol", "Volume", punctuation, whitespace
      const cleaned = prefix
        .replace(/[\s:\u2014\u2013\-,]+$/, '')
        .replace(/\b(book|vol|volume|part|chapter)\s*\d*\s*$/i, '')
        .replace(/[\s:\u2014\u2013\-,]+$/, '')
        .trim();

      if (cleaned.length >= 3) {
        return cleaned;
      }
    }

    // Try common parent directory
    if (filePaths.length >= 2) {
      const dirNames = filePaths.map((fp) => {
        const parts = fp.replace(/\\/g, '/').split('/');
        return parts.length >= 2 ? parts[parts.length - 2] : '';
      });

      const uniqueDirs = new Set(dirNames.filter((d) => d.length > 0));
      if (uniqueDirs.size === 1) {
        const dirName = [...uniqueDirs][0];
        // Convert kebab/snake case to title case
        const titleCased = dirName
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        if (titleCased.length >= 3) {
          return titleCased;
        }
      }
    }

    return 'Imported Series';
  }

  private longestCommonPrefix(strings: string[]): string {
    if (strings.length === 0) return '';
    let prefix = strings[0];
    for (let i = 1; i < strings.length; i++) {
      while (!strings[i].startsWith(prefix)) {
        prefix = prefix.slice(0, -1);
        if (prefix.length === 0) return '';
      }
    }
    return prefix;
  }
}
```

**Key design decisions:**

- **Sequential import**: Books are imported one at a time to avoid overwhelming the filesystem. If one fails, previously imported books remain (partial success is better than total rollback for large series).
- **Series name detection**: Uses longest-common-prefix of detected titles, then falls back to parent directory name, then to "Imported Series". This handles common patterns like "The Stormlight Archive: Book 1", "The Stormlight Archive: Book 2", etc.
- **Volume ordering**: The `commit` sorts by `volumeNumber` before importing so series order is correct regardless of the order files were selected.
- **No direct infra imports**: Depends only on `IManuscriptImportService` and `ISeriesService` interfaces.

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages
- [x] Application imports only from domain interfaces (not concrete classes)
- [x] IPC handlers are one-liner delegations (not yet wired — SESSION-03)
- [x] All async operations have error handling
- [x] No `any` types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `SeriesImportService` implements all methods from `ISeriesImportService`
3. No imports from infrastructure or main layers
4. All methods have try/catch error handling

---

## State Update

After completing this session, update `prompts/feature/import-series/STATE.md`:
- Set SESSION-02 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
