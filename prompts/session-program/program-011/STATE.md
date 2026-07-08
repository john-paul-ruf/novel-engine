# State Tracker — Novel Engine / tracked-chapter-editing

## Program / Feature / Intent / Sessions

- **Program:** Novel Engine
- **Feature:** tracked-chapter-editing
- **Intent:** Let the user edit Verity-authored chapter drafts directly in the Manuscript
  editor, with every change tracked (versioned + attributed) and surfaced to the AI so
  Verity preserves author edits by default on subsequent revisions.
- **Sessions:** 6
- **Input:** `input-files/tracked-chapter-editing-proposal.md`

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Baseline-diff foundation (types, DB query, VersionService API, prune pinning) | M01, M03, M08 | done | 2026-07-08 | Implemented exactly per spec; prune SQL verified against in-memory SQLite |
| 02 | IPC handlers + preload bridge | M09 | done | 2026-07-08 | Typecheck clean; DevTools smoke test deferred to SESSION-03 manual pass |
| 03 | Unlock editor + tracked-edit banner + "View my changes" modal | M10 | done | 2026-07-08 | Typecheck clean; manual UI flows pending final pass |
| 04 | Rail EDITED badges + discard-my-edits flow | M10 | done | 2026-07-08 | Typecheck clean; manual UI flows pending final pass |
| 05 | Author-edits context injection for Verity | M08, M09 | done | 2026-07-08 | Typecheck clean; live context inspection deferred to final manual pass |
| 06 | Agent-activity guard + external-change reload | M10 | done | 2026-07-08 | Typecheck clean; manual race-flow checks pending final pass |

(Status: pending | in-progress | done | blocked | skipped)

## Dependency Graph

```
SESSION-01 ──► SESSION-02 ──► SESSION-03 ──► SESSION-04
     │                              └──────► SESSION-06
     └────────► SESSION-05
```

- 01 has no dependencies.
- 02 and 05 both depend only on 01 (parallel-eligible; different files except
  `src/domain/interfaces.ts` — run 02 first if executing serially).
- 03 depends on 02; 04 depends on 02+03; 06 depends on 03.

## Architecture Reference (feature-specific)

Full config in `FORGE-CONFIG.md`. Feature-relevant facts:

- **Attribution already exists**: `files:write` IPC snapshots as `'user'`
  (`src/main/ipc/handlers.ts:342`); the book watcher snapshots agent writes as `'agent'`
  (`src/main/index.ts:702`). No changes needed to attribution.
- **Baseline model**: latest `source='agent'` snapshot per file = baseline; user delta =
  diff(baseline → disk). Self-resetting when Verity rewrites the file.
- **Tracked file scope**: `chapters/(\d+)-*/draft.md` with number ≥ 2 — mirrors
  `isVerityDraft()` (`src/renderer/components/Manuscript/ManuscriptView.tsx:14`).
- **ContextBuilder consumers that need the author-edits section**: `ChatService`,
  `MultiCallOrchestrator`, `RevisionQueueService`. (`SourceGenerationService` excluded —
  it never revises chapters.)
- **Composition-root ordering hazard**: `VersionService` is constructed at
  `src/main/index.ts:627`, after `ChatService` (615) and `RevisionQueueService` (618) —
  SESSION-05 must move it up.

## Scope Summary (modules affected)

| ID | Module | Touch |
|----|--------|-------|
| M01 | domain | `ChapterEditStatus` type; `IDatabaseService` + `IVersionService` methods |
| M03 | database | Latest-by-source query; baseline-pinning prune SQL |
| M08 | application | `VersionService` (3 new methods), `ContextBuilder` (1 param), 3 service injections |
| M09 | main/ipc | 2 IPC handlers, 2 preload methods, composition-root reorder |
| M10 | renderer | `ManuscriptView`, `ChapterRail`, `FileEditor` (disabled prop), new `UserEditsDiffModal` |

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Derive user edits from version history (no new storage) | Zero drift risk; reuses dedup/diff/revert; only cost is pinning the agent baseline during prune |
| Pin latest `agent` snapshot in prune SQL | `keepCount=50` could otherwise delete the baseline on heavily-edited files |
| Preserve-by-default policy in Verity's context | Safest default for authors; wording-only change if policy evolves |
| Chapters only (N ≥ 2 body drafts) | Matches the existing read-only scope; source files already freely editable |
| EDITED chip replaces DRAFT chip (not additive) | Single badge per row keeps the rail scannable |
| Guard = disable editor during any active CLI call for the book | Coarse but safe; avoids races with unmount-autosave in `FileEditor` |
| Synthetic `id: -1` version summary for "current disk content" | Lets `FileDiff` represent baseline→disk without storing a snapshot |
| 120 diff-lines cap per chapter in the context section | Bounds token cost on heavily-edited chapters; agent can Read the file for full text |

## Handoff Notes

(Agents append here after each session: what was done, deviations, gotchas for the next session.)

### SESSION-01 (2026-07-08)

**Done.** New public APIs (exact names, for SESSION-02/05):

- `ChapterEditStatus` type in `src/domain/types.ts` (after `FileVersionSummary`):
  `{ chapterSlug, filePath, hasUserEdits, addedLines, removedLines, lastUserEditAt }`.
- `IDatabaseService.getLatestFileVersionBySource(bookSlug, filePath, source): FileVersion | null`
  — returns **full** `FileVersion` (content included), implemented in `DatabaseService`
  via new prepared statement `stmtGetLatestFileVersionBySource`.
- `IVersionService.getUserEditsSinceAgentBaseline(bookSlug, filePath): Promise<FileDiff | null>`
  — null when no agent baseline / file missing / content identical.
- `IVersionService.getChapterEditStatuses(bookSlug): Promise<ChapterEditStatus[]>`
  — every body chapter (dir matches `/^(\d+)-/`, number ≥ 2), per-chapter try/catch skip.

**Synthetic-summary shape (no deviation):** `newVersion` in the baseline diff uses
`id: -1` sentinel, `source: 'user'`, `createdAt: latestUser?.createdAt ?? baseline.createdAt`.

**Prune pinning:** `deleteFileVersionsBeyondLimit` now passes `bookSlug, filePath` a third
time (`stmt.run(bookSlug, filePath, bookSlug, filePath, keepCount, bookSlug, filePath)`).
Verified via sqlite3 CLI: latest `agent` row survives `keepCount=1`; `COALESCE(..., -1)`
doesn't block pruning for files with no agent history.

### SESSION-02 (2026-07-08)

**Done.** Bridge methods confirmed for SESSIONs 03/04/06:

- `window.novelEngine.versions.getUserEdits(bookSlug, filePath): Promise<FileDiff | null>`
  → `'versions:getUserEdits'`
- `window.novelEngine.versions.getChapterEditStatuses(bookSlug): Promise<ChapterEditStatus[]>`
  → `'versions:getChapterEditStatuses'`

`ChapterEditStatus` added to the preload `@domain/types` type-import (`FileDiff` was already
there). `NovelEngineAPI` is `typeof api`, so no separate type change was needed.

**Deviation:** the `npm start` DevTools console check was deferred — run it as part of
SESSION-03's manual verification (the modal exercises both methods end-to-end).

### SESSION-05 (2026-07-08)

**Done.** For SESSION-03's banner copy: the exact section heading injected into Verity's
context is **`## Author Edits Since Your Last Draft`**. Cap: **120 rendered diff lines per
chapter** (`AUTHOR_EDITS_MAX_DIFF_LINES` in `src/application/VersionService.ts`), then
`... ({n} more edited lines — read the file for the full text)`.

- `IVersionService.buildAuthorEditsSection(bookSlug): Promise<string | null>` — null when
  no chapter has pending edits.
- `ContextBuilder.build()` gained optional `authorEditsSection?: string`, pushed right
  after `guidanceSection`.
- Injection sites (Verity-only guard at each): `ChatService.ts` Step 7e,
  `MultiCallOrchestrator.runSingleStep` (non-lightweight steps only),
  `RevisionQueueService.runSession` (always Verity there — no guard needed).
- Composition root: `VersionService` now constructed at `src/main/index.ts:616`, before
  `ChatService` (617) and `RevisionQueueService` (620); passed as 12th/6th ctor arg
  respectively; `ChatService` forwards it to `MultiCallOrchestrator` (8th arg).

**Deviation:** manual `npm start` checks (section appears for Verity with correct diff;
absent for non-Verity agents and unedited books) deferred to the final manual pass.
**Gotcha:** `MultiCallOrchestrator` rebuilds the section per non-lightweight step — cheap
(SQLite + small diffs) and keeps it fresh if the user edits mid-run.

### SESSION-03 (2026-07-08)

**Done.** For SESSIONs 04/06:

- Flag name: **`isTrackedDraft`** (`ManuscriptView.tsx`, replaces `editorReadOnly`) —
  means "show tracked-edit UI", editing is enabled.
- Modal file: **`src/renderer/components/Manuscript/UserEditsDiffModal.tsx`** — props
  `{ bookSlug, filePath, chapterTitle, onClose }`; fetches via
  `versions.getUserEdits`; Escape + overlay-click close; `DiffViewer` body.
- Banner renders above `FileEditor` inside the `mode === 'editor'` branch, guarded on
  `isTrackedDraft && editorPath` — this is the banner slot SESSION-06's guard layers onto.
- `showUserEdits` state reset on book switch; modal render guarded on
  `showUserEdits && isTrackedDraft && editorPath`, next to `FindReplaceModal`.
- `ReadOnlyDraft` component and its render branch deleted; editor-content effect no longer
  skips tracked drafts.

**Deviation:** `FindReplaceModal` has no Escape handler to mirror — the new modal implements
Escape itself (window keydown listener). Manual UI verification deferred to final pass.

### SESSION-04 (2026-07-08)

**Done.** For SESSION-06 (same surfaces):

- `ChapterInfo` gained required `hasUserEdits: boolean` (populated best-effort from
  `versions.getChapterEditStatuses`, fetched once per `useChapterList` refresh).
- Badge precedence in `ChapterRow`: AUTO → **EDITED** (brass, replaces DRAFT) → DRAFT → EMPTY.
- `UserEditsDiffModal` gained `onReverted?: () => void` and a footer discard flow:
  inline two-step confirm (`confirmingDiscard` state), `discarding` pending-disable,
  `discardError` inline text; Discard disabled when `diff.oldVersion` is null.
- `ManuscriptView` has `editorReloadKey` state — `FileEditor key` is now
  `` `${editorPath}:${editorReloadKey}` `` and the content-load effect depends on it;
  `onReverted` bumps it to reload from disk after the revert.

**Styling note:** modal footer uses zinc shell classes (matching the modal) with
`ne-sable` danger accents for the discard buttons.

### SESSION-06 (2026-07-08) — feature complete

**Done.**

- `FileEditor` gained `disabled?: boolean` (default false): textarea `readOnly` + dimmed,
  Save button + Cmd+S no-op, unmount autosave skipped via `disabledRef` (never write
  during an active agent call).
- `ManuscriptView`: `agentBusy` selector over `cliActivityStore` (`isActive` calls whose
  `callMeta.bookSlug === activeSlug`). Tracked-draft banner swaps to "Verity is working on
  this book — editing is paused." with a pulsing dot; `disabled={isTrackedDraft && agentBusy}`
  on `FileEditor` (never unmounted — unmount would fire the autosave and race the agent).
- External-change reload: `revision`-driven effect compares disk against
  `lastDiskContentRef` (set on load and on self-save); mismatch → slim bar with
  **Reload** (clears flag, nulls content, bumps `editorReloadKey`) and **Keep mine**
  (clears flag; next save wins and is snapshotted). Flag resets on
  `editorPath`/`activeSlug`/`editorReloadKey` change.

**Deviation from spec:** instead of `setEditorContent(newContent)` in the `onSave` wrapper
(which would change `FileEditor`'s `initialContent` prop mid-session and could clobber
keystrokes typed during the async save via its reset effect), the staleness baseline lives
in `lastDiskContentRef` — same behavior, no re-render side effects.

**All 6 sessions done — feature complete. Final Report written per MASTER.md.**

**Gotchas:** `better-sqlite3` in `node_modules` is compiled for Electron's ABI
(MODULE_VERSION 130) — plain `node` scripts can't load it; use the `sqlite3` CLI or the
running app for DB checks. `getChapterEditStatuses` fetches the latest `user` snapshot
separately per chapter so `lastUserEditAt` is populated even when `hasUserEdits` is false.
