# SESSION-02 — Chapter Detection & ManuscriptImportService

> **Feature:** manuscript-import
> **Layer(s):** Application
> **Depends on:** SESSION-01
> **Estimated effort:** 30 min

---

## Context

SESSION-01 added domain types (`DetectedChapter`, `ImportPreview`, `ImportCommitConfig`, `ImportResult`) and the `IManuscriptImportService` interface. This session implements the core import logic:

1. **ChapterDetector** — a pure utility that takes a markdown string and returns detected chapter boundaries using pattern matching (headings, "Chapter N" patterns, scene breaks).
2. **ManuscriptImportService** — orchestrates the full import flow: reads the source file, converts DOCX to Markdown via the bundled Pandoc binary, runs chapter detection, and commits the import by creating the book directory structure.

Both files live in `src/application/` and follow the established pattern: they depend on domain interfaces (never concrete classes), and the import service receives its dependencies via constructor injection.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/application/import/ChapterDetector.ts` | Create | Pure chapter detection utility with pattern matching |
| `src/application/ManuscriptImportService.ts` | Create | Implements `IManuscriptImportService` — preview, convert, commit |

---

## Implementation

### 1. Create `src/application/import/ChapterDetector.ts`

This is a pure utility module — no class, no dependencies. It exports a single function that takes a markdown string and returns an array of `DetectedChapter` objects plus an `ambiguous` flag.

**Detection strategy (in priority order):**

1. **Markdown headings** — Lines matching `^#{1,2}\s+(.+)$`. Split on each heading. If ≥ 3 heading-based chapters are found, use this strategy.
2. **"Chapter N" patterns** — Lines matching `^Chapter\s+(\d+|[A-Z][a-z]+)\b` (case-insensitive) or `^CHAPTER\s+`. If ≥ 3 matches, use this strategy.
3. **Part markers** — Lines matching `^Part\s+([IVXLC]+|\d+|[A-Z][a-z]+)\b` (case-insensitive). These are detected but treated as chapter dividers.
4. **Fallback** — If no pattern produces ≥ 3 chapters, treat the entire document as a single chapter.

**Ambiguity detection:**
- Set `ambiguous = true` if:
  - Fewer than 3 chapters detected for a document with > 10,000 words
  - Any chapter has > 5× the word count of the smallest chapter (wildly uneven splits)
  - The detection used the fallback (single chapter)

**Title extraction:**
- From headings: use the heading text
- From "Chapter N": use "Chapter N" followed by any subtitle on the same line
- From fallback: "Chapter 1"

**Implementation details:**

```typescript
import type { DetectedChapter } from '@domain/types';

type DetectionResult = {
  chapters: DetectedChapter[];
  ambiguous: boolean;
};

export function detectChapters(markdown: string): DetectionResult {
  const lines = markdown.split('\n');
  
  // Try heading-based detection first
  const headingResult = detectByHeadings(lines);
  if (headingResult.length >= 3) {
    return buildResult(headingResult, lines);
  }
  
  // Try "Chapter N" pattern
  const chapterResult = detectByChapterPattern(lines);
  if (chapterResult.length >= 3) {
    return buildResult(chapterResult, lines);
  }
  
  // Fallback: entire document as one chapter
  return buildFallbackResult(lines);
}

export function detectTitle(markdown: string): string {
  // First line that's a heading
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? '';
}

export function detectAuthor(markdown: string): string {
  // Look for "by Author Name" or "Author: Name" patterns
  const byMatch = markdown.match(/^(?:by|author:?)\s+(.+)$/im);
  return byMatch?.[1]?.trim() ?? '';
}
```

The helper functions `detectByHeadings`, `detectByChapterPattern`, `buildResult`, and `buildFallbackResult` handle the actual pattern matching and chapter boundary construction. Each returns split points (line numbers) that are then used to extract content and compute word counts.

**Key implementation rules:**
- Each `DetectedChapter.content` contains the full text from `startLine` to `endLine` (exclusive), including the heading line itself.
- Word count uses the same simple heuristic as `FileSystemService`: `text.split(/\s+/).filter(Boolean).length`.
- Chapter `index` is 0-based and sequential.
- Chapter `title` strips any leading `#` characters and whitespace.

### 2. Create `src/application/ManuscriptImportService.ts`

This service implements `IManuscriptImportService` and orchestrates the import flow.

**Constructor dependencies:**

```typescript
import type { IFileSystemService, IManuscriptImportService } from '@domain/interfaces';
import type { ImportPreview, ImportCommitConfig, ImportResult, ImportSourceFormat } from '@domain/types';
import { detectChapters, detectTitle, detectAuthor } from './import/ChapterDetector';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

export class ManuscriptImportService implements IManuscriptImportService {
  constructor(
    private fileSystem: IFileSystemService,
    private pandocPath: string,
  ) {}
```

Note: This service imports `child_process` and `fs` directly because file reading and DOCX conversion are inherently system operations (same exception as `BuildService`).

**`preview(filePath: string)` method:**

1. Determine the source format from the file extension (`.md` → `'markdown'`, `.docx` → `'docx'`). Throw if neither.
2. Read the file:
   - For markdown: `fs.readFile(filePath, 'utf-8')`
   - For DOCX: run `pandoc -f docx -t markdown --wrap=none {filePath}` and capture stdout. Use `this.pandocPath` as the binary path. If Pandoc fails, throw with a descriptive error.
3. Run `detectChapters(markdownContent)` to get chapters and ambiguity flag.
4. Run `detectTitle(markdownContent)` and `detectAuthor(markdownContent)`.
5. Compute `totalWordCount` as the sum of all chapter word counts.
6. Return the `ImportPreview` object.

**`commit(config: ImportCommitConfig)` method:**

1. Create the book using `this.fileSystem.createBook(config.title, config.author)`. This creates the directory structure, about.json, and front matter chapters.
2. For each chapter in `config.chapters`:
   - Compute the chapter slug: `String(chapter.index + 1).padStart(2, '0')` + `-` + slugified chapter title.
   - Write `chapters/{slug}/draft.md` with `chapter.content`.
3. Update the book status to `'first-draft'` via `this.fileSystem.updateBookMeta(slug, { status: 'first-draft' })`.
4. Compute and return the `ImportResult`.

**Slug generation for chapters:**
Use a simple slugify: lowercase, replace spaces with hyphens, strip non-alphanumeric characters, collapse multiple hyphens.

```typescript
private slugifyChapterTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'untitled';
}
```

---

## Architecture Compliance

- [ ] Domain files import from nothing
- [x] Application imports only from domain interfaces (not concrete classes)
- [x] `ManuscriptImportService` depends on `IFileSystemService` interface, not `FileSystemService`
- [x] `ChapterDetector` is a pure utility with zero infrastructure dependencies
- [x] `child_process` import is justified (same exception as `BuildService` — system operation)
- [x] All async operations have error handling
- [x] No `any` types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `ChapterDetector` correctly detects chapters in a markdown string with `# Chapter` headings
3. `ChapterDetector` correctly detects "Chapter N" patterns without markdown headings
4. `ChapterDetector` falls back to single chapter when no patterns are found
5. `ChapterDetector` sets `ambiguous = true` for single-chapter fallback on long documents
6. `ManuscriptImportService` implements all methods of `IManuscriptImportService`

---

## State Update

After completing this session, update `prompts/feature/manuscript-import/STATE.md`:
- Set SESSION-02 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
