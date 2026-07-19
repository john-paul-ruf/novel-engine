# Bug 6 — ChapterDetector heuristic fix — Design decisions (user-confirmed)

Source: STATE.md `prompts/session-program/program-026/STATE.md` "Bugs found during the program"
item 6 (recorded by SESSION-19 handoff, NOT fixed by the 2026-07-19 follow-up pass):

> **ChapterDetector (S19):** mid-prose "Chapter N …" false splits; title-page headings counted;
> pre-split content silently dropped.

This file records the three design decisions the previous program deferred, confirmed with the
user before generating SESSION-NN prompts for program-028.

---

## Decision 1 — Mid-prose "Chapter N …" line vs. true heading

**Problem:** `CHAPTER_PATTERN = /^\*{0,2}chapter\s+(\d+|[a-z][a-z]*)\b.*?\*{0,2}$/i` matches any
line that *starts* with `Chapter N`. A prose sentence like
`Chapter 3 was her favorite of all the rooms in the house.` becomes a (false) split. Pinned today
in `src/application/import/ChapterDetector.test.ts:66-84` as a known LIMITATION.

**Decision (confirmed):** Require the **previous line to be blank or start-of-file** (standalone
heading heuristic). A `Chapter N …` line is only treated as a split when the previous non-blank-ish
line above it is empty or it sits at the top of the document.

This is the gentlest of the candidate fixes — it preserves `Chapter 3: The Reveal` and
`Chapter Three — The Fall` titles, and only rejects prose-embedded mentions. Tail content after the
label is still allowed; we are anchoring on *standalone-ness*, not on label-only-ness.

**Risk:** A manuscript that puts its chapter heading on the line immediately after the previous
chapter's last prose line (no blank line between) will now miss that split and fall through to a
later strategy or the single-chapter fallback. Pinned as an accepted trade-off in tests: standard
manuscript formatting leaves a blank line above each heading; the heuristic is calibrated to match
real-world formatting, not anti-formatted input.

## Decision 2 — Title-page `# Title` heading vs. chapter heading strategy

**Problem:** `HEADING_PATTERN = /^#{1,2}\s+(.+)$/` counts EVERY `#`/`##` line, so the title-page
`# Étoiles Mortes` heading in `HEADING_CHAPTERS` is counted as chapter 1. Pinned today at
`src/application/import/ChapterDetector.test.ts:88-95` as a known false positive.

**Decision (confirmed):** **Skip the first H1 if it appears before any ## heading**
(title-page heuristic). When the heading strategy runs, scan the lines in order; if the first
heading encountered is an H1 (`# …`) AND an `## …` heading appears later in the document, treat
that first H1 as the title page, not a chapter split. Subsequent H1s in the body are kept as
splits (rare in manuscripts but valid for part-level structure). If the document contains only H1
headings and no H2s, all H1s remain splits (preserves the previous behavior for H1-only
manuscripts — a doc with three `#` headings is still three chapters).

**Risk:** A manuscript that uses H1 throughout for chapter headings (no H2) and starts with a
short title-page `# Title` keeps the old false positive. Accepted: such manuscripts are uncommon
and the ambiguity warning + user-editable chapter list in the ImportWizard covers the residual
risk. The fix targets the canonical H1-title + H2-chapters shape, which is the documented
fixture (`HEADING_CHAPTERS`).

## Decision 3 — Content before the first split

**Problem:** `buildResult` starts each chapter at `splits[i].lineIndex`; everything before the
first split (title, byline, copyright, dedication) is silently dropped from every chapter. Pinned
today at `src/application/import/ChapterDetector.test.ts:34-35`.

**Decision (confirmed):** **Capture as a `Front Matter` pseudo-chapter** with `index: -1`,
excluded from ambiguity math, surfaced in `ImportPreview`. When the first split is at
`lineIndex > 0`, prepend a synthetic chapter `{ index: -1, title: 'Front Matter',
startLine: 0, endLine: firstSplit.lineIndex, wordCount, content: lines.slice(0, firstSplit.lineIndex).join('\n') }`
to the chapters array. Reindex logic in `importStore` already handles arbitrary `index` values
(it re-numbers with `map((ch, i) => ({ ...ch, index: i }))`); the renderer list renders chapters
in array order and uses `i + 1` for the displayed number. The Front Matter entry is editable,
mergeable, and removable just like any other chapter — if the user doesn't want it in the
imported book, they click × and its content folds into the previous chapter (i.e. it is
discarded, which is today's behavior for the title/byline block).

**Excluded from ambiguity math:** `detectAmbiguity` operates on the chapters array AFTER the
front-matter entry is removed (filter `index >= 0` before evaluating the uneven-size and
few-chapters-for-long-doc rules), so the small front-matter block doesn't trigger the >5× uneven
flag.

**Risk:** New chapter index schema (`-1` is novel). Pinned in tests; `importStore` is index-blind
beyond array position; `ManuscriptImportService.commit` already slugs chapters by `chapter.index + 1`
padded to 2 — so `index: -1` would write `00-front-matter/draft.md`. That is the desired behavior
for a front-matter file (zero-padded to sort before chapter 01). Confirm in SESSION-01 by running
the existing `ManuscriptImportService` tests after the change; the slugifyChapterTitle for
`'Front Matter'` produces `front-matter`.

---

## Out of scope (not fixed by this program)

- **Minor doc/value drift items** flagged in STATE.md (MAX_CALL_CONTEXT_TOKENS comment,
  AgentService `loadAll` comment, BashEmulator valued-flag quirk, SourceGeneration title overwrite,
  ChapterValidator root-file pattern, BuildService unreachable branch). Recorded as bug 7 cluster;
  left as-is.

- **E2E coverage** for the import flow. Out of scope by design (program-026 design decision 8).

---

## Verification

`npm test` (full suite) must stay green. The pinned limitation tests in
`src/application/import/ChapterDetector.test.ts` (lines 66–84 false-positive prose, 88–95 title-page
heading FP, 33–35 dropped front matter) are EXPECTED TO FLIP — the fix changes the behavior those
tests pin. Update those three tests to assert the new correct behavior and add regression tests
for each decision (standalone-heading rejection, title-page skip with H2s present, front-matter
capture). New tests must also cover: H1-only manuscript (no H2) keeps all H1s as splits (regression
for the decision-2 fallback), and a document whose first split is at line 0 must NOT emit an empty
Front Matter entry.

`npm run test:coverage` must still pass all enforced thresholds.