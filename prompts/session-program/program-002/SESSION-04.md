# SESSION-04 — CLI Panel Content Fill: Activity Log Takes Available Space

## Context

**Program:** Novel Engine UI Restructure (p-zero)
**Feature:** Inside the CLI Activity panel, all sections default to collapsed except the Activity Log, which defaults open and fills all remaining vertical space. Currently `CallHeader` defaults open (forcing the user to close it every time) and `EntryList` is pinned at a fixed 200px height instead of filling available space.

**Depends on:** None. Independent of other sessions — only touches `CliActivityPanel.tsx`.
**Layers touched:** M10 (renderer — `src/renderer/components/CliActivity/CliActivityPanel.tsx`)

---

## Root Cause

`CollapsiblePanel` (line ~87) always renders its outer wrapper as `shrink-0`. The `resizable` prop gives a fixed `style={{ height }}` with a drag handle. Neither mode ever uses `flex-1`.

The selected-call detail container has `flex min-h-0 flex-1 flex-col overflow-hidden` — it distributes space — but every child refuses to take it:

```tsx
<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
  <CallHeader />         // shrink-0, fixed resizable height
  <PhaseTimeline />      // shrink-0, fixed resizable height
  <ToolBreakdown />      // shrink-0, fixed resizable height
  <DiagnosticsSection /> // shrink-0, fixed resizable height
  <EntryList />          // shrink-0, fixed 200px resizable height ← the problem
</div>
```

Result: the Activity Log is pinned at 200px and unused space sits below it when the panel is taller.

---

## Pre-Session Reads

Read `src/renderer/components/CliActivity/CliActivityPanel.tsx` in full before writing code. Pay particular attention to:
- `CollapsiblePanel` function (lines ~87–153)
- `EntryList` function (lines ~637–710)
- The selected-call rendering block in `CliActivityPanel` (lines ~785–814)

---

## What to Build

### Only file modified: `src/renderer/components/CliActivity/CliActivityPanel.tsx`

#### Change 1: Add `fill` prop to `CollapsiblePanel`

Add `fill?: boolean` to the props destructure alongside `resizable`:

```typescript
function CollapsiblePanel({ title, defaultExpanded = true, isActive, badge, resizable, fill, children }: {
  title: string;
  defaultExpanded?: boolean;
  isActive?: boolean;
  badge?: React.ReactNode;
  resizable?: { storageKey: string; initialHeight: number; minHeight: number; maxHeight: number };
  fill?: boolean;
  children: React.ReactNode;
})
```

`fill` and `resizable` are mutually exclusive. When `fill={true}`:
- While expanded: outer wrapper uses `flex min-h-0 flex-1 flex-col` (no `shrink-0`)
- While collapsed: outer wrapper reverts to `shrink-0` (it is just a header strip)
- Content area: `min-h-0 flex-1 overflow-y-auto` (no fixed height, no drag handle)

The `useVerticalResize` hook must keep running unconditionally (React rules). Its values are simply unused when `fill={true}`.

Updated outer wrapper class:
```tsx
<div className={`${fill && expanded ? 'flex min-h-0 flex-1 flex-col' : 'shrink-0'} border-b border-zinc-300 dark:border-zinc-700/50`}>
```

Updated content render (replace the existing `{expanded && (...)}` block):
```tsx
{expanded && (
  <>
    {fill ? (
      <div className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
    ) : resizable ? (
      <div className="overflow-y-auto" style={{ height }}>
        {children}
      </div>
    ) : (
      children
    )}
    {resizable && !fill && (
      <VerticalDragHandle
        isDragging={isDragging}
        onMouseDown={onMouseDown}
        onDoubleClick={resetHeight}
      />
    )}
  </>
)}
```

#### Change 2: Set `CallHeader` to default closed

`CallHeader` is the only section besides `EntryList` that currently defaults open (`defaultExpanded={true}`, line ~426). Change it to `defaultExpanded={false}` so the panel opens with all sections collapsed except the Activity Log.

Locate the `CollapsiblePanel` call inside `CallHeader` (it uses the agent name + role as its title):

Before:
```tsx
<CollapsiblePanel
  title={`${meta.agentName} — ${meta.agentRole}`}
  defaultExpanded={true}
  isActive={isActive}
  badge={durationBadge}
  resizable={{ storageKey: 'novel-engine:cli-header-height', initialHeight: 100, minHeight: 50, maxHeight: 300 }}
>
```

After:
```tsx
<CollapsiblePanel
  title={`${meta.agentName} — ${meta.agentRole}`}
  defaultExpanded={false}
  isActive={isActive}
  badge={durationBadge}
  resizable={{ storageKey: 'novel-engine:cli-header-height', initialHeight: 100, minHeight: 50, maxHeight: 300 }}
>
```

One word change: `true` → `false`. All other sections (Phases, Tool Usage, Context Diagnostics) already default to `false` — no changes needed.

---

#### Change 3: Update `EntryList` to use `fill` instead of `resizable`

Locate the `CollapsiblePanel` call inside `EntryList`. Replace:

```tsx
<CollapsiblePanel
  title="Activity Log"
  defaultExpanded={false}
  isActive={call.isActive}
  badge={entryBadge}
  resizable={{ storageKey: 'novel-engine:cli-activity-height', initialHeight: 200, minHeight: 60, maxHeight: 600 }}
>
  <div ref={scrollRef} className="h-full overflow-y-auto px-1 py-1">
```

With:

```tsx
<CollapsiblePanel
  title="Activity Log"
  defaultExpanded={true}
  isActive={call.isActive}
  badge={entryBadge}
  fill
>
  <div ref={scrollRef} className="overflow-y-auto px-1 py-1">
```

Two sub-changes in the inner div:
- Remove `h-full` — the flex parent (`CollapsiblePanel` fill wrapper) now provides the height via `flex-1`
- Keep `overflow-y-auto` — this div is the scroll container for the entries

The `scrollRef` and the auto-scroll `useEffect` are unchanged. The ref is still on the right element.

`defaultExpanded` changes from `false` to `true` — the Activity Log is the primary content of the panel and should be open by default.

---

## Verification

```bash
npx tsc --noEmit
```

Manual checks:
- Open CLI Activity panel, select any call → **all sections are collapsed** except the Activity Log
- Activity Log is open by default and fills all remaining vertical space
- Expand CallHeader → Activity Log shrinks to share the space; collapse it → Activity Log grows back
- Long activity logs scroll within the fill area (not the page)
- Auto-scroll to bottom still works as new entries arrive during an active call
- Collapsing the Activity Log itself → it becomes just a header strip; unused space sits below (expected — no other fill section exists)
- Phases, Tool Usage, Context Diagnostics: unchanged — still default closed, still resizable when expanded

## Architecture Compliance

- Single file change within M10 renderer — no layer violations
- No new imports, no store changes, no IPC calls
- Hook call order unchanged (`useVerticalResize` still runs unconditionally)
