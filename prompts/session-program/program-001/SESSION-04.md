# SESSION-04 — Sidebar: Chat Expandable + Hot Take / Adhoc Nesting + Help Relocation

> **Feature:** small-queue-intake
> **Layer(s):** M10 (renderer only)
> **Depends on:** SESSION-03 (done)
> **Estimated effort:** 25 min

---

## Context

The sidebar currently has:
- A HotTakeButton and AdhocRevisionButton displayed above the nav items (visible when not in pitch-room)
- A Help (?) button in the top-right corner next to BookSelector
- Chat as a flat nav item

Requested: Chat becomes an expandable nav item with nested children. Hot Take and Adhoc Revision move inside it. Help moves from the top corner to the bottom of the nav section.

---

## Files to Read First

- `src/renderer/components/Layout/Sidebar.tsx` — full file
- `src/renderer/components/Sidebar/HotTakeButton.tsx` — understand its props/actions
- `src/renderer/components/Sidebar/AdhocRevisionButton.tsx` — understand its props/actions
- `src/renderer/stores/viewStore.ts` — navigate, currentView

---

## Implementation

### Step 1: Remove HotTakeButton and AdhocRevisionButton from above-nav area

In `Sidebar.tsx`, delete the entire "Quick actions — above nav, below scrollable area" section:
```tsx
{/* Quick actions — above nav, below scrollable area */}
{currentView !== 'pitch-room' && (
  <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 px-2 py-1">
    <HotTakeButton />
    <AdhocRevisionButton />
  </div>
)}
```

### Step 2: Move Help button from header to bottom-of-nav

Remove `HelpButton` from the sidebar header section:
```tsx
{/* Book selector + help button */}
<div className="flex items-center gap-1.5 pr-2">
  <div className="flex-1 min-w-0">
    <BookSelector />
  </div>
  <HelpButton />  {/* <-- remove this */}
</div>
```

Change it to:
```tsx
<div className="flex-1 min-w-0">
  <BookSelector />
</div>
```

Add a Help nav entry at the very bottom of `NAV_ITEMS` rendering, as the last item in the nav section, after settings and before the CLI Activity toggle:

```tsx
{/* Help entry at bottom of nav */}
<HelpButton />
```

Update `HelpButton` to render as a full-width nav-style button (matching the NavButton style) rather than just the circular `?` button. Keep the tour popover functionality. The button label should be "Help" with a ? icon, matching the nav item aesthetic.

### Step 3: Make Chat a toggleable parent with nested children

Add state: `const [chatExpanded, setChatExpanded] = useState(true);`

Replace the Chat `NavButton` in the `NAV_ITEMS.map()` with a custom ChatNavGroup component (defined inline or as a local function component in Sidebar.tsx):

```tsx
function ChatNavGroup({
  isActive,
  expanded,
  onToggle,
  onNavigateChat,
  onNavigateHotTake,
  onNavigateAdhoc,
}: {
  isActive: boolean;
  expanded: boolean;
  onToggle: () => void;
  onNavigateChat: () => void;
  onNavigateHotTake: () => void;
  onNavigateAdhoc: () => void;
}): React.ReactElement
```

Render it before the rest of NAV_ITEMS (Chat is the first nav item):

**Parent row:**
```tsx
<div className="flex items-center">
  <button
    onClick={onNavigateChat}
    className={/* same NavButton base styles, flex-1 */}
  >
    <span className="text-base">💬</span>
    <span>Chat</span>
  </button>
  <button
    onClick={onToggle}
    className="no-drag p-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
    aria-label="Expand chat section"
  >
    <span style={{ display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}>▶</span>
  </button>
</div>
```

**Children (when expanded):**
```tsx
{expanded && (
  <div className="ml-5 space-y-0.5">
    <button onClick={onNavigateChat} className="no-drag flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200">
      💬 <span>Current Chat</span>
    </button>
    <HotTakeButton compact />
    <AdhocRevisionButton compact />
  </div>
)}
```

### Step 4: Pass compact prop to HotTakeButton and AdhocRevisionButton

Read `HotTakeButton.tsx` and `AdhocRevisionButton.tsx`. Add a `compact?: boolean` prop. When `compact` is true, render as a slim indented nav-style row (text-xs, no wrapping, same indent level as "Current Chat"). When false (default), keep existing behavior for any remaining usages.

The compact variant should:
- Use `text-xs` text
- Have the same hover style as the "Current Chat" row above
- Show the agent color dot + label ("Hot Take", "Ad Hoc Revision")

### Step 5: Clean up NAV_ITEMS

Remove 'chat' from `NAV_ITEMS` since it is now rendered separately as `ChatNavGroup`. Keep all other nav items unchanged.

---

## Architecture Compliance

- [x] Renderer only
- [x] No new stores — `chatExpanded` is local `useState` in Sidebar.tsx
- [x] No new IPC channels
- [x] HotTakeButton and AdhocRevisionButton remain as separate components, just embedded differently

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Chat nav item has an expand/collapse toggle
3. When expanded: Current Chat, Hot Take, Ad Hoc Revision visible as indented sub-items
4. When in pitch-room: Chat section is hidden (maintain existing pitch-room nav hiding behavior if any)
5. Help button appears at the bottom of the nav section, not in the top header area
6. The circular `?` button is no longer visible in the sidebar header

---

## State Update

Set SESSION-04 to `done` in STATE.md.
