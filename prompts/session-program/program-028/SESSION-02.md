# SESSION-02 — Downstream ripple + docs + final green suite

> **Program:** Novel Engine
> **Feature:** chapter-detector-heuristics
> **Modules:** M08 (one assertion in `ManuscriptImportService.test.ts`) + M09/M10 documentation only
> **Depends on:** SESSION-01 `done`
> **Estimated effort:** ~15 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M08 | `src/application/ManuscriptImportService.test.ts` | Full (102 lines) | The `preview.chapters.length).toBe(5)` assertion at line 47 needs to flip to `6`; the DOCX branch at line 62 also calls `detectChapters` via `preview` and asserts `toBe(5)` — flips to `6` too |
| M08 | `src/application/ManuscriptImportService.ts` | Lines 40-54 (the `preview` body) | Re-read to confirm `chapters` flows verbatim from `detectChapters` to the returned `ImportPreview` — no transformation that would strip the Front Matter entry |
| — | `CHANGELOG.md` | Current top + the entry SESSION-01 appended | Per AGENTS.md: every code change session appends a CHANGELOG entry. SESSION-02 itself changes a TEST assertion (not production code) — append a short follow-up entry under today's date noting the test-flip and the doc updates. Re-read SESSION-01's entry first so you don't duplicate it. |
| — | `docs/architecture/APPLICATION.md` | Find the import-services subsection (ManuscriptImportService, ChapterDetector) | The ChapterDetector behavior changed; the doc must reflect the three heuristics and the `index: -1` Front Matter convention. If the file has no import subsection yet, add one under the existing services inventory. |
| — | `docs/architecture/ARCHITECTURE.md` | Header date + (only if touched) source tree | The Architecture master only needs a "Last updated" date bump if no other structural fact changed. No new module, no IPC, no type, no dependency-graph change. Skip the source-tree and dependency-graph sections unless you find drift. |
| — | `prompts/session-program/program-028/STATE.md` | Handoff Notes from SESSION-01 | Confirms exactly which assertion line is expected red and which doc sections need updating |

## Context

SESSION-01 fixed three ChapterDetector heuristics and flipped the detector-level tests
(`src/application/import/ChapterDetector.test.ts`). It deliberately left one downstream
assertion red because the fix surface decision was "no consumer code change required, only a
test-count adjustment":

- `src/application/ManuscriptImportService.test.ts:47` —
  `expect(preview.chapters.length).toBe(5)` should now be `6` because `NUMBERED_CHAPTERS`
  produces a Front Matter entry (the fixture has a title + byline + blank line before
  `Prologue`).
- `src/application/ManuscriptImportService.test.ts:62` — the DOCX-via-pandoc branch reuses the
  same `NUMBERED_CHAPTERS` stdout and asserts `chapters.length).toBe(5)` — also flips to `6`.

Two assertions, not one. Re-read both before editing.

After flipping, the full suite must be green. Then per AGENTS.md, update `CHANGELOG.md` and
`docs/architecture/APPLICATION.md` (the only affected architecture doc — the change is isolated
to the application layer's import subdirectory; no IPC, preload, renderer, infra, or domain
change). `ARCHITECTURE.md` master only needs the "Last updated" date bumped if you edit any
subsection; if APPLICATION.md alone is edited, do NOT bump ARCHITECTURE.md's date (per AGENTS.md:
"Only update the docs that are affected by the current session's changes").

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/application/ManuscriptImportService.test.ts` | Modify | Flip two `chapters.length` assertions: line 47 (`toBe(5)` → `toBe(6)`) and line 62 (`toBe(5)` → `toBe(6)`). Optionally add a quick assertion that `preview.chapters[0].title === 'Front Matter'` at line 48 to lock the behavior at the service boundary. |
| `CHANGELOG.md` | Append | New dated entry for SESSION-02 noting the downstream test flip + doc updates. |
| `docs/architecture/APPLICATION.md` | Modify | Update (or add) the import-services subsection: describe the three heuristics, the `index: -1` Front Matter convention, and the strategy priority (chapter-pattern ≥3 → headings ≥3 → fallback). Cite `src/application/import/ChapterDetector.ts`. |

## Implementation

### 1. Re-read SESSION-01 Handoff Notes

Open `prompts/session-program/program-028/STATE.md` and read the SESSION-01 handoff entry. It
should record:
- The exact line numbers of the two assertions to flip (47 and 62).
- Any additional red tests found during the full-suite run (should be none, but verify).
- Whether SESSION-01 already updated `CHANGELOG.md` (it should have — this session appends a
  second, separate entry, not a merge).

### 2. Read the ManuscriptImportService test file in full

`src/application/ManuscriptImportService.test.ts` is 102 lines. Read all of it. The two
assertions at lines 47 and 62 are inside `describe('preview', …)`. The `commit` describe block
(lines 77-101) uses hand-constructed `chapters` arrays (not `detectChapters` output) and does
NOT need changes — its `chapters` have explicit `index: 0/1/2` and no Front Matter entry.

### 3. Flip the two assertions

At line 47:

```ts
expect(preview.chapters.length).toBe(6);
expect(preview.chapters[0].title).toBe('Front Matter'); // lock the behavior at the service boundary
expect(preview.chapters[0].index).toBe(-1);
expect(preview.detectedAuthor).toBe('Jane Author');
```

At line 62 (inside the DOCX test):

```ts
expect(preview.chapters.length).toBe(6);
```

If SESSION-01's handoff notes flag any extra downstream red test, flip or fix it here too. The
import wizard and import-store tests (`ImportWizard.test.tsx`, `importStore.test.ts`,
`ChapterPreviewList.test.tsx`) were confirmed in SESSION-01's analysis to construct their own
`ImportPreview` fixtures and should NOT have flipped — if any of them broke, that is a
SESSION-01 regression and a surprise; record it in Handoff Notes and address it in this session
(preferred: a minimal fix that keeps the test's intent, not a weakening).

### 4. Append the CHANGELOG entry

Read today's existing entries first (SESSION-01 already added one for the source fix). Append a
new dated entry BELOW SESSION-01's entry (CHANGELOG is append-only, never edit past entries):

```markdown
## [YYYY-MM-DD] — ChapterDetector downstream ripple + docs (program-028 SESSION-02)

### Summary
Flipped the two ManuscriptImportService preview assertions that counted chapters before the
new Front Matter pseudo-chapter was introduced in SESSION-01. Updated the architecture doc
for the application-layer import subdirectory to describe the three new heuristics and the
`index: -1` convention. No production code changed this session.

### Changed
- `src/application/ManuscriptImportService.test.ts` — `preview.chapters.length` assertion at
  line 47 and the DOCX-branch assertion at line 62 updated from `5` to `6`; added a
  boundary assertion that `preview.chapters[0].title === 'Front Matter'` and
  `index === -1` to lock the SESSION-01 behavior at the service seam.
- `docs/architecture/APPLICATION.md` — import-services subsection updated to describe the
  three heuristics (standalone-heading guard, title-page H1 skip when H2s are present, Front
  Matter `index: -1` capture) and the strategy priority chain.

### Architecture Impact
- None — no production code change this session. The Front Matter chapter surfaced by
  SESSION-01 flows through `ManuscriptImportService.preview` unchanged (the service passes
  the `chapters` array through verbatim).

### Migration Notes
- None — behavior migration was committed in SESSION-01's entry. This session closes the
  downstream test ripple.
```

If the date string is the same as SESSION-01's entry, the two entries share a date header but
remain separate `## [date] — title` blocks. That is the AGENTS.md convention.

### 5. Update `docs/architecture/APPLICATION.md`

Read the file first. Per AGENTS.md the architecture docs use a section-per-service format. Find
the import subsection (ManuscriptImportService / ChapterDetector / SeriesImportService). If
`ChapterDetector` is described there, update the description to reflect the three heuristics
and the `index: -1` Front Matter convention. If no such subsection exists, add one:

```markdown
### ChapterDetector (`src/application/import/ChapterDetector.ts`)

Pure function module — `detectChapters(markdown)` returns `{ chapters, ambiguous }`. Three
detection strategies tried in priority order, first to reach ≥3 splits wins; otherwise a
single-chapter ambiguous fallback.

| Strategy | Trigger | Rule |
|----------|---------|------|
| Chapter pattern | ≥3 lines match `Chapter N` / `Prologue` / `Epilogue` / `Part N` / bold-wrapped variants | Line must be a **standalone heading** — the previous line is blank or start-of-file. Tail content after the label (`Chapter 3: The Reveal`) is allowed; prose-embedded mentions (`Chapter 3 was her favorite…`) are rejected. |
| Headings | ≥3 `#`/`##` lines | The first H1 is skipped when at least one `##` heading appears later (title-page heuristic). H1-only manuscripts keep every H1 as a split. |
| Fallback | otherwise | The entire document is one chapter, `ambiguous: true`. |

**Front Matter convention.** When the first detected split is not at line 0, a synthetic
`{ index: -1, title: 'Front Matter', … }` entry is prepended to the chapters array, capturing
title-page / byline / copyright / dedication content that would otherwise be dropped. The entry
is excluded from ambiguity math (filter `index >= 0` before the uneven-size and
few-chapters-for-long-doc rules). The ImportWizard renders the Front Matter row like any other
chapter; users can remove or merge it before importing. `ManuscriptImportService.commit` writes
the row to `chapters/00-front-matter/draft.md` (the slug zero-pads `index + 1 = 0`, which sorts
before `01-…`).

Consumed by: `ManuscriptImportService.preview`. Downstream consumers (`importStore`,
`ChapterPreviewList`, `ImportWizard`) are index-blind beyond array position — no changes
required when the Front Matter entry was introduced.
```

If `APPLICATION.md` references ChapterDetector behavior in only a single line (e.g. inside the
ManuscriptImportService section as a one-sentence aside), expand that sentence to mention the
three heuristics and cross-reference the Front Matter convention. Do not duplicate the table
above verbatim if a shorter note suffices — match the existing doc's verbosity.

### 6. Do NOT touch other architecture docs

- `docs/architecture/DOMAIN.md` — `DetectedChapter` type unchanged. No edit.
- `docs/architecture/INFRASTRUCTURE.md` — no infra module touched. No edit.
- `docs/architecture/IPC.md` — no IPC change. No edit.
- `docs/architecture/RENDERER.md` — no store or component change. No edit.
- `docs/architecture/ARCHITECTURE.md` — only the "Last updated" header date IF you made a
  structural change to APPLICATION.md. Per AGENTS.md: *"Only update the docs that are affected
  by the current session's changes."* If your APPLICATION.md edit doesn't change the layer
  diagram or dependency graph or source tree, leave ARCHITECTURE.md alone.

### 7. Run the full suite green

```bash
npx tsc --noEmit
npm test
npm run test:coverage
```

All three must pass. The expected counts:
- `npx tsc --noEmit`: 0 errors.
- `npm test`: green. File count unchanged from before SESSION-01; test count INCREASED by the
  number of regression tests SESSION-01 added (D, E, F) — record the exact count in your
  Handoff Notes. The two `ManuscriptImportService.test.ts` assertions flipped to green; no
  other file changes.
- `npm run test:coverage`: all enforced thresholds pass (global L ≥ 75, domain/application ≥ 90,
  infrastructure/main ≥ 80/54, preload ≥ 90, renderer ≥ 70). Record the global L/S/F/B numbers
  in Handoff Notes. If a threshold dipped, investigate which file lost coverage — the
  ChapterDetector fix only ADDED lines and tests, so coverage should be flat or up. A dip
  indicates a regression in SESSION-01 (e.g. an untested branch was introduced) — record and
  decide whether to add a targeted test this session or flag it for a follow-up ticket.

## Verification

1. **Type check:** `npx tsc --noEmit` — 0 errors.
2. **Full test:** `npm test` — green. Record file count and test count in Handoff Notes.
3. **Coverage:** `npm run test:coverage` — all thresholds pass. Record the four global numbers.
4. **Docs sanity:** Open `docs/architecture/APPLICATION.md` and `CHANGELOG.md` — verify paths
   cited exist (`src/application/import/ChapterDetector.ts`, etc.) and the behavior description
   matches what SESSION-01 actually implemented (re-read `ChapterDetector.ts` if needed — do
   NOT document from memory; per AGENTS.md: *"Read the files you changed before writing the
   entry. Don't document from memory."*)
5. **Architecture compliance:** No production code changed this session — no boundaries to
   check. The doc edits are description-only.

## State Update

Update `prompts/session-program/program-028/STATE.md`:
- Session 02 → `done`, today's date, brief notes: "Two downstream assertions flipped to `6`
  (lines 47 and 62); APPLICATION.md updated; CHANGELOG appended; full suite green
  (N files, M tests; coverage G L/S/F/B = …/…/…/…)."
- Handoff Notes: append date + session + the final counts (file count, test count, coverage
  numbers), the doc files touched, and any surprises. If session-01 had recorded an unexpected
  extra red test, note how it was resolved here.
- The program is now complete — both sessions `done`. Post the Final Report per MASTER.md
  (sessions done 2/2, files modified, behavior delta, verification result, architecture
  impact = none, follow-ups = none unless surprises surfaced).