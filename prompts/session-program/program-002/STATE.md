# STATE — Program 002 (p-zero UI Restructure)

> Live status file. Update after each session completes.

---

## Program Status

**Overall:** Not Started
**Sessions:** 4 total

---

## Session Status

| Session | Title | Status | Key Outputs |
|---------|-------|--------|-------------|
| SESSION-01 | Pipeline Column + Sidebar Cleanup | Pending | `rightPanelStore.ts`, `RightPanel/PipelinePanel.tsx`, `RightPanel/index.ts`, AppLayout + Sidebar modified |
| SESSION-02 | Nav Cleanup: Help → Chat, Reading Mode, Remove Floats | Pending | Sidebar HelpButton removed, HelperButton removed, ChatHelpEntry added, Reading Mode nav item |
| SESSION-03 | Tour: Auto-Start Spark + Update Pipeline Steps | Pending | tourStore auto-creates Spark conversation, tourDefinitions pipeline-panel selectors |
| SESSION-04 | CLI Panel Content Fill | Pending | CollapsiblePanel gets fill prop; EntryList fills available space by default |

---

## Design Decisions

### Layout: Two Independent Right Columns

```
Sidebar | Main (flex-1) | PipelinePanel? | CliActivityPanel?
```

- **PipelinePanel** is a new standalone right column — full height, own `useResizeHandle`, left-edge drag handle. Controlled by `rightPanelStore.pipelineOpen`.
- **CliActivityPanel** is **unchanged structurally** — it remains an independent right column. Renders to the RIGHT of PipelinePanel when both open.
- No shared wrapper. No vertical stacking.

### Pipeline Panel

- Lives in `src/renderer/components/RightPanel/PipelinePanel.tsx`
- `data-tour="pipeline-panel"` on the outermost div (the column wrapper)
- Has "New Book" button and close button in header
- Width default: 300px, min: 220px, max: 480px

### CLI Panel Content Fill (SESSION-04)

The issue: `CollapsiblePanel` hardcodes `shrink-0` on every section. `EntryList` uses `resizable` at 200px — doesn't fill available space.

The fix: Add `fill?: boolean` to `CollapsiblePanel`. When `fill={true}` and expanded, outer div is `flex min-h-0 flex-1 flex-col` (not `shrink-0`), content wrapper is `min-h-0 flex-1 overflow-y-auto`. `EntryList` uses `fill` + `defaultExpanded={true}`.

When collapsed, `fill` sections revert to `shrink-0` (they are just a header strip).

### Tour Welcome: Auto-Start Spark

`tourStore.startTour('welcome')` now:
1. `useViewStore.getState().navigate('chat')`
2. `useRightPanelStore.getState().openPipeline()`
3. Fire-and-forget `useChatStore.getState().createConversation('Spark', activeSlug, 'pitch', 'pipeline')`

All tours get steps 1 and 2. Step 3 (auto-Spark) is welcome-only.

### Tour Pipeline Step Selectors

All tour steps that previously targeted `[data-tour="pipeline-tracker"]` now target `[data-tour="pipeline-panel"]` with `placement: 'left'`.

### Help Restructure

- `HelperButton` (floating FAB) removed from AppLayout
- `HelpButton` (tour dropdown) removed from sidebar nav
- `ChatHelpEntry` added at bottom of ChatNavGroup expanded section — triggers `helperStore.toggle()`
- Tours exposed in Settings view

---

## Files Modified

Populated as sessions complete.

---

## Blockers

None at program start.
