# SESSION-03 — History Buttons in All Companion Tabs

> **Program:** Novel Engine · **Feature:** version-history-everywhere
> **Modules:** M10 (renderer) · **Depends on:** SESSION-02 · **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | renderer | `src/renderer/components/common/VersionHistoryModal.tsx` | The component being wired (created in SESSION-02) |
| M10 | renderer | `src/renderer/components/Workbench/companion/SourcesTab.tsx` | Host 1 — selected doc path in `selected` state |
| M10 | renderer | `src/renderer/components/Workbench/companion/ExplorerTab.tsx` | Host 2 — previewed file path in `previewPath` state |
| M10 | renderer | `src/renderer/components/Workbench/companion/ChapterTab.tsx` | Host 3 — path is `chapters/${selected}/draft.md` |
| M10 | renderer | `src/renderer/components/Workbench/companion/ReportsTab.tsx` | Host 4 — read fully; selection state name may differ |
| M10 | renderer | `src/renderer/components/common/Icon.tsx` | Available icon names (need a clock/history glyph) |

## Context

This makes version history reachable for **every generated document** — pitch, scene
outline, story bible, voice profile (Sources), any book file (Explorer), chapter drafts
(Chapter), and agent reports (Reports) — without entering edit mode. Each tab gets a
small **History** button in its header bar that opens `VersionHistoryModal` for the
currently selected/previewed file.

Revert needs no host-side refresh: all four tabs render through `useBookFile`, which
re-reads on `fileChangeStore.revision` bumps (revert writes the file → BookWatcher
fires). Do **not** pass `onReverted`.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/renderer/components/Workbench/companion/SourcesTab.tsx` | Modify | History button in doc-chip header row (right-aligned); modal state |
| `src/renderer/components/Workbench/companion/ExplorerTab.tsx` | Modify | History button in the preview header next to Edit; modal state |
| `src/renderer/components/Workbench/companion/ChapterTab.tsx` | Modify | History button in the select/scrubber header row; modal state |
| `src/renderer/components/Workbench/companion/ReportsTab.tsx` | Modify | History button beside its doc selector; modal state |

## Implementation

### 1. Shared pattern (apply per tab)

```tsx
const [historyPath, setHistoryPath] = useState<string | null>(null);
// header button (only render when a file is selected AND it exists on disk):
<button
  onClick={() => setHistoryPath(currentPath)}
  title="Version history"
  className="flex items-center gap-1 rounded-md border border-ne-line bg-ne-bg2 px-2 py-1 text-[11px] text-ne-ink-dim transition-colors hover:border-ne-brass/50 hover:text-ne-ink"
>
  <Icon name="clock" size={10} strokeWidth={2} />
  History
</button>
// at component root, after the main layout:
{historyPath && activeSlug && (
  <VersionHistoryModal
    bookSlug={activeSlug}
    filePath={historyPath}
    onClose={() => setHistoryPath(null)}
  />
)}
```

Check `Icon.tsx` for an existing clock/history glyph; if none exists, add one
(`clock`: circle + hands, matching the stroke style of existing icons) — do not inline
raw `<svg>` in the tabs.

Reset `historyPath` to `null` when `activeSlug` changes (add to each tab's existing
book-switch `useEffect`).

### 2. Per-tab placement

- **`SourcesTab`**: right-align the button inside the doc-chip header row
  (`ml-auto` on a wrapper). Render only when `selected` is set and
  `statuses[selected]?.exists`. `currentPath = selected`.
- **`ExplorerTab`**: in the preview header, before/next to the **Edit** button.
  Render for **all** previewed files — including Verity drafts where Edit is hidden
  (history is exactly what read-only drafts need). `currentPath = previewPath`.
  Directory-browser mode gets no button.
- **`ChapterTab`**: right side of the select/scrubber header row. Render when
  `selected` is set and the draft loaded without error.
  `currentPath = 'chapters/' + selected + '/draft.md'`.
- **`ReportsTab`**: read the file first; mirror the same pattern next to its report
  selector using its selected-report path state.

## Verification

1. `npx tsc --noEmit` — clean.
2. `npm start` manual pass:
   - Sources → Story Bible → History → versions listed, diff renders, revert restores an
     older bible and the viewer refreshes in place.
   - Explorer → preview a Verity chapter draft (no Edit button) → History opens.
   - Chapter tab → History shows the draft's agent snapshots.
   - Reports tab → History on a report.
   - Escape and backdrop-click both close the modal.
3. Architecture compliance: no new IPC; backend access only via existing stores.

## State Update

Update `prompts/session-program/program-012/STATE.md`: SESSION-03 → done, date, notes
(icon added? ReportsTab state-name specifics), handoff for SESSION-04.
