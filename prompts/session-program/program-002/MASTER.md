# MASTER — Program 002: p-zero UI Restructure

**State file:** `prompts/session-program/program-002/STATE.md`
**Input source:** `prompts/session-program/program-002/input-files/all-p-zero.md`

---

## Goal

Restructure the Novel Engine UI layout based on the p-zero feature requests:

1. **Pipeline moves right** — out of the left sidebar accordion, into its own dockable right-side column (full height, own width resize handle)
2. **CLI panel docking** — CLI appears as an independent column to the RIGHT of Pipeline when both are open. Two independent columns, side by side.
3. **CLI panel content fills available space** — the Activity Log inside the CLI panel fills all remaining vertical height when expanded, rather than being pinned at a fixed pixel height
4. **Navigation cleanup** — floating `?` HelperButton removed; top-level HelpButton removed; Help moves into Chat dropdown; Reading Mode replaces Help in the nav
5. **Welcome Tour auto-starts Spark** — when the Welcome Tour starts, it automatically creates a Spark conversation so the user arrives in a live Spark session
6. **Pipeline tour steps updated** — all tour steps targeting the pipeline now point to `[data-tour="pipeline-panel"]` on the right column, with `placement: 'left'`
7. **New Book button** in the Pipeline panel header

---

## Layout Model

```
AppLayout flex row
  Sidebar (left, shrink-0)
  main (flex-1)
  PipelinePanel (shrink-0, own width resize, shown when pipelineOpen)
  CliActivityPanel (shrink-0, own width resize, shown when cliOpen)
```

Pipeline and CLI are **independent columns**. No shared wrapper. No vertical stacking. Each appears/disappears independently. CLI is always to the right of Pipeline.

---

## Sessions

| # | File | Title | Effort |
|---|------|-------|--------|
| 01 | `SESSION-01.md` | Pipeline Column + Sidebar Cleanup | ~25 min |
| 02 | `SESSION-02.md` | Nav Cleanup: Help → Chat, Reading Mode, Remove Floats | ~20 min |
| 03 | `SESSION-03.md` | Tour: Auto-Start Spark + Update Pipeline Steps | ~15 min |
| 04 | `SESSION-04.md` | CLI Panel Content Fill | ~10 min |

SESSION-04 is independent — it can run in any order relative to 02 and 03. SESSION-01 must run first (creates PipelinePanel). SESSION-02 depends on SESSION-01 (reads modified Sidebar.tsx). SESSION-03 depends on SESSION-01 (reads PipelinePanel data-tour attr).

---

## New Files

| File | Purpose |
|------|---------|
| `src/renderer/stores/rightPanelStore.ts` | Tracks `pipelineOpen` state |
| `src/renderer/components/RightPanel/PipelinePanel.tsx` | Independent right column wrapping PipelineTracker |
| `src/renderer/components/RightPanel/index.ts` | Barrel export |

## Modified Files

| File | Sessions | What Changes |
|------|---------|-------------|
| `AppLayout.tsx` | 01, 02 | Adds `{pipelineOpen && <PipelinePanel />}` before CLI; removes HelperButton |
| `Sidebar.tsx` | 01, 02 | Removes pipeline accordion; simplifies Files; adds PipelineToggleButton + ChatHelpEntry + Reading Mode nav item; removes HelpButton |
| `CliActivityPanel.tsx` | 04 | `CollapsiblePanel` gains `fill` prop; `EntryList` switches to `fill`, `defaultExpanded: true` |
| `tourStore.ts` | 03 | `startTour` navigates to chat, opens pipeline, auto-creates Spark conversation for welcome tour |
| `tourDefinitions.ts` | 03 | Pipeline steps target `[data-tour="pipeline-panel"]`, placement: left; welcome-chat updated |

---

## Final Verification

```bash
npx tsc --noEmit
grep -r "pipeline-tracker" src/renderer/tours/
```

Visual checklist (all sessions complete):
- No pipeline accordion in left sidebar; Files always visible
- Pipeline toggle in sidebar nav shows/hides pipeline right column
- Pipeline column renders to the right of main content; has left-edge drag handle
- Pipeline header: title "Pipeline", New Book button, close button
- `data-tour="pipeline-panel"` on outermost Pipeline column div
- CLI panel renders to the RIGHT of the Pipeline column
- CLI Activity Log is open by default and fills remaining panel height
- Collapsing/expanding other CLI sections causes Activity Log to grow/shrink
- No floating `?` button anywhere
- Chat dropdown Help entry opens HelperPanel
- Reading Mode in sidebar nav navigates to reading view
- Welcome Tour start: navigates to chat, opens pipeline, creates Spark conversation
- Pipeline tour steps spotlight the right column; popovers appear to their left
