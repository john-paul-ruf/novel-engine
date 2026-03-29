# SESSION-02 — Nav Cleanup: Help → Chat Dropdown, Reading Mode, Remove Floats

## Context

**Program:** Novel Engine UI Restructure (p-zero)
**Feature:** Navigation restructure. The floating HelperButton (`?`) moves into the Chat dropdown. The top-level HelpButton (tours) is removed and replaced with a Reading Mode nav item.

**Depends on:** SESSION-01 (Sidebar.tsx was modified — read the post-SESSION-01 version before editing)
**Layers touched:** M10 (renderer — components, layout)

---

## Clarification on What Changes

| Before | After |
|--------|-------|
| `HelperButton` — floating blue `?` circle bottom-right | **Removed** from AppLayout |
| `HelpButton` in sidebar nav — opens tour dropdown | **Removed**, replaced by Reading Mode nav item |
| Chat dropdown expanded: Current Chat, Hot Take, Ad Hoc | Chat dropdown expanded: Current Chat, Hot Take, Ad Hoc, **Help** (opens HelperPanel) |
| Reading Mode only reachable from code | **Reading Mode** nav item in sidebar |

Tours (Welcome Tour, Pipeline Guide) are not deleted — they move to Settings view.

---

## Pre-Session Reads

Before writing any code, read these files in full:

1. `src/renderer/components/Layout/AppLayout.tsx` (post-SESSION-01)
2. `src/renderer/components/Layout/Sidebar.tsx` (post-SESSION-01)
3. `src/renderer/components/Helper/HelperButton.tsx`
4. `src/renderer/stores/helperStore.ts` — find `toggle` and `isOpen`
5. `src/renderer/components/Settings/SettingsView.tsx` — check if a tours section exists

---

## What to Build

### 1. Modify `src/renderer/components/Layout/AppLayout.tsx`

Remove `<HelperButton />` render and its import. Keep `<HelperPanel />`.

Before:
```tsx
<HelperPanel />
<HelperButton />
```

After:
```tsx
<HelperPanel />
```

Remove: `import { HelperButton } from '../Helper/HelperButton';`

---

### 2. Modify `src/renderer/components/Layout/Sidebar.tsx`

**A. Remove the entire `HelpButton` function** (the one that renders a dropdown with "Welcome Tour" / "Pipeline Guide" entries). Remove its render call from the bottom nav.

**B. Add `ChatHelpEntry` component** (new local function in Sidebar.tsx):

```tsx
function ChatHelpEntry(): React.ReactElement {
  const toggle = useHelperStore((s) => s.toggle);
  const isOpen = useHelperStore((s) => s.isOpen);
  return (
    <button
      onClick={toggle}
      className={`no-drag flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors ${
        isOpen
          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200'
      }`}
    >
      <span>❓</span>
      <span>Help</span>
    </button>
  );
}
```

Add `import { useHelperStore } from '../../stores/helperStore';` at the top.

**C. Add `ChatHelpEntry` to `ChatNavGroup`'s expanded section** — at the bottom, after `<AdhocRevisionButton compact />`:

```tsx
{expanded && (
  <div className="ml-5 mb-0.5 space-y-0.5">
    <button ...>💬 Current Chat</button>
    <HotTakeButton compact />
    <AdhocRevisionButton compact />
    <ChatHelpEntry />   {/* ← new, at bottom */}
  </div>
)}
```

**D. Add Reading Mode to `NAV_ITEMS`** and update `NAV_TOOLTIPS`:

```typescript
type ViewId = 'chat' | 'files' | 'build' | 'pitch-room' | 'settings' | 'reading';

const NAV_TOOLTIPS: Record<ViewId, string> = {
  chat: 'Talk to AI agents about your book',
  files: 'Browse and edit your manuscript files (includes Motif Ledger)',
  build: 'Export your manuscript to DOCX, EPUB, or PDF',
  'pitch-room': 'Free brainstorming space — pitch ideas without committing to a book',
  reading: 'Read the full manuscript from start to finish',
  settings: 'App preferences, model selection, and guided tours',
};

const NAV_ITEMS: { id: ViewId; label: string; icon: string }[] = [
  { id: 'files', label: 'Files', icon: '📁' },
  { id: 'build', label: 'Build', icon: '📦' },
  { id: 'pitch-room', label: 'Pitch Room', icon: '💡' },
  { id: 'reading', label: 'Reading Mode', icon: '📖' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];
```

**E. Final bottom nav order:**
1. ChatNavGroup (expanded: Current Chat, Hot Take, Ad Hoc, Help)
2. Files, Build, Pitch Room, Reading Mode, Settings (via NAV_ITEMS map)
3. PipelineToggleButton (from SESSION-01)
4. CLI Activity separator + CliActivityButton

---

### 3. Add tours section to Settings (if missing)

Read `src/renderer/components/Settings/SettingsView.tsx`. If no tours section exists, add one. It should render the same two tours that the old HelpButton showed:

```tsx
// Near the bottom of SettingsView content
<div className="space-y-2">
  <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Guided Tours</h3>
  {[
    { id: 'welcome' as TourId, label: 'Welcome Tour' },
    { id: 'pipeline-intro' as TourId, label: 'Pipeline Guide' },
  ].map((tour) => (
    <button
      key={tour.id}
      onClick={() => startTour(tour.id)}
      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
    >
      {tour.label}
    </button>
  ))}
</div>
```

Import `useTourStore` and `type TourId` as needed.

---

## Verification

```bash
npx tsc --noEmit
```

Manual checks:
- No floating blue `?` button anywhere on screen
- No standalone "Help" item in sidebar bottom nav
- Chat dropdown (expanded) shows Help at the bottom — clicking opens HelperPanel
- "Reading Mode" appears in sidebar nav, navigates to reading view
- Tours accessible from Settings view
- All other nav items still work

## Architecture Compliance

- All changes are in M10 (renderer) — no layer violations
- No new IPC calls introduced
- `HelperPanel` still renders in AppLayout (only the trigger moved)
