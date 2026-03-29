# SESSION-04 — Dashboard View

> **Program:** Novel Engine
> **Feature:** dashboards-and-revision-modal
> **Modules:** M10
> **Depends on:** SESSION-03
> **Estimated effort:** 30 min

---

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| `M01` | domain | `src/domain/types.ts` | `BookDashboardData` type shape |
| `M10` | renderer | `src/renderer/stores/viewStore.ts, src/renderer/stores/bookStore.ts, src/renderer/components/Layout/AppLayout.tsx, src/renderer/components/Layout/Sidebar.tsx` | Adding new view, store, nav item, and default landing behavior |

---

## Context

The dashboard backend is wired (SESSION-03). This session builds the renderer: a Zustand store, a `DashboardView` component, routing, sidebar navigation, and default-view-on-book-switch behavior.

The dashboard is the answer to "where am I in this project?" — a single screen showing pipeline status, word count, last interaction, revision tasks, recent files, and time in progress. It becomes the landing screen when switching books.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/dashboardStore.ts` | Create | Zustand store for dashboard data |
| `src/renderer/components/Dashboard/DashboardView.tsx` | Create | Main dashboard view component |
| `src/renderer/stores/viewStore.ts` | Modify | Add `'dashboard'` to `ViewId`, change default to `'dashboard'` |
| `src/renderer/components/Layout/AppLayout.tsx` | Modify | Mount `DashboardView` in `ViewContent` |
| `src/renderer/components/Layout/Sidebar.tsx` | Modify | Add Dashboard nav item |
| `src/renderer/stores/bookStore.ts` | Modify | Navigate to dashboard on book switch |

---

## Implementation

### 1. Create `src/renderer/stores/dashboardStore.ts`

```typescript
import { create } from 'zustand';
import type { BookDashboardData } from '@domain/types';

type DashboardState = {
  data: BookDashboardData | null;
  loading: boolean;
  error: string | null;
  loadedSlug: string;
  load: (bookSlug: string) => Promise<void>;
  refresh: () => Promise<void>;
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  loadedSlug: '',

  load: async (bookSlug: string) => {
    if (!bookSlug) return;
    set({ loading: true, error: null, loadedSlug: bookSlug });
    try {
      const data = await window.novelEngine.dashboard.getData(bookSlug);
      if (get().loadedSlug === bookSlug) {
        set({ data, loading: false });
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      if (get().loadedSlug === bookSlug) {
        set({ error: 'Failed to load dashboard data', loading: false });
      }
    }
  },

  refresh: async () => {
    const { loadedSlug } = get();
    if (loadedSlug) {
      await get().load(loadedSlug);
    }
  },
}));
```

### 2. Create `src/renderer/components/Dashboard/DashboardView.tsx`

This is a project status card view. Use the existing dark theme conventions (zinc scale, blue-500 accents).

The component renders:
- **Header**: Book title, status badge, days in progress
- **Pipeline card**: Current phase highlighted, progress fraction (e.g., "5 / 14 phases")
- **Word count card**: Total words, per-chapter breakdown (mini bar chart using plain divs)
- **Last interaction card**: Agent name (with color dot), conversation title, relative time
- **Revision tasks card**: Progress bar, pending task list
- **Recent files card**: File paths with relative timestamps

Structure:

```typescript
import { useEffect } from 'react';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useBookStore } from '../../stores/bookStore';
import { useViewStore } from '../../stores/viewStore';
import type { BookDashboardData } from '@domain/types';
import { AGENT_REGISTRY } from '@domain/constants';

export function DashboardView(): React.ReactElement {
  const { data, loading, error, load } = useDashboardStore();
  const activeSlug = useBookStore((s) => s.activeSlug);
  const navigate = useViewStore((s) => s.navigate);

  useEffect(() => {
    if (activeSlug) {
      load(activeSlug);
    }
  }, [activeSlug, load]);

  // ... loading/error/empty states, then render cards
}
```

Card layout: Use a CSS grid — `grid grid-cols-2 gap-4 p-6` on desktop, with the pipeline card spanning full width at the top.

Each card: `rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4`.

**Pipeline card**: Show all 14 phases as small dots/badges. Complete = green fill, active = blue ring + pulse, pending-completion = amber, locked = zinc-700. Show the current phase label prominently. Include a "Next: {phase}" hint.

**Word count card**: Large number for total. If per-chapter data exists, show a horizontal bar chart where each bar is proportional to the chapter's word count. Use `bg-blue-500` for bars.

**Last interaction card**: Show agent color dot (from `AGENT_REGISTRY`), agent name, conversation title, and a relative time string (e.g., "2 hours ago", "3 days ago"). Add a "Resume" button that navigates to `chat` view.

**Revision tasks card**: Progress bar (`bg-green-500` fill), "X / Y tasks complete". List the first 5 pending (unchecked) tasks. Link to revision queue if tasks exist.

**Recent files card**: List of file paths with modification timestamps. Each file is clickable — navigates to `files` view with `filePath` payload.

**Empty state**: If no book is active, show a prompt to create or select a book.

Use `formatDistanceToNow`-style relative time by computing inline (avoid adding date-fns dependency):

```typescript
function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
```

### 3. Update `viewStore.ts`

Add `'dashboard'` to the `ViewId` union:

```typescript
type ViewId = 'dashboard' | 'onboarding' | 'chat' | 'files' | 'build' | 'settings' | 'revision-queue' | 'pitch-room' | 'reading';
```

Change the default `currentView` from `'chat'` to `'dashboard'`:

```typescript
currentView: 'dashboard',
```

Add a migration for the persisted store version. Increment the `version` number and update the `migrate` function to handle the old default:

```typescript
version: 3,
migrate: (persistedState: unknown) => {
  const state = persistedState as Partial<ViewState>;
  if ((state.currentView as string) === 'motif-ledger') {
    return { ...state, currentView: 'files' as ViewId };
  }
  return state;
},
```

### 4. Update `AppLayout.tsx` — Mount DashboardView

Add import:
```typescript
import { DashboardView } from '../Dashboard/DashboardView';
```

Add to `ViewContent` before the chat div:
```typescript
<div className={`h-full ${currentView === 'dashboard' ? '' : 'hidden'}`}>
  <DashboardView />
</div>
```

### 5. Update `Sidebar.tsx` — Add Dashboard nav item

Add `'dashboard'` to the local `ViewId` type and `NAV_TOOLTIPS`:

```typescript
type ViewId = 'dashboard' | 'chat' | 'files' | 'build' | 'pitch-room' | 'reading' | 'settings';

const NAV_TOOLTIPS: Record<ViewId, string> = {
  dashboard: 'Project overview — pipeline status, word count, recent activity',
  // ... existing entries
};
```

Add Dashboard as the first item in `NAV_ITEMS` (before Files):
```typescript
{ id: 'dashboard', label: 'Dashboard', icon: '📊' },
```

### 6. Update `bookStore.ts` — Navigate to dashboard on book switch

In the `setActiveBook` action, after `switchBook(slug)` and `refreshWordCount()`, navigate to the dashboard:

```typescript
setActiveBook: async (slug: string) => {
  try {
    await window.novelEngine.books.setActive(slug);
    set({ activeSlug: slug });

    const { switchBook } = useChatStore.getState();
    await switchBook(slug);

    await get().refreshWordCount();

    // Navigate to dashboard when switching books
    const { navigate } = useViewStore.getState();
    navigate('dashboard');
  } catch (error) {
    console.error('Failed to set active book:', error);
  }
},
```

Add the import for `useViewStore`:
```typescript
import { useViewStore } from './viewStore';
```

---

## Verification

1. Run `npx tsc --noEmit` — must pass with zero errors.
2. Verify the dashboard appears as the default view when the app loads.
3. Verify switching books navigates to the dashboard.
4. Verify the Dashboard nav item appears in the sidebar before Files.
5. Verify the DashboardView component imports types from `@domain/types` using `import type` only (except `AGENT_REGISTRY` from `@domain/constants`, which is a permitted value import).
6. Verify clicking file entries in the recent files card navigates to the files view.

---

## State Update

After completing this session, update `prompts/session-program/program-004/STATE.md`:
- Set SESSION-04 status to `done`
- Set Completed date
- Add notes about decisions or complications
- Update Handoff Notes
