# SESSION-01 — Right Panel System: Pipeline Column + Sidebar Cleanup

## Context

**Program:** Novel Engine UI Restructure (p-zero)
**Feature:** Pipeline moves from the left sidebar accordion to its own dockable right-side column. The CLI Activity panel remains unchanged — it already works as a standalone right column and simply renders to the right of Pipeline when both are open.

**Depends on:** Existing codebase (no prior sessions in this program)
**Layers touched:** M10 (renderer — stores, components, layout)

---

## Layout Model (read this first)

The app flex row after this session:

```
[ Sidebar ] [ Main (flex-1) ] [ PipelinePanel? ] [ CliActivityPanel? ]
```

- **PipelinePanel** is a new independent right-side column — full height, resizable horizontal width via left-edge drag handle. Rendered in AppLayout when `pipelineOpen === true`.
- **CliActivityPanel** is unchanged — it was already an independent right column with its own width resize. It stays exactly as it was. It renders when `cliActivityStore.isOpen === true`.
- There is no shared wrapper, no vertical stacking, no `RightPanelColumn` component. The two panels are siblings in the flex row. Each manages its own width.

---

## Pre-Session Reads

Before writing any code, read these files in full:

1. `src/renderer/components/Layout/AppLayout.tsx`
2. `src/renderer/components/Layout/Sidebar.tsx`
3. `src/renderer/components/CliActivity/CliActivityPanel.tsx` (lines 719–780 — the exported `CliActivityPanel` function, to understand the column pattern to replicate)
4. `src/renderer/hooks/useResizeHandle.ts` (confirm API: `direction`, `initialWidth`, `minWidth`, `maxWidth`, `storageKey`)
5. `src/renderer/components/Sidebar/BookSelector.tsx` (find the action that triggers new-book creation)
6. `src/renderer/components/Layout/ResizeHandle.tsx` (confirm props: `side`, `isDragging`, `onMouseDown`, `onDoubleClick`)

---

## What to Build

### 1. `src/renderer/stores/rightPanelStore.ts` (new)

Zustand store with `persist` middleware tracking whether the Pipeline right panel is open. CLI open state remains in `cliActivityStore` — unchanged.

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type RightPanelState = {
  pipelineOpen: boolean;
  openPipeline: () => void;
  closePipeline: () => void;
  togglePipeline: () => void;
};

export const useRightPanelStore = create<RightPanelState>()(
  persist(
    (set) => ({
      pipelineOpen: true,
      openPipeline: () => set({ pipelineOpen: true }),
      closePipeline: () => set({ pipelineOpen: false }),
      togglePipeline: () => set((s) => ({ pipelineOpen: !s.pipelineOpen })),
    }),
    {
      name: 'novel-engine:right-panel',
      partialize: (s) => ({ pipelineOpen: s.pipelineOpen }),
    },
  ),
);
```

---

### 2. `src/renderer/components/RightPanel/PipelinePanel.tsx` (new)

A self-contained right-side column component — mirror image of how `CliActivityPanel` works (its own width, its own resize handle), but contains the `PipelineTracker`.

**Width constants:**
```typescript
const PIPELINE_PANEL_DEFAULT = 300;
const PIPELINE_PANEL_MIN = 220;
const PIPELINE_PANEL_MAX = 480;
```

**Structure:**
```tsx
export function PipelinePanel(): React.ReactElement {
  const { width, isDragging, onMouseDown, resetWidth } = useResizeHandle({
    direction: 'right',   // handle sits on left edge
    initialWidth: PIPELINE_PANEL_DEFAULT,
    minWidth: PIPELINE_PANEL_MIN,
    maxWidth: PIPELINE_PANEL_MAX,
    storageKey: 'novel-engine:pipeline-panel-width',
  });

  return (
    <div
      data-tour="pipeline-panel"
      className="relative flex h-full shrink-0 flex-col border-l border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-300 dark:border-zinc-700 px-3 py-2">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Pipeline</span>
        <div className="flex items-center gap-1">
          <NewBookButton />
          <CloseButton />
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PipelineTracker />
      </div>

      {/* Left-edge resize handle */}
      <ResizeHandle
        side="left"
        isDragging={isDragging}
        onMouseDown={onMouseDown}
        onDoubleClick={resetWidth}
      />
    </div>
  );
}
```

**`NewBookButton`:** Read `BookSelector.tsx` to find how it triggers new-book creation (likely a local `useState` opening an inline form, or a store action). If it's a local modal state inside BookSelector, look for a `createBook` or similar action in `useBookStore` instead. Implement:
- Small button: `text-xs px-2 py-1 rounded text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors`
- Label: `+ New Book`
- Title attr: `"Create a new book"`
- Call the same action BookSelector uses

**`CloseButton`:** Calls `useRightPanelStore.getState().closePipeline()`. Icon: standard ×.
```tsx
<button
  onClick={() => useRightPanelStore.getState().closePipeline()}
  className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
  title="Close pipeline"
>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
  </svg>
</button>
```

Imports needed:
```typescript
import { useRightPanelStore } from '../../stores/rightPanelStore';
import { useResizeHandle } from '../../hooks/useResizeHandle';
import { ResizeHandle } from '../Layout/ResizeHandle';
import { PipelineTracker } from '../Sidebar/PipelineTracker';
```

---

### 3. `src/renderer/components/RightPanel/index.ts` (new barrel)

```typescript
export { PipelinePanel } from './PipelinePanel';
```

---

### 4. Modify `src/renderer/components/Layout/AppLayout.tsx`

**A.** Import `PipelinePanel` and `useRightPanelStore`:
```tsx
import { PipelinePanel } from '../RightPanel';
import { useRightPanelStore } from '../../stores/rightPanelStore';
```

**B.** Read `pipelineOpen` from the store:
```tsx
const pipelineOpen = useRightPanelStore((s) => s.pipelineOpen);
```

**C.** Update the flex row to render PipelinePanel before CliActivityPanel:
```tsx
<div className="flex flex-1 overflow-hidden">
  <Sidebar />
  <main data-tour="main-content" className="flex-1 overflow-hidden">
    <ViewContent />
  </main>
  {pipelineOpen && <PipelinePanel />}
  {isCliPanelOpen && <CliActivityPanel />}
</div>
```

Keep `isCliPanelOpen` and `<CliActivityPanel />` exactly as they are today. Only add the pipeline column before it.

---

### 5. Modify `src/renderer/components/Layout/Sidebar.tsx`

**A. Remove the Pipeline accordion.** The current ternary:
```tsx
{currentView === 'pitch-room' ? (
  <div>...PitchHistory...</div>
) : (
  <div className={`flex flex-col ${pipelineOpen ? 'min-h-0 flex-1' : 'shrink-0'}`}>
    ...pipeline accordion with toggle button...
  </div>
)}
```

Replace with: show PitchHistory in pitch-room view only; show nothing otherwise (pipeline is on the right now):
```tsx
{currentView === 'pitch-room' ? (
  <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex shrink-0 items-center border-t border-zinc-200 dark:border-zinc-800 px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-wider text-amber-500 dark:text-amber-400">
        Pitch Sessions
      </span>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <PitchHistory />
    </div>
  </div>
) : null}
```

**B. Simplify Files accordion** — it's the only accordion now, so always show it and let it fill:
```tsx
<div className="flex min-h-0 flex-1 flex-col border-t border-zinc-200 dark:border-zinc-800">
  <div className="flex shrink-0 items-center px-3 py-2">
    <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Files</span>
  </div>
  <div data-tour="file-tree" className="min-h-0 flex-1 overflow-y-auto">
    <FileTree />
  </div>
</div>
```

Remove the Files accordion toggle button — no longer needed.

**C. Remove local accordion state.** Remove the `activeSection`, `pipelineOpen` (local), `filesOpen`, `toggleSection` local state variables — they were for the old accordion. The Sidebar's `activeSection` state controlled which accordion was expanded. With pipeline gone and Files always open, none of these are needed.

**D. Add `PipelineToggleButton`** in the bottom nav section. Define as a local function and render after `NAV_ITEMS.map(...)`, before the CLI Activity separator:

```tsx
function PipelineToggleButton(): React.ReactElement {
  const isOpen = useRightPanelStore((s) => s.pipelineOpen);
  const toggle = useRightPanelStore((s) => s.togglePipeline);
  return (
    <Tooltip content="Show/hide the pipeline tracker" placement="right">
      <button
        onClick={toggle}
        className={`no-drag mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
          isOpen
            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200'
        }`}
      >
        <span className="text-base">🗂️</span>
        <span>Pipeline</span>
      </button>
    </Tooltip>
  );
}
```

Add `import { useRightPanelStore } from '../../stores/rightPanelStore';` at the top.

Bottom nav final order:
1. `<ChatNavGroup .../>` (unchanged)
2. `NAV_ITEMS.map(...)` (Chat, Files, Build, Pitch Room, Settings — Reading Mode added in SESSION-02)
3. `<PipelineToggleButton />` ← new
4. Separator + `<CliActivityButton />`

---

## Files NOT Modified

- `src/renderer/components/CliActivity/CliActivityPanel.tsx` — **zero changes**. It already operates as an independent right column. It stays exactly as it is.

---

## Verification

```bash
npx tsc --noEmit
```

Manual checks:
- Pipeline accordion gone from left sidebar
- Files accordion is always visible, fills remaining sidebar height
- "Pipeline" toggle in sidebar nav shows/hides the pipeline right column
- Pipeline column renders to the right of main content area, has PipelineTracker inside
- Pipeline column has a left-edge drag handle for horizontal resize
- Pipeline header shows "New Book" button and close (×) button
- `data-tour="pipeline-panel"` is on the outermost Pipeline column div
- CLI Activity button still works and renders to the RIGHT of the Pipeline column
- Both panels can be open simultaneously as independent side-by-side columns
- Closing Pipeline doesn't affect CLI panel; closing CLI doesn't affect Pipeline

## Architecture Compliance

- `rightPanelStore.ts` is pure renderer Zustand state — no IPC, no layer violations
- `PipelinePanel` is renderer-only — imports from renderer stores and components only
- `CliActivityPanel` untouched — ✓
- No `@infra/*` or `@app/*` imports in any new or modified renderer file — ✓
