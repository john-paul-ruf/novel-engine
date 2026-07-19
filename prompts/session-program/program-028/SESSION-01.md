# SESSION-01 — ChapterDetector three-heuristic fix + test flip + regressions

> **Program:** Novel Engine
> **Feature:** chapter-detector-heuristics
> **Modules:** M08 (application — `src/application/import/ChapterDetector.ts`) + M16 (shared fixtures)
> **Depends on:** nothing
> **Estimated effort:** ~25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M08 | `src/application/import/ChapterDetector.ts` | Full (223 lines) | All three heuristics live here — `detectByChapterPattern`, `detectByHeadings`, `buildResult`, `detectAmbiguity` |
| M16 | `src/application/import/ChapterDetector.test.ts` | Full (137 lines) | Three pinned limitation tests flip; new regression tests are added here |
| M16 | `src/test/fixtures/manuscripts.ts` | Full (68 lines) | Existing fixtures `NUMBERED_CHAPTERS`, `BOLD_WORD_CHAPTERS`, `HEADING_CHAPTERS`, `NO_CHAPTERS` — add two new ones |
| — | `prompts/session-program/program-028/input-files/DESIGN_DECISIONS.md` | Full | The three user-confirmed decisions — these are the contract |
| M01 | `src/domain/types.ts` lines 733-740 | `DetectedChapter` shape | Confirm `index: number` accepts `-1` (it does) — NO type change |

## Context

`detectChapters` (`src/application/import/ChapterDetector.ts:25`) tries three strategies in order:
chapter-pattern (≥3 matches) → headings (≥3 matches) → single-chapter fallback. Program-026
SESSION-19 pinned THREE known heuristic bugs as test-asserted limitations:

1. **Mid-prose false splits** — `CHAPTER_PATTERN` (line 78) matches any line *starting* with
   `Chapter N`, so `Chapter 3 was her favorite…` becomes a chapter. Pinned at
   `ChapterDetector.test.ts:66-84`.
2. **Title-page `#` counted as chapter 1** — `HEADING_PATTERN` (line 75) matches every `#`/`##`
   line, so the title-page `# Étoiles Mortes` in `HEADING_CHAPTERS` is chapter 1 of 4. Pinned at
   `ChapterDetector.test.ts:88-95`.
3. **Pre-split content dropped** — `buildResult` starts each chapter at `splits[i].lineIndex`;
   everything before the first split (title page, byline, copyright, dedication) is discarded.
   Pinned at `ChapterDetector.test.ts:34-35`.

This session applies the three user-confirmed fixes from `DESIGN_DECISIONS.md`, flips those three
pinned tests to assert the new correct behavior, and adds regression tests for each decision plus
the two edge cases (H1-only manuscript; first-split-at-line-0 emits no Front Matter).

Downstream consumers (`ManuscriptImportService`, `importStore`, `ImportWizard`,
`ChapterPreviewList`, IPC handlers) are index-blind beyond array position and need NO changes
this session — SESSION-02 adjusts one `preview.chapters.length` assertion in
`ManuscriptImportService.test.ts` and runs docs.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/application/import/ChapterDetector.ts` | Modify | Add `isStandaloneHeading` guard to chapter/section/part detection; add title-page H1 skip in `detectByHeadings`; prepend Front Matter pseudo-chapter in `buildResult`; exclude `index < 0` from `detectAmbiguity` |
| `src/application/import/ChapterDetector.test.ts` | Modify | Flip three limitation tests; add 5 regression tests (one per decision + two edge cases) |
| `src/test/fixtures/manuscripts.ts` | Modify | Add `H1_ONLY_CHAPTERS` (decision-2 fallback regression) and `MID_PROSE_FALSE_POSITIVE` (the current line 67-74 inline string — promote to a fixture for clarity) |

## Implementation

### 1. Read everything in Module Context first

Read the three source files end-to-end. The test file at `ChapterDetector.test.ts:66-84` and
`:88-95` and `:33-35` is the contract you are about to flip — read those tests BEFORE editing
the source so you understand exactly which assertion changes.

### 2. Standalone-heading guard (Decision 1)

In `src/application/import/ChapterDetector.ts`, add a helper near `stripBold`:

```ts
function isStandaloneHeading(lines: string[], index: number): boolean {
  if (index === 0) return true;
  const prev = lines[index - 1].trim();
  return prev === '';
}
```

In `detectByChapterPattern` (lines 121-154), gate EACH of the three match branches (`chapterMatch`,
`sectionMatch`, `partMatch`) with `isStandaloneHeading(lines, i)`. The cleanest form:

```ts
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!isStandaloneHeading(lines, i)) {
    continue;
  }
  const chapterMatch = line.match(CHAPTER_PATTERN);
  if (chapterMatch) {
    // ... existing body unchanged
    continue;
  }
  // ... sectionMatch and partMatch branches unchanged
}
```

This preserves tail content after the label (`Chapter 3: The Reveal` still splits — the colon and
title are in the matched line). It only rejects matches whose previous line is non-blank — i.e.
prose-embedded mentions. Section/Part patterns get the same guard for consistency.

**Effect on `NUMBERED_CHAPTERS`:** unchanged — every `Prologue`/`Chapter N`/`Epilogue` is
already preceded by a blank line. **Effect on `BOLD_WORD_CHAPTERS`:** unchanged — every
`**PROLOGUE**`/`**Chapter One**` is preceded by a blank line.

### 3. Title-page H1 skip (Decision 2)

Rewrite `detectByHeadings` (lines 108-119):

```ts
function detectByHeadings(lines: string[]): SplitPoint[] {
  const raw: SplitPoint[] = [];
  let firstHeadingIsH1 = false;
  let hasH2 = false;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(HEADING_PATTERN);
    if (!match) continue;
    const isH1 = /^#\s+/.test(lines[i]);
    if (raw.length === 0 && isH1) firstHeadingIsH1 = true;
    if (!isH1) hasH2 = true;
    raw.push({ lineIndex: i, title: match[1].trim() });
  }

  if (firstHeadingIsH1 && hasH2) {
    // Skip the title-page H1 — first chapter is the first H2.
    return raw.slice(1);
  }
  return raw;
}
```

`HEADING_PATTERN` already accepts H1 and H2; the `isH1` check distinguishes them by re-matching
the stricter `^#\s+/` (single `#`). `firstHeadingIsH1` is only set when the very first heading in
the document is an H1; if any later heading is an H2, the first H1 is dropped. If no H2 appears
(H1-only manuscript), `hasH2` stays false and all H1s are kept — preserves the previous behavior
for that shape.

**Effect on `HEADING_CHAPTERS`:** the `# Étoiles Mortes` title page is skipped; chapters become
`['La Chute', 'Der Aufstieg', '帰還']` (3, not 4). The fixture's `#` is the first heading AND at
least one `##` follows, so both conditions are met.

### 4. Front Matter pseudo-chapter (Decision 3)

Rewrite `buildResult` (lines 160-181) to prepend a Front Matter entry when the first split is not
at line 0. The chapter-loop body is otherwise unchanged; only the preamble is new.

```ts
function buildResult(splits: SplitPoint[], lines: string[]): DetectionResult {
  const chapters: DetectedChapter[] = [];

  if (splits.length > 0 && splits[0].lineIndex > 0) {
    const endLine = splits[0].lineIndex;
    const fmContent = lines.slice(0, endLine).join('\n');
    chapters.push({
      index: -1,
      title: 'Front Matter',
      startLine: 0,
      endLine,
      wordCount: countWords(fmContent),
      content: fmContent,
    });
  }

  for (let i = 0; i < splits.length; i++) {
    const startLine = splits[i].lineIndex;
    const endLine = i + 1 < splits.length ? splits[i + 1].lineIndex : lines.length;
    const content = lines.slice(startLine, endLine).join('\n');
    chapters.push({
      index: i,
      title: splits[i].title,
      startLine,
      endLine,
      wordCount: countWords(content),
      content,
    });
  }

  const ambiguous = detectAmbiguity(chapters, lines);
  return { chapters, ambiguous };
}
```

The Front Matter entry is the FIRST entry of the returned `chapters` array. Its `index` is `-1`;
the "real" chapters keep their original indices `0..N-1`. `importStore` re-numbers via
`map((ch, i) => ({ ...ch, index: i }))` on edit, so the user can merge/remove the Front Matter row
just like any other chapter and the indices stay consistent.

If `splits[0].lineIndex === 0` (the first heading is the very first line), NO Front Matter entry
is emitted — the synthetic chapter would have zero content.

### 5. Excluded from ambiguity math

Rewrite `detectAmbiguity` (lines 202-222) to filter out the Front Matter entry before evaluating
both rules. The signature is unchanged; `chapters` simply includes a possible `index: -1` entry
that must be ignored.

```ts
function detectAmbiguity(chapters: DetectedChapter[], lines: string[]): boolean {
  const realChapters = chapters.filter((c) => c.index >= 0);
  const totalWords = countWords(lines.join('\n'));
  if (realChapters.length < 3 && totalWords > 10_000) return true;

  if (realChapters.length >= 2) {
    const wordCounts = realChapters.map((c) => c.wordCount).filter((w) => w > 0);
    if (wordCounts.length >= 2) {
      const smallest = Math.min(...wordCounts);
      const largest = Math.max(...wordCounts);
      if (smallest > 0 && largest > 5 * smallest) return true;
    }
  }
  return false;
}
```

### 6. Add fixtures

In `src/test/fixtures/manuscripts.ts`, append two new exports:

```ts
/** H1-only manuscript (no H2 headings) — every H1 is a chapter (Decision 2 fallback). */
export const H1_ONLY_CHAPTERS = [
  '# Book One',
  'First chapter prose here.',
  '',
  '# Book Two',
  'Second chapter prose here.',
  '',
  '# Book Three',
  'Third chapter prose here.',
].join('\n');

/** Manuscript with a prose line that STARTS with "Chapter N" — must NOT split (Decision 1). */
export const MID_PROSE_FALSE_POSITIVE = [
  'Chapter 1',
  'Opening prose.',
  'Chapter 3 was her favorite of all the rooms in the house.',
  '',
  'Chapter 2',
  'More prose.',
].join('\n');
```

`MID_PROSE_FALSE_POSITIVE` mirrors the inline string at the current
`ChapterDetector.test.ts:67-74`. Promoting it to a fixture keeps the test file readable and lets
the regression test reference it by name.

### 7. Flip the three pinned limitation tests + add regressions

Open `src/application/import/ChapterDetector.test.ts`. Update the file header comment (lines 1-10)
to reflect the new coverage. Then:

**Flip A — test at lines 21-40 (`'splits bare Chapter N manuscripts … dropping leading front
matter'`):** The test currently asserts `chapters.map(c => c.title) === ['Prologue', 'Chapter 1',
'Chapter 2', 'Chapter 3', 'Epilogue']` and that `by Jane Author` is dropped. Under the new
behavior, a Front Matter entry is PREPENDED. Change the assertion to:

```ts
expect(chapters.map((c) => c.title)).toEqual([
  'Front Matter',
  'Prologue',
  'Chapter 1',
  'Chapter 2',
  'Chapter 3',
  'Epilogue',
]);
expect(chapters[0].index).toBe(-1);
expect(chapters[0].title).toBe('Front Matter');
expect(chapters[0].content).toContain('by Jane Author'); // now captured, not dropped
expect(chapters.slice(1).map((c) => c.index)).toEqual([0, 1, 2, 3, 4]);
```

**Flip B — test at lines 66-84 (`'LIMITATION: prose lines beginning with "Chapter N" are
false-positive splits'`):** Rename it and invert the assertion. Under the new guard, the
mid-prose line is NOT a split, so the document has two real chapters plus a Front Matter entry:

```ts
it('rejects mid-prose lines beginning with "Chapter N" (standalone-heading guard)', () => {
  const { chapters } = detectChapters(MID_PROSE_FALSE_POSITIVE);
  expect(chapters.map((c) => c.title)).toEqual([
    'Front Matter',
    'Chapter 1',
    'Chapter 2',
  ]);
  // The prose sentence is part of Chapter 1's content, not its own split
  expect(chapters[1].content).toContain('Chapter 3 was her favorite');
});
```

Use the new `MID_PROSE_FALSE_POSITIVE` fixture import.

**Flip C — test at lines 88-95 (`'uses #/## headings (unicode-safe) when chapter patterns are
scarce'`):** The title-page `# Étoiles Mortes` is now skipped; chapters are the three `##`
headings. Front Matter is captured because the first split (`# Étoiles Mortes` is filtered BEFORE
buildResult sees the splits — verify this in the implementation; the skipped H1 is not in the
splits array, so the first remaining split is `## La Chute` which is at `lineIndex > 0`, so Front
Matter IS emitted and contains the title-page heading text).

```ts
expect(chapters.map((c) => c.title)).toEqual([
  'Front Matter',
  'La Chute',
  'Der Aufstieg',
  '帰還',
]);
expect(chapters[0].content).toContain('# Étoiles Mortes'); // title page captured as Front Matter
expect(ambiguous).toBe(false);
```

Re-read the implementation note: in step 3 the skipped H1 is removed from `splits` BEFORE
`buildResult` runs, so the Front Matter entry spans from line 0 to `## La Chute`'s line index.
That includes the title-page `# Étoiles Mortes`, the blank line, and `Author: Aya Grün`. Correct.

**Add D — H1-only regression (Decision 2 fallback):** New test. H1-only manuscript keeps all H1s
as splits; the first H1 is NOT skipped (no H2 to trigger the skip rule). Front Matter is NOT
emitted because the first split is at line 0.

```ts
it('H1-only manuscripts (no H2) keep every H1 as a split — title-page rule does not fire', () => {
  const { chapters, ambiguous } = detectChapters(H1_ONLY_CHAPTERS);
  expect(chapters.map((c) => c.title)).toEqual(['Book One', 'Book Two', 'Book Three']);
  expect(chapters[0].index).toBe(0); // no Front Matter entry — first split at line 0
  expect(ambiguous).toBe(false);
});
```

**Add E — empty front-matter regression:** A document whose first line is a chapter heading
must NOT emit a Front Matter entry.

```ts
it('does not emit an empty Front Matter entry when the first line is a chapter heading', () => {
  const text = ['Chapter 1', 'Prose.', '', 'Chapter 2', 'More prose.'].join('\n');
  const { chapters } = detectChapters(text);
  expect(chapters[0].title).toBe('Chapter 1');
  expect(chapters[0].index).toBe(0);
  expect(chapters).toHaveLength(2);
});
```

**Add F — CRLF + Front Matter:** Extend the existing CRLF test (`ChapterDetector.test.ts:59-64`)
to assert Front Matter survives CRLF. The existing assertion `chapters.length` should change from
`5` to `6` (5 real chapters + Front Matter). If you'd rather keep the CRLF test focused on the
encoding, leave its count alone and add a separate test:

```ts
it('captures Front Matter correctly under CRLF endings', () => {
  const crlf = NUMBERED_CHAPTERS.replace(/\n/g, '\r\n');
  const { chapters } = detectChapters(crlf);
  expect(chapters[0].title).toBe('Front Matter');
  expect(chapters[0].content).toContain('by Jane Author');
  expect(chapters.length).toBe(6);
});
```

Pick whichever keeps the test file cleanest. If the existing CRLF test flips naturally, just
update its assertion; do not duplicate.

### 8. Update the file's strategy-checklist header comment

The block at `ChapterDetector.test.ts:1-10` documents the coverage. Update it to reflect the new
state:

```ts
/**
 * Detection strategy checklist (all branches covered):
 *   chapter-pattern: bare "Chapter N" ✓  bold "**Chapter One**" ✓  word numbers ✓
 *     standalone-heading guard rejects prose-embedded mentions ✓
 *   sections: Prologue/Epilogue (capitalized) ✓  subtitles via italic line ✓
 *   Part pattern ✓  false-positive prose line rejected ✓ (Decision 1)
 *   heading strategy: H1-title-page skipped when H2s present ✓  H1-only keeps all H1s ✓ (Decision 2)
 *   front matter: captured as index -1 pseudo-chapter when first split > line 0 ✓ (Decision 3)
 *     excluded from ambiguity math ✓  no empty Front Matter when first split at line 0 ✓
 *   fallback single chapter (ambiguous) ✓  empty input ✓  CRLF ✓
 *   ambiguity: uneven sizes (>5×) ✓  fallback always-ambiguous ✓
 *   detectTitle ✓  detectAuthor (by / Author: / italic) ✓
 */
```

### 9. Do NOT change downstream consumers this session

`ManuscriptImportService.ts`, `importStore.ts`, `ChapterPreviewList.tsx`, `ImportWizard.tsx`,
preload, and handlers are untouched. SESSION-02 adjusts the single assertion in
`ManuscriptImportService.test.ts:47` (`expect(preview.chapters.length).toBe(5)`) which will now
be `6` because `NUMBERED_CHAPTERS` produces a Front Matter entry.

## Verification

1. **Type check:** `npx tsc --noEmit` — must pass with no new errors.
2. **Targeted test:** `npx vitest run src/application/import/ChapterDetector.test.ts` — must be
   green. All 3 flipped tests pass; all 3 new regression tests (D, E, plus the implicit
   Front-Matter-under-CRLF) pass.
3. **Downstream check:** `npx vitest run src/application/ManuscriptImportService.test.ts` —
   EXPECT ONE FAILURE: the `preview.chapters.length).toBe(5)` assertion at line 47 will now be
   `6`. That is the expected ripple and is the contract for SESSION-02. Do NOT fix it here. Run
   the file to confirm the failure is exactly that one assertion and nothing else broke.
4. **Full suite:** `npm test` — record the count. Expected: one red test
   (`ManuscriptImportService.test.ts` line 47). All other files green. If any OTHER test breaks,
   that is unexpected — investigate before reporting done. The `ImportWizard.test.tsx` and
   `importStore.test.ts` tests usefully constructed `ImportPreview` fixtures (not the
   `detectChapters` output) so they should not be affected; `ChapterPreviewList.test.tsx` same.
5. **Coverage:** `npm run test:coverage` — all enforced thresholds pass (the one failing
   assertion does not block coverage from running; if your Vitest config halts on the first
   failure, skip this step and let SESSION-02 run it after the fix).
6. **Architecture compliance:**
   - No new module, no IPC channel, no preload change, no renderer change.
   - `DetectedChapter` type unchanged (`src/domain/types.ts` untouched).
   - Imports in `ChapterDetector.ts`: only `from '@domain/types'` (type-only) — unchanged.
   - No `any`, no `@ts-ignore`.
7. **CHANGELOG entry (mandatory per AGENTS.md):** Append a `## [YYYY-MM-DD] — ChapterDetector
   heuristic fix (bug 6)` entry to `CHANGELOG.md`. Under ### Changed list
   `src/application/import/ChapterDetector.ts — …` for each of the three heuristics. Under ###
   Architecture Impact note: "No public API change. `DetectedChapter.index` now reserves `-1`
   for the synthetic Front Matter entry emitted before the first detected split." Under ###
   Migration Notes: "None at the type level. ImportWizard now displays a 'Front Matter' row when
   the source manuscript has content before its first chapter heading; users can remove or merge
   the row before importing." SESSION-02 will update `docs/architecture/APPLICATION.md` — do
   NOT touch the docs directory this session unless CHANGELOG is the only affected doc (it is).

## State Update

Update `prompts/session-program/program-028/STATE.md`:
- Session 01 → `done`, today's date, brief notes: "3 heuristics fixed; 3 tests flipped; 3
  regressions added; ManuscriptImportService.test.ts line 47 expected red (carried to S02)."
- Handoff Notes: append date + session + the exact test file and assertion line that SESSION-02
  must flip (`src/application/ManuscriptImportService.test.ts:47` → `toBe(6)`) and the doc
  sections that need updating (`docs/architecture/APPLICATION.md` import-services subsection).
- If the full suite found any OTHER red test, list it too and decide: in-scope follow-up or a
  new ticket. Default: out of scope, record only.
- If a regression test was harder to write than expected and you weakened an assertion, record
  the weakening explicitly — never weaken silently.