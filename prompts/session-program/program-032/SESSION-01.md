# SESSION-01 — ManuscriptView default selection skips draftless chapters

> **Program:** Novel Engine
> **Feature:** fix-phantom-turns-renderer-reads
> **Modules:** M10 (renderer)
> **Depends on:** none
> **Estimated effort:** 15 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | `src/renderer/components/Manuscript/ManuscriptView.tsx` lines 1–180, 320–345 | Default chapter selection logic + `draftPath` derivation | Current effect picks first body chapter regardless of `hasDraft` |
| M10 | `src/renderer/components/Manuscript/ChapterRail.tsx` lines 1–150 | `ChapterInfo` type + `useChapterList` (returns `hasDraft` per chapter) | Need the `hasDraft: boolean` field name and source |
| M10 | `src/renderer/components/common/ProseViewer.tsx` lines 60–110 | `useBookFile` reads file unconditionally | Confirms the IPC read fires even for non-existent drafts |
| M10 | `src/renderer/components/Manuscript/ManuscriptView.test.tsx` | Existing test fixture setup | Tests must still pass; need to add draftless-default-skip test |

## Context

The app log shows repeated `Error: File not found: chapters/NN-slug/draft.md`
IPC errors during auto-draft runs. Root cause: when the Manuscript view is
open, `useChapterList` produces a chapter list and ManuscriptView's default
selection effect (lines 155-162) picks the first body chapter — even one with
`hasDraft: false`. Once selected, `draftPath = chapters/${slug}/draft.md` is
passed to `useBookFile`, which calls `files:read` → IPC handler throws.
Every `fileChangeStore.revision` bump (every agent write) re-triggers this
read and re-logs the error.

`ChapterInfo` from `src/renderer/components/Manuscript/ChapterRail.tsx:11-20`
already has `hasDraft: boolean`. The fix is to prefer chapters that actually
have a draft when picking the default. The user can still click any chapter
in the rail — only the *default* changes.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/renderer/components/Manuscript/ManuscriptView.tsx` | Modify | Default-selection effect prefers body chapters with `hasDraft === true` |
| `src/renderer/components/Manuscript/ManuscriptView.test.tsx` | Modify | Add test verifying draftless chapter is not the default selection |

## Implementation

### 1. Read the affected files

Read fully `src/renderer/components/Manuscript/ManuscriptView.tsx` (lines
1–180 and 320–345), `src/renderer/components/Manuscript/ChapterRail.tsx`
(lines 1–150), and `src/renderer/components/common/ProseViewer.tsx` (lines
60–110) to confirm the field name `hasDraft` and the selection effect's
existing structure.

### 2. Update the default-selection effect

In `src/renderer/components/Manuscript/ManuscriptView.tsx`, find this block
(currently lines 155–162):

```typescript
// Default selection: first body chapter, else first row.
useEffect(() => {
  if (chapters.length === 0) return;
  if (selectedSlug !== null && chapters.some((c) => c.slug === selectedSlug)) return;
  const firstBody = chapters.find((c) => c.kind === 'body');
  setSelectedSlug((firstBody ?? chapters[0]).slug);
  setFileOverride(null);
}, [chapters, selectedSlug]);
```

Replace with logic that prefers a drafted body chapter before falling back:

```typescript
// Default selection: first drafted body chapter. Falls back to first body
// chapter (EMPTY badge in the rail), then first row overall (front matter).
// Preferring drafted chapters avoids repeatedly calling files:read on a
// chapter dir whose draft.md doesn't exist yet (especially during auto-draft
// runs that bump fileChangeStore.revision on every agent write).
useEffect(() => {
  if (chapters.length === 0) return;
  if (selectedSlug !== null && chapters.some((c) => c.slug === selectedSlug)) return;
  const draftedBody = chapters.find((c) => c.kind === 'body' && c.hasDraft);
  const firstBody = chapters.find((c) => c.kind === 'body');
  setSelectedSlug((draftedBody ?? firstBody ?? chapters[0]).slug);
  setFileOverride(null);
}, [chapters, selectedSlug]);
```

### 3. Add a test in ManuscriptView.test.tsx

Open `src/renderer/components/Manuscript/ManuscriptView.test.tsx` and read the
existing setup to mirror its conventions. Add a test that:

1. Mocks the chapter list so the first body chapter has `hasDraft: false` and
   the second body chapter has `hasDraft: true`.
2. Asserts that the reader loads `chapters/NN-second/draft.md` (second
   chapter) as the default instead of `chapters/NN-first/draft.md`.

Look at how existing tests install the `window.novelEngine` mock and provide
chapter directories (the test file already references
`'chapters/01-opening/draft.md'` and `'chapters/02-the-burger/draft.md'` as
content keys). Mirror that pattern.

A sketch (adapt to the actual test helpers the file uses):

```typescript
it('selects the first chapter with a draft as the default, skipping empty ones', async () => {
  // 01-empty has no draft on disk; 02-written does.
  // Provide chapter directory list with hasDraft reflected by file existence.
  render(<ManuscriptView />, { ... });

  // Wait for the reader to load the drafted chapter
  await waitFor(() => {
    expect(/* the prose reader shows "Burger prose." */).toBeInTheDocument();
  });
  // Confirm the empty chapter's draft.md was never requested
  expect(mockFiles.read).not.toHaveBeenCalledWith('book-a', 'chapters/01-empty/draft.md');
});
```

If the existing test file uses a `window.novelEngine` mock where
`files.exists` / `files.read` can return differently per chapter and the
list of chapters with `hasDraft` is determined by the mock's `files.exists`
implementation, set that up. If the existing tests bypass `useChapterList`
by importing chapters directly, follow whatever pattern they use — the
key assertion is that the default-selected slug's `draftPath` is the
drafted one, not the empty one.

If the test harness mocks `useChapterList` directly (not via IPC), use that.

### 4. Do NOT change ChapterTab's selection logic

`src/renderer/components/Workbench/companion/ChapterTab.tsx` has similar
fall-through selection logic (lines 50-66) for the workspace companion tab.
That code already falls back to *chapters with word count > 0* via line
62-64, so draftless chapters are not auto-selected there. Leave it alone —
out of scope. The bug in the crash log is specific to ManuscriptView.

### 5. Do NOT add any `files.exists` check in `useBookFile`

Changing `useBookFile` to pre-check existence would add an extra IPC round
trip on every read. The default-selection fix already eliminates the
spurious reads. `useBookFile` should remain a dumb read-and-display hook.

## Verification

1. `npx tsc --noEmit` — no type errors (new effect body and test are TS-clean).
2. `npm test -- src/renderer/components/Manuscript/ManuscriptView.test.tsx`
   — new test passes; all existing tests in the file still pass.
3. `npm test` — full suite green (no regressions in code that imports
   ManuscriptView or the chapter list).
4. Manual test (optional, can be verified by the existing IPC-error absence):
   - Run `npm start`, open a book with at least one chapter dir that has no
     `draft.md` and one that does, navigate to Manuscript, and confirm the
     reader opens the drafted chapter without console errors about
     `File not found`.
   - Run auto-draft on a book with several empty chapter dirs and a few
     drafted ones — the main-process log should no longer contain
     `Error: File not found: chapters/.../draft.md` lines for the current
     selection on every revision bump.

## State Update

Update `prompts/session-program/program-032/STATE.md`:
- SESSION-01 → done, set `Completed` date.
- Handoff: "ManuscriptView's default-selection effect now prefers chapters
  with `hasDraft === true`. Eliminates the repeated
  `files:read` → `File not found` IPC errors during auto-draft. Added
  regression test. No public API change; no architecture impact; unrelated
  to SESSION-02's OllamaCodeClient work."