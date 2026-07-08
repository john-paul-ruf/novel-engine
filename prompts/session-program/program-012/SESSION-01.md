# SESSION-01 — Retheme the Version-History Surfaces to `ne-*` Tokens

> **Program:** Novel Engine · **Feature:** version-history-everywhere
> **Modules:** M10 (renderer) · **Depends on:** none · **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | renderer | `src/renderer/styles/globals.css` (token block, lines ~10–36) | Canonical `ne-*` token names for both light and dark themes |
| M10 | renderer | `src/renderer/components/Workbench/companion/SourcesTab.tsx` | Reference for current chip/button/border styling idiom |

## Context

The version-history UI (`FileEditor` toolbar, `VersionHistoryPanel`, `DiffViewer`) predates
the `streamlined-ui` redesign and still uses the zinc/blue/hardcoded-dark Tailwind palette.
It renders as a dark slab with blue accents inside the parchment/brass app (see
`input-files/version-history-everywhere-request.md`). `UserEditsDiffModal` (program-011)
is mostly themed but retains zinc remnants and embeds `DiffViewer`.

The `ne-*` tokens are theme-aware (light/dark switch automatically), so **all `dark:`
variants must be removed** along with the zinc classes.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/renderer/components/Files/DiffViewer.tsx` | Modify | Full palette swap to `ne-*` tokens |
| `src/renderer/components/Files/VersionHistoryPanel.tsx` | Modify | Full palette swap to `ne-*` tokens |
| `src/renderer/components/Files/FileEditor.tsx` | Modify | Toolbar/editor palette swap to `ne-*` tokens |
| `src/renderer/components/Manuscript/UserEditsDiffModal.tsx` | Modify | Replace remaining zinc classes |

## Implementation

Read each file fully before editing. This session changes **className strings only** —
no logic, props, state, or markup-structure changes.

### 1. Token mapping (apply consistently across all four files)

| Legacy | Replacement |
|--------|-------------|
| `bg-zinc-900`, `bg-white dark:bg-zinc-950` | `bg-ne-bg1` (panels) / `bg-ne-bg0` (editor/textarea surfaces) |
| `bg-zinc-800`, `bg-zinc-100 dark:bg-zinc-800` | `bg-ne-bg2` |
| `border-zinc-200/300/700 (+dark:)` | `border-ne-line` |
| `border-zinc-800 (+dark:)` | `border-ne-line-soft` |
| `text-zinc-100/900`, `text-zinc-800 dark:text-zinc-200` | `text-ne-ink` |
| `text-zinc-300/400/500 (+dark:)` | `text-ne-ink-dim` |
| `text-zinc-600`, `placeholder-zinc-*` | `text-ne-ink-faint` / `placeholder-ne-ink-faint` |
| Blue accents (`blue-500/600`, selection, active toggles) | brass: `border-ne-brass`, `bg-ne-brass-dim`, `text-ne-brass` |
| Green diff-add (`green-300/400/950`) | `text-ne-lumen`, bg `bg-ne-lumen/10` |
| Red diff-remove (`red-300/400/950`) | `text-ne-sable`, bg `bg-ne-sable/10` |
| Amber revert (`amber-*`) | `text-ne-forge`, `border-ne-forge/40`, `bg-ne-forge/15` |

### 2. `DiffViewer.tsx`

- `HunkHeader`: `bg-ne-bg2 text-ne-ink-faint border-y border-ne-line-soft`; use `font-ne-mono` if that utility exists in `globals.css` (check; else keep `font-mono`).
- `DiffLineRow`: add rows `bg-ne-lumen/10` + `text-ne-lumen`; remove rows `bg-ne-sable/10` + `text-ne-sable`; context `text-ne-ink-dim`; line numbers `text-ne-ink-faint`, separators `border-ne-line-soft`.
- `DiffSummary`: `bg-ne-bg1 border-b border-ne-line`; additions `text-ne-lumen`, deletions `text-ne-sable`, "No changes" `text-ne-ink-faint`.
- Container: `border border-ne-line rounded-lg`.

### 3. `VersionHistoryPanel.tsx`

- `SOURCE_LABELS` badge classes:
  - `user` → `bg-ne-quill/15 text-ne-quill border-ne-quill/30`
  - `agent` → `bg-ne-brass-dim text-ne-brass border-ne-brass/30`
  - `revert` → `bg-ne-forge/15 text-ne-forge border-ne-forge/30`
- `VersionEntry`: selected → `border-ne-brass bg-ne-brass-dim`; idle → `border-ne-line hover:border-ne-brass/50 hover:bg-ne-bg2`; timestamp `text-ne-ink-dim`; byte size `text-ne-ink-faint`.
- Revert button: `bg-ne-forge/15 text-ne-forge border border-ne-forge/40 hover:bg-ne-forge/25`. Confirmation "Yes, revert" → solid `bg-ne-forge text-white hover:opacity-90`; "Cancel" → `bg-ne-bg2 text-ne-ink-dim hover:text-ne-ink`.
- Panel chrome: root `bg-ne-bg1 border-l border-ne-line`; header title `text-ne-ink`, subtitle `text-ne-ink-faint`; close button `text-ne-ink-dim hover:text-ne-ink`; error banner `bg-ne-sable/10 border-ne-sable/30 text-ne-sable`; empty/loading states `text-ne-ink-faint`.

### 4. `FileEditor.tsx`

- Toolbar: `border-b border-ne-line-soft`; filename `text-ne-ink`; unsaved dot `text-ne-forge`; word count `text-ne-ink-faint`.
- Preview toggle + History toggle: active → `border border-ne-brass/60 bg-ne-brass-dim text-ne-ink`; inactive → `border border-ne-line bg-ne-bg2 text-ne-ink-dim hover:text-ne-ink` (match the chip idiom in `SourcesTab.tsx:101-107`).
- Save button: `bg-ne-brass text-white hover:bg-ne-brass-hi disabled:opacity-50` — check how other primary actions style themselves (e.g. "View my changes" in `ManuscriptView.tsx`) and match if a stronger precedent exists.
- Cancel: `bg-ne-bg2 text-ne-ink-dim hover:text-ne-ink`.
- Textarea: `bg-ne-bg0 text-ne-ink placeholder-ne-ink-faint`; preview-pane divider `border-ne-line-soft`; history-panel divider `border-ne-line`.

### 5. `UserEditsDiffModal.tsx`

Replace the 9 remaining zinc classnames (lines ~85–132): modal shell `border-ne-line bg-ne-bg1`, header border `border-ne-line-soft`, title `text-ne-ink`, close `text-ne-ink-dim hover:text-ne-ink`, loading/empty `text-ne-ink-faint`, footer border `border-ne-line-soft`, secondary button `border-ne-line text-ne-ink-dim hover:text-ne-ink`. Drop all `dark:` variants.

## Verification

1. `npx tsc --noEmit` — clean.
2. `grep -n "zinc\|dark:" src/renderer/components/Files/DiffViewer.tsx src/renderer/components/Files/VersionHistoryPanel.tsx src/renderer/components/Files/FileEditor.tsx src/renderer/components/Manuscript/UserEditsDiffModal.tsx` — **zero matches**.
3. Manual (`npm start`): Manuscript → Editor → History. Panel, badges, diff colors, and revert flow render in parchment/brass theme; toggle dark mode (if a theme toggle exists in Settings) and confirm both themes look correct.
4. Architecture compliance: no new imports, renderer-only change.

## State Update

Update `prompts/session-program/program-012/STATE.md`: SESSION-01 → done, date, notes
(any token-mapping deviations you chose), handoff (e.g. "font-ne-mono exists: yes/no").
