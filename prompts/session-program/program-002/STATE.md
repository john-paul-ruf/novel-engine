# STATE — Program 002 (p-zero UI Restructure)

> Live status file. Update after each session completes.

---

## Program Status

**Overall:** ✅ Complete
**Sessions:** 4 total

---

## Session Status

| Session | Title | Status | Key Outputs |
|---------|-------|--------|-------------|
| SESSION-01 | Pipeline Column + Sidebar Cleanup | ✅ Complete | `rightPanelStore.ts`, `RightPanel/PipelinePanel.tsx`, `RightPanel/index.ts`, AppLayout + Sidebar modified |
| SESSION-02 | Nav Cleanup: Help → Chat, Reading Mode, Remove Floats | ✅ Complete | Sidebar HelpButton removed, HelperButton removed, ChatHelpEntry added, Reading Mode nav item |
| SESSION-03 | Tour: Auto-Start Spark + Update Pipeline Steps | ✅ Complete | tourStore auto-creates Spark conversation, tourDefinitions pipeline-panel selectors |
| SESSION-04 | CLI Panel Content Fill | ✅ Complete | CollapsiblePanel gets fill prop; EntryList fills available space by default |

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

### SESSION-01
- `src/renderer/stores/rightPanelStore.ts` — new Zustand store with `persist`; tracks `pipelineOpen` (default `true`)
- `src/renderer/components/RightPanel/PipelinePanel.tsx` — new independent right column; own `useResizeHandle` (direction `'right'`, 300px default); `NewBookButton` with self-contained modal; `CloseButton`; `data-tour="pipeline-panel"` on outermost div; left-edge `ResizeHandle`
- `src/renderer/components/RightPanel/index.ts` — barrel export
- `src/renderer/components/Layout/AppLayout.tsx` — imports `PipelinePanel` + `useRightPanelStore`; renders `{pipelineOpen && <PipelinePanel />}` before `{isCliPanelOpen && <CliActivityPanel />}`
- `src/renderer/components/Layout/Sidebar.tsx` — removed `PipelineTracker` import; removed accordion state (`activeSection`, `pipelineOpen`, `filesOpen`, `toggleSection`); replaced pipeline accordion with `null` in non-pitch-room view; Files section always visible, no toggle; added `PipelineToggleButton` function + nav item before CLI separator; added `useRightPanelStore` import

### SESSION-02
- `src/renderer/components/Layout/AppLayout.tsx` — removed `HelperButton` import and `<HelperButton />` render; `<HelperPanel />` retained
- `src/renderer/components/Layout/Sidebar.tsx` — removed `HELP_TOURS` constant, `HelpButton` function, and `<HelpButton />` render; removed now-dead `useTourStore`, `useRef`, `useEffect`, `TourId` imports; added `useHelperStore` import; added `ChatHelpEntry` function (toggles `helperStore`); added `<ChatHelpEntry />` at bottom of `ChatNavGroup` expanded section; added `'reading'` to `ViewId`, `NAV_TOOLTIPS`, and `NAV_ITEMS` (📖 Reading Mode)
- `src/renderer/components/Settings/SettingsView.tsx` — **no change needed**: `GuidedToursSection` already fully implemented in the Profile tab (Welcome Tour, First Book Guide, Pipeline Deep Dive)

### SESSION-03
- `src/renderer/stores/tourStore.ts` — added imports for `viewStore`, `rightPanelStore`, `chatStore`, `bookStore`; `startTour` now calls `navigate('chat')` + `openPipeline()` for all tours; welcome tour fires `createConversation('Spark', activeSlug, 'pitch', 'pipeline')` fire-and-forget with `activeSlug` guard
- `src/renderer/tours/tourDefinitions.ts` — `welcome-pipeline`: selector → `pipeline-panel`, placement → `left`, body updated; `welcome-chat`: title → "Meet Spark", body updated; `welcome-nav`: body updated (Reading Mode in, Motif Ledger out, Pipeline/CLI toggles mentioned); `first-book-advance`: selector → `pipeline-panel`, placement → `left`, body updated; all 7 `PIPELINE_INTRO_TOUR` steps: selector → `pipeline-panel`, placement → `left`; zero `pipeline-tracker` references remain

### SESSION-04
- `src/renderer/components/CliActivity/CliActivityPanel.tsx` — `CollapsiblePanel` gains `fill?: boolean` prop; `CallHeader` changed to `defaultExpanded={false}`; `EntryList` switched from `resizable` to `fill` with `defaultExpanded={true}`

---

## Blockers

None at program start.
