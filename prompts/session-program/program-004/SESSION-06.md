# SESSION-06 — Statistics View

> **Program:** Novel Engine
> **Feature:** dashboards-and-revision-modal
> **Modules:** M10
> **Depends on:** SESSION-04, SESSION-05
> **Estimated effort:** 30 min

---

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| `M01` | domain | `src/domain/types.ts` | `BookStatistics`, `AgentUsageBreakdown`, `PhaseUsageBreakdown` types |
| `M10` | renderer | `src/renderer/stores/viewStore.ts, src/renderer/stores/bookStore.ts, src/renderer/components/Layout/AppLayout.tsx, src/renderer/components/Layout/Sidebar.tsx` | Adding new view, store, nav item |

---

## Context

The statistics backend is wired (SESSION-05). This session installs `recharts` for charting and builds the Statistics View — a dedicated page accessible from the sidebar that shows token usage over time, per-agent and per-phase breakdowns, word count history, and cost estimates.

The existing codebase has no charting library. `recharts` is the standard choice for React — composable, tree-shakeable, and works well with Tailwind's dark theme.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `package.json` | Modify | Install `recharts` dependency |
| `src/renderer/stores/statisticsStore.ts` | Create | Zustand store for statistics data |
| `src/renderer/components/Statistics/StatisticsView.tsx` | Create | Main statistics view with charts |
| `src/renderer/stores/viewStore.ts` | Modify | Add `'statistics'` to `ViewId` |
| `src/renderer/components/Layout/AppLayout.tsx` | Modify | Mount `StatisticsView` in `ViewContent` |
| `src/renderer/components/Layout/Sidebar.tsx` | Modify | Add Statistics nav item |

---

## Implementation

### 1. Install recharts

```bash
npm install recharts
```

Verify it's added to `package.json` dependencies (not devDependencies).

### 2. Create `src/renderer/stores/statisticsStore.ts`

```typescript
import { create } from 'zustand';
import type { BookStatistics } from '@domain/types';

type StatisticsState = {
  data: BookStatistics | null;
  loading: boolean;
  error: string | null;
  bookFilter: string | null;
  load: (bookSlug?: string) => Promise<void>;
  setBookFilter: (bookSlug: string | null) => void;
};

export const useStatisticsStore = create<StatisticsState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  bookFilter: null,

  load: async (bookSlug?: string) => {
    set({ loading: true, error: null });
    try {
      const slug = bookSlug ?? get().bookFilter ?? undefined;
      const data = await window.novelEngine.statistics.get(slug);
      set({ data, loading: false });
    } catch (error) {
      console.error('Failed to load statistics:', error);
      set({ error: 'Failed to load statistics', loading: false });
    }
  },

  setBookFilter: (bookSlug: string | null) => {
    set({ bookFilter: bookSlug });
    get().load(bookSlug ?? undefined);
  },
}));
```

### 3. Create `src/renderer/components/Statistics/StatisticsView.tsx`

This is the most code-heavy file. Structure it with clear sections:

```typescript
import { useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useStatisticsStore } from '../../stores/statisticsStore';
import { useBookStore } from '../../stores/bookStore';
import type { BookStatistics } from '@domain/types';
import { AGENT_REGISTRY } from '@domain/constants';
import type { AgentName } from '@domain/types';

export function StatisticsView(): React.ReactElement {
  const { data, loading, error, load, bookFilter, setBookFilter } = useStatisticsStore();
  const { books, activeSlug } = useBookStore();

  useEffect(() => {
    load(bookFilter ?? activeSlug);
  }, [activeSlug, bookFilter, load]);

  // ... render
}
```

**Layout**: Full-height scrollable view. Header with title + book filter dropdown. Grid of chart sections.

**Book filter dropdown**: Placed in the header. Options: "All Books" (null filter) + one entry per book from `useBookStore.books`. Default to the active book.

**Sections** (each in its own card):

#### A. Summary Cards (top row)
Four small cards in a row showing:
- Total tokens (formatted as "1.2M" etc.)
- Total conversations
- Estimated cost (with "~" prefix and "at API rates" disclaimer)
- Total words (if bookFilter is set)

Format large numbers with a helper:
```typescript
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
```

#### B. Token Usage Over Time (AreaChart)
- X-axis: date (formatted as MMM DD)
- Y-axis: token count
- Three stacked areas: input (blue-400), output (purple-400), thinking (amber-400)
- Use `ResponsiveContainer` with height 300

```typescript
<ResponsiveContainer width="100%" height={300}>
  <AreaChart data={data.usageOverTime}>
    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
    <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
    <YAxis tick={{ fill: '#a1a1aa', fontSize: 12 }} />
    <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46' }} />
    <Area type="monotone" dataKey="inputTokens" stackId="1" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.3} name="Input" />
    <Area type="monotone" dataKey="outputTokens" stackId="1" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.3} name="Output" />
    <Area type="monotone" dataKey="thinkingTokens" stackId="1" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.3} name="Thinking" />
    <Legend />
  </AreaChart>
</ResponsiveContainer>
```

#### C. Per-Agent Breakdown (BarChart)
- Horizontal bar chart
- Each bar colored with the agent's color from `AGENT_REGISTRY`
- Show total tokens per agent
- Include cost column

```typescript
const agentChartData = data.perAgent.map((a) => ({
  name: a.agentName,
  tokens: a.inputTokens + a.outputTokens + a.thinkingTokens,
  cost: a.estimatedCost,
  fill: AGENT_REGISTRY[a.agentName as AgentName]?.color ?? '#71717a',
}));
```

#### D. Per-Phase Breakdown (BarChart)
Similar to per-agent but grouped by pipeline phase.

#### E. Word Count History (AreaChart)
- Only shown if `data.wordCountHistory.length > 0`
- X-axis: recordedAt (formatted date)
- Y-axis: word count
- Single area in green-400
- Show "No history yet — word counts are recorded after each agent interaction" if empty

#### F. Words Per Chapter (BarChart)
- Only shown if `bookFilter` is set and `data.wordsPerChapter.length > 0`
- Vertical bar chart, one bar per chapter
- Bar fill: blue-500

**Styling**: All charts use the dark theme — zinc-900 backgrounds, zinc-700 grid lines, zinc-400 text. Cards use the same styling as DashboardView: `rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4`.

**Empty state**: If no data yet, show a message: "No usage data recorded yet. Statistics will appear after your first agent interaction."

### 4. Update `viewStore.ts`

Add `'statistics'` to the `ViewId` union (after `'dashboard'` which was added in SESSION-04):

```typescript
type ViewId = 'dashboard' | 'onboarding' | 'chat' | 'files' | 'build' | 'settings' | 'statistics' | 'revision-queue' | 'pitch-room' | 'reading';
```

### 5. Update `AppLayout.tsx` — Mount StatisticsView

Add import:
```typescript
import { StatisticsView } from '../Statistics/StatisticsView';
```

Add to `ViewContent`:
```typescript
<div className={`h-full ${currentView === 'statistics' ? '' : 'hidden'}`}>
  <StatisticsView />
</div>
```

### 6. Update `Sidebar.tsx` — Add Statistics nav item

Add `'statistics'` to the local `ViewId` type:
```typescript
type ViewId = 'dashboard' | 'chat' | 'files' | 'build' | 'pitch-room' | 'reading' | 'statistics' | 'settings';
```

Add to `NAV_TOOLTIPS`:
```typescript
statistics: 'Token usage, cost estimates, and word count charts',
```

Add to `NAV_ITEMS` (after Build, before Pitch Room):
```typescript
{ id: 'statistics', label: 'Statistics', icon: '📈' },
```

---

## Verification

1. Run `npx tsc --noEmit` — must pass with zero errors.
2. Verify `recharts` is in `package.json` dependencies.
3. Verify the Statistics nav item appears in the sidebar.
4. Verify the StatisticsView renders chart sections when data is present.
5. Verify the book filter dropdown works — switching between "All Books" and a specific book reloads data.
6. Verify all recharts imports are from `recharts` (not a sub-path).
7. Verify dark theme styling: chart backgrounds, text, and grid lines use the zinc scale.

---

## State Update

After completing this session, update `prompts/session-program/program-004/STATE.md`:
- Set SESSION-06 status to `done`
- Set Completed date
- Add notes about decisions or complications
- Update Handoff Notes
