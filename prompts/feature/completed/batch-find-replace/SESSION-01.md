# SESSION-01 — Domain: Find & Replace Types and Service Interface

> **Feature:** batch-find-replace
> **Layer(s):** Domain
> **Depends on:** Nothing
> **Estimated effort:** 15 min

---

## Context

This is the first session for the batch find & replace feature. No prior sessions exist.

The feature allows authors to search across all chapter drafts in a manuscript and replace text in bulk — for example, when a character's name changes across 80 chapters. The operation must be safe: every replacement creates a version snapshot so the author can revert if the replace was too aggressive.

This session adds the domain types and the `IFindReplaceService` interface that subsequent sessions will implement, wire, and render.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | Modify | Append 6 new types under a new `// === Find & Replace ===` section |
| `src/domain/interfaces.ts` | Modify | Add `IFindReplaceService` interface; add 3 type imports |

---

## Implementation

### 1. Add types to `src/domain/types.ts`

Read `src/domain/types.ts` first. Append the following new section at the very end of the file, after the `// === Guided Tour ===` section:

```typescript
// === Find & Replace ===

/**
 * Options controlling matching behaviour for a find-replace operation.
 */
export type FindReplaceOptions = {
  caseSensitive: boolean;
  useRegex: boolean;
};

/**
 * One occurrence of the search term within a file.
 * Line numbers are 1-based. Column offsets are 0-based within lineText.
 */
export type FindReplaceMatchLocation = {
  lineNumber: number;
  lineText: string;   // the full line containing the match
  matchStart: number; // 0-based column of match start within lineText
  matchEnd: number;   // 0-based column of match end (exclusive) within lineText
};

/**
 * Per-file summary returned by the preview call.
 * `matches` is capped at 20 entries for UI display; `matchCount` is the
 * exact total (may be higher than matches.length).
 */
export type FindReplacePreviewItem = {
  filePath: string;                    // relative to book root, e.g. "chapters/01-foo/draft.md"
  matchCount: number;
  matches: FindReplaceMatchLocation[]; // up to 20 sample locations
};

/**
 * Full result of a preview scan across all chapter drafts.
 */
export type FindReplacePreviewResult = {
  items: FindReplacePreviewItem[];
  totalMatchCount: number;
  searchTerm: string;
  options: FindReplaceOptions;
};

/**
 * Summary returned after applying replacements.
 */
export type FindReplaceApplyResult = {
  filesChanged: number;
  totalReplacements: number;
  details: { filePath: string; replacements: number }[];
};
```

### 2. Add `IFindReplaceService` to `src/domain/interfaces.ts`

Read `src/domain/interfaces.ts` first.

**Step A:** Find the existing `import type { ... } from './types'` block at the top of the file. Add the following three types to it:
- `FindReplaceApplyResult`
- `FindReplaceOptions`
- `FindReplacePreviewResult`

Keep the import list sorted alphabetically within the block for consistency.

**Step B:** Append the following interface at the end of the file, after `IHelperService`:

```typescript
export interface IFindReplaceService {
  /**
   * Scan all chapter draft.md files in a book for occurrences of `searchTerm`.
   *
   * Scopes exclusively to `chapters/<slug>/draft.md` files. Returns a per-file
   * summary with exact match counts and up to 20 sample match locations per
   * file (for UI display).
   *
   * Throws if `searchTerm` is empty, or if `useRegex` is true and the
   * pattern is syntactically invalid.
   */
  preview(
    bookSlug: string,
    searchTerm: string,
    options: FindReplaceOptions,
  ): Promise<FindReplacePreviewResult>;

  /**
   * Apply find-replace to the specified files.
   *
   * For each file in `filePaths`:
   * 1. Read current content from disk.
   * 2. Snapshot the pre-replace content via IVersionService (source='user').
   * 3. Apply all replacements using the same regex built from `searchTerm` + `options`.
   * 4. Write the updated content.
   *
   * Files where no matches are found are silently skipped (not counted in
   * `filesChanged`, not included in `details`).
   *
   * Throws if `searchTerm` is empty or if `useRegex` is true and the pattern
   * is syntactically invalid.
   */
  apply(params: {
    bookSlug: string;
    searchTerm: string;
    replacement: string;
    filePaths: string[];
    options: FindReplaceOptions;
  }): Promise<FindReplaceApplyResult>;
}
```

---

## Architecture Compliance

- [x] Domain files import from nothing external — `interfaces.ts` imports only from `'./types'`
- [x] All types are pure data shapes — no functions, no classes, no runtime values
- [x] `IFindReplaceService` uses only types defined in `types.ts` (no circular deps)
- [x] No `any` types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `grep -n "IFindReplaceService" src/domain/interfaces.ts` returns the new interface declaration
3. `grep -n "FindReplaceOptions\|FindReplacePreviewItem\|FindReplaceMatchLocation\|FindReplacePreviewResult\|FindReplaceApplyResult" src/domain/types.ts` returns all 5 new types
4. `grep "FindReplaceOptions\|FindReplaceApplyResult\|FindReplacePreviewResult" src/domain/interfaces.ts` shows the 3 types imported at the top

---

## State Update

After completing this session, update `prompts/feature/batch-find-replace/STATE.md`:
- Set SESSION-01 status to `done`
- Set Completed date to today
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
