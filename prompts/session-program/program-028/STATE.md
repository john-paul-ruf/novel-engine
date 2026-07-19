# State Tracker — Novel Engine / chapter-detector-heuristics

## Program
Novel Engine — Electron 33 / React 18 / TypeScript 5 desktop app, Clean Architecture (5 layers).

## Feature
`chapter-detector-heuristics` — fix the three ChapterDetector heuristic bugs recorded as item 6
in `prompts/session-program/program-026/STATE.md` "Bugs found during the program": mid-prose
"Chapter N …" false splits, title-page `#` heading counted as chapter 1, and pre-split content
silently dropped.

## Intent
After this program: `detectChapters` produces splits (a) only at standalone `Chapter N`
headings (preceded by a blank line or start-of-file), (b) skips a leading title-page `#` when
`##` headings follow, and (c) captures content before the first split as a `Front Matter`
pseudo-chapter with `index: -1` (excluded from ambiguity math). Downstream consumers (the import
preview/commit pipeline, the ImportWizard UI) work unchanged because `importStore` and the
ChapterPreviewList render in array order and are index-blind beyond array position; the commit
slug (`chapter.index + 1` padded to 2) emits `00-front-matter/draft.md` for the front-matter
entry, which sorts before `01-…` as desired. Pinned limitation tests flip; new regression tests
lock the three decisions.

## Sessions
2 sessions, ordered by dependency. SESSION-01 is the source fix + test flip + regression tests
on the detector boundary. SESSION-02 is the downstream ripple (preview `chapters.length` count
in `ManuscriptImportService.test.ts`, project doc updates per AGENTS.md) plus a final green
suite run.

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | ChapterDetector — 3-heuristic fix + test flip + regressions | M08 | done | 2026-07-19 | 3 heuristics fixed; 3 tests flipped; 3 regressions added; ManuscriptImportService.test.ts expected red — ripple: ASSERTIONS at BOTH line 47 AND line 62 (both use NUMBERED_CHAPTERS) need to flip to 6 |
| 02 | Downstream ripple — service test count + docs + final green | M08, M09 (docs only) | pending | | touches `src/application/ManuscriptImportService.test.ts` (lines 47 AND 62), `docs/architecture/APPLICATION.md` |

Status values: pending | in-progress | done | blocked | skipped

## Dependency Graph

```
S01 ─→ S02   (S02 re-runs the suite after S01 flips detector tests; doc update cites S01 behavior)
```

## Architecture Reference (feature-specific only; full config in FORGE-CONFIG)

- All work is inside **M08 application** (`src/application/import/ChapterDetector.ts` and the
  co-located test) plus the shared test fixture module `src/test/fixtures/manuscripts.ts` (M16).
- SESSION-02 also touches one assertion in `src/application/ManuscriptImportService.test.ts`
  (M08) and updates documentation per the AGENTS.md workflow (`CHANGELOG.md`,
  `docs/architecture/APPLICATION.md`).
- **Domain type unchanged:** `DetectedChapter` (`src/domain/types.ts:733-740`) already permits
  any integer `index`, including `-1`. No schema/type change.
- **IPC unchanged:** `import:preview` and `import:commit` payloads are unchanged; the renderer
  reads `chapters` in array order. No preload or handler edits.

## Scope Summary

| Module | Touched by | New files |
|--------|-----------|-----------|
| M08 application (import subdirectory) | S01, S02 | none — edits in place |
| M16 test (shared fixtures) | S01 | `src/test/fixtures/manuscripts.ts` extended with `H1_ONLY_CHAPTERS`, `MID_PROSE_FALSE_POSITIVE` |
| M09 main/ipc, M10 renderer | none | none — no consumer change required |
| docs | S02 | `CHANGELOG.md` append, `docs/architecture/APPLICATION.md` import section |

## Design Decisions

1. **Standalone-heading heuristic (Decision 1).** Require the line immediately above a
   `Chapter N` / `Prologue` / `Epilogue` / `Part N` / bold-wrapped variant to be blank or
   start-of-file. Tail content after the label is still allowed (`Chapter 3: The Reveal` survives)
   — we anchor on *standalone-ness*, not label-only-ness. Section/Part patterns get the same
   guard for consistency.
2. **Title-page H1 skip (Decision 2).** When the heading strategy runs, drop the first H1 (`# …`)
   if and only if it is the first heading in the document AND at least one `## …` heading appears
   later. If the manuscript uses H1 throughout (no H2), all H1s remain splits — preserves the
   previous behavior for that shape. Subsequent body H1s (after the first H2) stay as splits.
3. **Front Matter pseudo-chapter (Decision 3).** When `firstSplit.lineIndex > 0`, prepend
   `{ index: -1, title: 'Front Matter', startLine: 0, endLine: firstSplit.lineIndex,
   wordCount: <counted>, content: <joined> }`. Excluded from `detectAmbiguity` math (filter
   `index >= 0` before the uneven-size and few-chapters rules). If the first split is at line 0,
   NO front-matter entry is emitted (the synthetic chapter would be empty).
4. **No Domain type change.** `DetectedChapter.index: number` already accepts `-1`.
5. **No IPC / preload / handler change.** The preview payload's `chapters` array simply gains an
   extra leading entry when front matter is detected. The ImportWizard and ChapterPreviewList
   render chapters in array order; `i + 1` is used as the displayed number, so the Front Matter
   row shows as "1" and shifts the rest down by one — that is the desired UX (the user sees and
   can remove or merge the Front Matter row before importing).
6. **Commit slug for Front Matter.** `ManuscriptImportService.commit` slugs by
   `String(chapter.index + 1).padStart(2, '0') + '-' + slugify(title)`. For `index: -1` this is
   `00-front-matter/draft.md`, which sorts before `01-…`. If the user removes the Front Matter
   row in the wizard (S24 `removeChapter` behavior: first-chapter content is discarded), no
   `00-…` file is written. Both outcomes are correct.

## Handoff Notes

_(agents append here after each session: date, session, surprises, bugs found in source, deviations)_

### 2026-07-19 — SESSION-01 done

**What I built.** Added `isStandaloneHeading(lines, i)` helper to `ChapterDetector.ts`; gated the three pattern branches (`chapterMatch`, `sectionMatch`, `partMatch`) on it. Rewrote `detectByHeadings` to skip the first H1 when it is the first heading and at least one H2 appears later. Rewrote `buildResult` to prepend a `Front Matter` pseudo-chapter (`index: -1`) when `splits[0].lineIndex > 0`. Rewrote `detectAmbiguity` to filter `index >= 0` before both rules. Added fixtures `H1_ONLY_CHAPTERS` and `MID_PROSE_FALSE_POSITIVE`. Flipped three pinned limitation tests; added regression tests (standalone-heading guard, title-page skip, H1-only fallback, no-empty-Front-Matter, CRLF+Front-Matter).

**Surprises / deviations from the prompt.**

1. The prompt's Flip B (mid-prose test) asserted a `Front Matter` entry would appear for `MID_PROSE_FALSE_POSITIVE`. It does NOT — because `Chapter 1` is the first line of the fixture, the first split is at line index 0, so no Front Matter entry is emitted. I extended the fixture with a third real chapter (`Chapter 3` on its own line) so the standalone-guard still leaves ≥3 splits and the chapter-pattern strategy fires (otherwise it falls through to the single-chapter fallback). The flipped assertion is `['Chapter 1', 'Chapter 2', 'Chapter 3']` with no Front Matter, and `chapters[0].content` (Chapter 1's content) contains the prose sentence `Chapter 3 was her favorite` — confirming the prose-embedded line was NOT split.

2. The prompt's Flip B test referenced `chapters[1].content` for the prose-sentence assertion; the mid-prose line lives in `chapters[0]` (Chapter 1), so the assertion points at `chapters[0].content`. Verified the actual test output before finalizing.

3. The prompt's Add E (no-empty-Front-Matter) test used a 2-chapter fixture (`Chapter 1` + `Chapter 2`) which produces only 2 splits — below the `≥3` threshold for the chapter-pattern strategy, so it falls through to the single-chapter fallback. I extended the fixture to 3 chapters (`Chapter 1`, `Chapter 2`, `Chapter 3`) so the chapter-pattern strategy fires and the test actually exercises the `splits[0].lineIndex === 0 → no Front Matter` branch. Assertion: `toHaveLength(3)`, `chapters[0].index === 0`, all `index >= 0`.

4. The prompt said downstream ripple = one red assertion at `ManuscriptImportService.test.ts:47`. There are actually TWO: line 47 (`reads markdown sources directly…`) AND line 62 (`converts DOCX via pandoc…`). Both use `NUMBERED_CHAPTERS` and assert `toBe(5)`. Both should be flipped to `toBe(6)`. SESSION-02 must handle both lines, not just line 47.

5. CRLF test (was line 59-64): the existing test asserted `length === 5` and `chapters[1].title === 'Chapter 1'`. I flipped it inline to `length === 6`, `chapters[0].title === 'Front Matter'`, `chapters[2].title === 'Chapter 1'` — the cleanest option per the prompt's "if the existing CRLF test flips naturally, just update its assertion; do not duplicate." No separate CRLF+Front-Matter test was added.

**Verification status.**

- `npx tsc --noEmit` — passed cleanly.
- `npx vitest run src/application/import/ChapterDetector.test.ts` — 12/12 green.
- `npx vitest run src/application/ManuscriptImportService.test.ts` — 2 failures at lines 47 and 62 (expected ripple for SESSION-02).
- `npm test` (full suite) — 178 files; 177 passed, 1 file failed (`ManuscriptImportService.test.ts`); 1388 tests; 1386 passed, 2 failed. No other red.
- `npm run test:coverage` — vitest exits non-zero on the 2 test failures before printing the threshold table; the coverage text reporter default is suppressed on failure. SESSION-02 will run coverage after the flip and confirm all thresholds (lines 75 global, 90 application, 80 infra, 90 preload, 70 renderer, 54 main).

**Warnings.** None beyond the above. No regressions outside the import subsystem.