# SESSION-07 — Revision Queue Modal Refactor

> **Program:** Novel Engine
> **Feature:** dashboards-and-revision-modal
> **Modules:** M10
> **Depends on:** SESSION-04
> **Estimated effort:** 30 min

---

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| `M10` | renderer | `src/renderer/components/RevisionQueue/RevisionQueueView.tsx, src/renderer/components/RevisionQueue/RevisionSessionPanel.tsx, src/renderer/stores/revisionQueueStore.ts, src/renderer/components/Layout/AppLayout.tsx, src/renderer/stores/viewStore.ts, src/renderer/components/Sidebar/RevisionQueueButton.tsx, src/renderer/stores/modalChatStore.ts` | Converting full view to floating modal, understanding existing patterns |

---

## Context

The revision queue is currently a full-page view (`revision-queue` ViewId). The feature request asks for it to become a floating modal that:

1. **Is non-blocking** — the user can interact with the rest of the app while it's visible.
2. **Locks to a book** — the modal belongs to the book it was opened from. Switching books hides it; switching back shows it again.
3. **Minimizes/maximizes** — can be collapsed to a small indicator and expanded back.
4. **Persists across book switches** — the queue keeps running even if the user switches to another book. Coming back reveals the modal with its accumulated state.
5. **Ad-hoc revisions behave the same** — they already use ChatModal. Keep that pattern.

The existing `ChatModal` and `modalChatStore` provide a reference for floating modal patterns in this codebase. The revision queue store already has per-book caching, so state persistence across book switches is partially solved.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/revisionQueueStore.ts` | Modify | Add modal state: `isModalOpen`, `isMinimized`, `modalBookSlug` |
| `src/renderer/components/RevisionQueue/RevisionQueueModal.tsx` | Create | Floating modal wrapper with minimize/maximize |
| `src/renderer/components/RevisionQueue/index.ts` | Modify | Update exports |
| `src/renderer/components/Layout/AppLayout.tsx` | Modify | Remove RevisionQueueView from ViewContent, mount RevisionQueueModal |
| `src/renderer/stores/viewStore.ts` | Modify | Remove `'revision-queue'` from ViewId |
| `src/renderer/components/Sidebar/RevisionQueueButton.tsx` | Modify | Open modal instead of navigating |

---

## Implementation

### 1. Extend `revisionQueueStore.ts` with modal state

Read the full file. Add these fields and actions to the store state type:

```typescript
// Modal state
isModalOpen: boolean;
isMinimized: boolean;
modalBookSlug: string;

openModal: (bookSlug: string) => void;
closeModal: () => void;
toggleMinimize: () => void;
```

Implement them in the store:

```typescript
isModalOpen: false,
isMinimized: false,
modalBookSlug: '',

openModal: (bookSlug: string) => {
  const { modalBookSlug, isModalOpen } = get();
  // If already open for a different book while running, don't allow
  if (isModalOpen && modalBookSlug !== bookSlug && get().isRunning) {
    return;
  }
  set({ isModalOpen: true, isMinimized: false, modalBookSlug: bookSlug });
  // Load plan for this book if not already loaded
  const current = get();
  if (!current.plan || current.plan.bookSlug !== bookSlug) {
    get().switchToBook(bookSlug);
  }
},

closeModal: () => {
  const { isRunning } = get();
  // Don't close while running — minimize instead
  if (isRunning) {
    set({ isMinimized: true });
    return;
  }
  set({ isModalOpen: false, isMinimized: false });
},

toggleMinimize: () => {
  set((s) => ({ isMinimized: !s.isMinimized }));
},
```

### 2. Create `src/renderer/components/RevisionQueue/RevisionQueueModal.tsx`

This is a floating overlay modal that renders on top of the main content. It does NOT block interaction with the underlying app.

```typescript
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { useBookStore } from '../../stores/bookStore';
import { useRevisionQueueEvents } from '../../hooks/useRevisionQueueEvents';
import { QueueControls } from './QueueControls';
import { SessionCard } from './SessionCard';
import { TaskProgress } from './TaskProgress';
import { RevisionSessionPanel } from './RevisionSessionPanel';

export function RevisionQueueModal(): React.ReactElement | null {
  const { isModalOpen, isMinimized, modalBookSlug, toggleMinimize, closeModal } = useRevisionQueueStore();
  const activeSlug = useBookStore((s) => s.activeSlug);

  useRevisionQueueEvents();

  // Only show the modal if it's open AND we're on the same book
  if (!isModalOpen) return null;
  if (activeSlug !== modalBookSlug) {
    // Show a minimal "running on {book}" indicator instead
    return <MinimizedBadge bookSlug={modalBookSlug} />;
  }

  if (isMinimized) {
    return <MinimizedBar onExpand={toggleMinimize} onClose={closeModal} />;
  }

  return <ExpandedModal onMinimize={toggleMinimize} onClose={closeModal} />;
}
```

**`MinimizedBadge`**: A small fixed-position indicator in the bottom-right corner showing "Revision queue running on {bookTitle}". Clicking it doesn't do anything (since the user is on a different book) but informs them work is happening. Style: `fixed bottom-4 right-4 z-40 rounded-full bg-amber-600 px-3 py-1.5 text-xs text-white shadow-lg`.

**`MinimizedBar`**: A slim fixed-position bar at the bottom of the screen. Shows the active session title, a progress bar, and expand/close buttons. Style: `fixed bottom-0 left-0 right-0 z-40 h-12 border-t border-zinc-700 bg-zinc-900 flex items-center px-4`. Animate in/out with a CSS transition (translate-y).

**`ExpandedModal`**: A large floating panel positioned in the right half of the screen. Use `fixed top-14 right-4 bottom-4 z-40 w-[600px] max-w-[50vw]`. Renders the same content as the old RevisionQueueView: plan overview, session cards, session panel.

Structure:
```
┌──────────────────────────────────────┐
│ [Title] [Progress]  [_] [×]          │  ← Title bar with minimize/close
├──────────────────────────────────────┤
│ Queue controls (mode, run all, etc)  │
├──────────────────────────────────────┤
│ Session cards (scrollable list)      │
│  or                                  │
│ Session panel (when viewing/running) │
└──────────────────────────────────────┘
```

Style the modal with: `rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl flex flex-col overflow-hidden`. Add `backdrop-blur-sm` to a semi-transparent backdrop (`bg-black/10`) behind it that does NOT prevent clicking — use `pointer-events-none` on the backdrop, `pointer-events-auto` on the modal itself.

Move the session list and session panel rendering logic from `RevisionQueueView.tsx` into this modal. The existing `QueueControls`, `SessionCard`, `TaskProgress`, and `RevisionSessionPanel` components are reused as-is.

### 3. Update `RevisionQueueView.tsx` content

Instead of deleting `RevisionQueueView.tsx`, refactor it into a shared content component that both the old view path (if needed for backwards compatibility) and the modal can render. Alternatively, move the content directly into `RevisionQueueModal.tsx` and delete the view.

Since we're removing `'revision-queue'` from ViewId, the old view will never render. Delete the view-specific wrapper (the `useEffect` that loads on `currentView === 'revision-queue'`) and move the inner content into the modal.

### 4. Update `index.ts` barrel export

```typescript
export { RevisionQueueModal } from './RevisionQueueModal';
```

Remove the `RevisionQueueView` export (or keep it if it's refactored to a content component).

### 5. Update `AppLayout.tsx`

Remove the `RevisionQueueView` import and its `<div>` from `ViewContent`:

```diff
- import { RevisionQueueView } from '../RevisionQueue';
+ import { RevisionQueueModal } from '../RevisionQueue';
```

Remove from ViewContent:
```diff
-      <div className={`h-full ${currentView === 'revision-queue' ? '' : 'hidden'}`}>
-        <RevisionQueueView />
-      </div>
```

Add the modal after the `CliActivityPanel` or near `ChatModal`:
```typescript
<RevisionQueueModal />
```

### 6. Update `viewStore.ts`

Remove `'revision-queue'` from the `ViewId` union:

```typescript
type ViewId = 'dashboard' | 'onboarding' | 'chat' | 'files' | 'build' | 'settings' | 'statistics' | 'pitch-room' | 'reading';
```

Add a migration case to handle persisted state with the old value:
```typescript
if ((state.currentView as string) === 'revision-queue') {
  return { ...state, currentView: 'dashboard' as ViewId };
}
```

### 7. Update `RevisionQueueButton.tsx`

Read the current file. It currently calls `navigate('revision-queue')`. Change it to open the modal:

Replace the navigation call with:
```typescript
const openModal = useRevisionQueueStore((s) => s.openModal);
const activeSlug = useBookStore((s) => s.activeSlug);

// In the click handler:
openModal(activeSlug);
```

Remove the `useViewStore` import if it's no longer used.

---

## Verification

1. Run `npx tsc --noEmit` — must pass with zero errors.
2. Verify `'revision-queue'` is no longer a valid ViewId.
3. Verify clicking the Revision Queue button opens the modal overlay.
4. Verify the modal can be minimized to a bottom bar and expanded back.
5. Verify switching books while the modal is open hides it (shows the badge instead).
6. Verify switching back to the original book restores the modal.
7. Verify closing the modal while not running works; closing while running minimizes instead.
8. Verify the underlying app is still interactive when the modal is open (non-blocking).

---

## State Update

After completing this session, update `prompts/session-program/program-004/STATE.md`:
- Set SESSION-07 status to `done`
- Set Completed date
- Add notes about decisions or complications
- Update Handoff Notes
