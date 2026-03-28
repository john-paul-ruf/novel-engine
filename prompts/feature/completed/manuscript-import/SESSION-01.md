# SESSION-01 — Domain Types & Interface for Manuscript Import

> **Feature:** manuscript-import
> **Layer(s):** Domain
> **Depends on:** Nothing
> **Estimated effort:** 10 min

---

## Context

This is the first session of the manuscript import feature. Users with an existing manuscript (a single Markdown or DOCX file) need to import it into Novel Engine, splitting it into chapters and setting up the full book structure. This avoids forcing everyone through the Spark pitch flow — some writers have a 60,000-word draft ready to enter the editorial pipeline.

We need domain types for the import flow: representing detected chapters, the preview before committing, the user's configuration choices, and the import result. We also need a service interface that the application layer will implement.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | Modify | Add import-related types: `ImportSourceFormat`, `DetectedChapter`, `ImportPreview`, `ImportCommitConfig`, `ImportResult` |
| `src/domain/interfaces.ts` | Modify | Add `IManuscriptImportService` interface |

---

## Implementation

### 1. Add import types to `src/domain/types.ts`

Read `src/domain/types.ts`. Append the following types after the `// === Motif Ledger ===` section (at the end of the file):

```typescript
// === Manuscript Import ===

export type ImportSourceFormat = 'markdown' | 'docx';

export type DetectedChapter = {
  index: number;
  title: string;
  startLine: number;
  endLine: number;
  wordCount: number;
  content: string;
};

export type ImportPreview = {
  sourceFile: string;
  sourceFormat: ImportSourceFormat;
  markdownContent: string;
  chapters: DetectedChapter[];
  totalWordCount: number;
  detectedTitle: string;
  detectedAuthor: string;
  ambiguous: boolean;
};

export type ImportCommitConfig = {
  title: string;
  author: string;
  chapters: DetectedChapter[];
};

export type ImportResult = {
  bookSlug: string;
  title: string;
  chapterCount: number;
  totalWordCount: number;
};
```

### 2. Add import types to the `interfaces.ts` import list

Read `src/domain/interfaces.ts`. Add the new types to the existing import block at the top of the file:

```typescript
import type {
  // ... existing imports ...
  ImportPreview,
  ImportCommitConfig,
  ImportResult,
} from './types';
```

### 3. Add `IManuscriptImportService` interface to `src/domain/interfaces.ts`

Append the interface after the existing `IVersionService` interface at the end of the file:

```typescript
export interface IManuscriptImportService {
  /**
   * Read a manuscript file, convert from DOCX if needed, detect chapter
   * boundaries, and return a preview for user review before committing.
   *
   * @param filePath Absolute path to the source file (.md or .docx)
   */
  preview(filePath: string): Promise<ImportPreview>;

  /**
   * Commit the import: create the book directory structure, write each
   * chapter as a separate draft.md file, populate about.json, and set
   * the book status to 'first-draft'.
   *
   * The chapters array may have been edited by the user (renamed, merged,
   * reordered) compared to what preview() originally returned.
   */
  commit(config: ImportCommitConfig): Promise<ImportResult>;
}
```

---

## Architecture Compliance

- [x] Domain files import from nothing (types.ts has zero imports; interfaces.ts imports only from `./types`)
- [x] No business logic — pure type and interface declarations
- [x] No `any` types
- [x] All new types follow existing naming conventions (PascalCase types in camelCase groups)

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. New types are exported via `src/domain/index.ts` (which already re-exports `* from './types'` and `* from './interfaces'`)
3. `ImportPreview` has all fields needed for the chapter preview UI
4. `IManuscriptImportService` has both `preview` and `commit` methods

---

## State Update

After completing this session, update `prompts/feature/manuscript-import/STATE.md`:
- Set SESSION-01 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
