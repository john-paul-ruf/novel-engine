# State Tracker — Novel Engine / version-history-everywhere

## Program / Feature / Intent / Sessions

- **Program:** Novel Engine
- **Feature:** version-history-everywhere
- **Intent:** Surface the existing per-file version history + revert on every generated
  document (source docs, chapter drafts, reports, any book file) from read-only views,
  and retheme the legacy zinc/blue version-history UI to the `ne-*` design tokens.
- **Sessions:** 4
- **Input:** `input-files/version-history-everywhere-request.md`

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Retheme version-history surfaces (DiffViewer, VersionHistoryPanel, FileEditor, UserEditsDiffModal remnants) | M10 | done | 2026-07-08 | Pure className swap (66 lines). Save button uses `text-ne-bg0` (LibraryView precedent) instead of `text-white`. Preview pane prose themed via `--tw-prose-*` vars → `ne-*` tokens. |
| 02 | Reusable VersionHistoryModal (common component) | M10 | done | 2026-07-08 | `frameless` prop was needed on `VersionHistoryPanel` (drops `border-l border-ne-line`, defaults to current behavior). |
| 03 | History buttons in companion tabs (Sources, Explorer, Chapter, Reports) | M10 | pending | — | — |
| 04 | History in Manuscript reader mode + final audit | M10 | pending | — | — |

(Status: pending | in-progress | done | blocked | skipped)

## Dependency Graph

```
SESSION-01 ──► SESSION-02 ──► SESSION-03
                    └────────► SESSION-04
```

- 01 is pure restyling; runs first so the modal (02) is born themed.
- 03 and 04 both depend only on 02 and touch different files (parallel-eligible;
  04's final audit assumes 03 landed — run 04 last when executing serially).

## Architecture Reference (feature-specific)

- **All work is M10 (renderer).** Zero backend changes: `VersionService` (M08), the
  `versions:*` IPC channels (M09), and auto-snapshot-on-write already exist and are the
  system of record.
- Data flow: component → `versionStore` (Zustand) → `window.novelEngine.versions.*` →
  IPC → `VersionService` → SQLite `file_versions`.
- Revert refresh: `revertToVersion` writes the file → `BookWatcher` → `fileChangeStore.revision`
  bump → `useBookFile` re-reads. Read-only hosts therefore never pass `onReverted`.
- Full stack/conventions in `FORGE-CONFIG.md`.

## Scope Summary

| Module | Files |
|--------|-------|
| M10 renderer | `components/Files/DiffViewer.tsx`, `components/Files/VersionHistoryPanel.tsx`, `components/Files/FileEditor.tsx`, `components/Manuscript/UserEditsDiffModal.tsx`, `components/Manuscript/ManuscriptView.tsx`, `components/common/VersionHistoryModal.tsx` (new), `components/common/Icon.tsx` (possibly — clock glyph), `components/Workbench/companion/{SourcesTab,ExplorerTab,ChapterTab,ReportsTab}.tsx` |

## Design Decisions

1. **Modal, not inline panel, for read-only surfaces.** Companion tabs are narrow; the
   existing `VersionHistoryPanel` needs width for the diff. A modal (house idiom:
   `UserEditsDiffModal`) works identically from every host with two props.
2. **Reuse `VersionHistoryPanel` as-is** (optionally a `frameless` prop) rather than
   rebuilding — it already owns timeline, diff, revert-confirm, and store lifecycle.
3. **Revert stays enabled everywhere, including Verity drafts.** Reverts snapshot with
   source `'revert'` and surface as user-attributed changes vs. the agent baseline
   (program-011 semantics) — truthful and safe; verified manually in SESSION-04.
4. **Retheme scope limited to version-history surfaces.** Many other components still
   use zinc (Chat, Import, MotifLedger, ...); a full retheme is a separate feature.
   SESSION-04 logs any in-`Files/` leftovers as follow-up.
5. **Brass = selection/action accent, forge = destructive revert, lumen/sable = diff
   add/remove, quill = "You" badge** — mapped from the token palette in `globals.css`.

## Handoff Notes

(Agents append here after each session: what landed, deviations, gotchas for the next session.)

### SESSION-01 (2026-07-08)

- **Landed:** All four version-history surfaces (`DiffViewer`, `VersionHistoryPanel`,
  `FileEditor`, `UserEditsDiffModal`) fully on `ne-*` tokens. Zero `zinc`/`dark:` classes
  remain in these files (grep-verified). `npx tsc --noEmit` clean.
- **`font-ne-mono` exists: yes** (`globals.css` @theme block) — used in `DiffViewer`
  hunk headers and line rows. `FileEditor`'s textarea kept generic `font-mono` (it was
  already `font-mono`; not part of the mapping table).
- **Deviations:**
  - Save button (`FileEditor`): `bg-ne-brass text-ne-bg0 hover:bg-ne-brass-hi` — matched
    the stronger precedent in `LibraryView.tsx:156` (`text-ne-bg0`, not `text-white`),
    as the session prompt invited.
  - `FileEditor` preview pane: `prose dark:prose-invert prose-zinc` replaced with `prose`
    plus `--tw-prose-*` variable overrides mapped to `ne-*` tokens (theme-aware in both
    modes, className-only — no markup change).
  - "Yes, revert" hover uses `transition-opacity` (paired with `hover:opacity-90` per spec).
- **Manual visual pass not yet run** — fold into SESSION-04's audit checklist.
- **Warnings:** working tree contains unrelated modified files (`CHANGELOG.md`,
  `src/application/BuildService.ts`, older program prompts) — left untouched, not staged.

### SESSION-02 (2026-07-08)

- **Landed:** `src/renderer/components/common/VersionHistoryModal.tsx` — standalone modal
  wrapper. Idiom matches `UserEditsDiffModal`: backdrop `bg-black/60 backdrop-blur-sm z-50`,
  click-outside + Escape close, shell `rounded-xl border border-ne-line bg-ne-bg1 shadow-2xl`.
  Shell is `h-[80vh] max-w-3xl` so the timeline/diff split has room.
- **`frameless` prop added** to `VersionHistoryPanel` (optional, default `false`) — the
  modal passes `frameless` to drop the panel's `border-l` and avoid a doubled left edge.
  `FileEditor`'s split-pane usage is unchanged.
- **For SESSION-03/04 wiring:**
  ```tsx
  import { VersionHistoryModal } from '../../common/VersionHistoryModal'; // from companion tabs
  <VersionHistoryModal bookSlug={slug} filePath={path} onClose={...} />   // no onReverted for read-only hosts
  ```
  Component is intentionally unreferenced until SESSION-03 wires the first host.
- **Gotcha found (pre-existing):** an empty 0-byte `VersionHistoryModal.tsx` already
  existed on disk (stray touch); overwritten with the real component.
