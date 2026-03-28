# SESSION-06 — Renderer: Series Groups in BookSelector Sidebar

> **Feature:** series-bible
> **Layer(s):** Renderer
> **Depends on:** SESSION-05
> **Estimated effort:** 30 min

---

## Context

SESSION-05 created the `seriesStore`. This session modifies the sidebar's `BookSelector` component to display books grouped by series. Standalone books appear as they do today. Books in a series appear under collapsible series headers with volume numbers.

The sidebar should show:
1. **Series groups** — collapsible containers showing the series name, with books listed in volume order underneath
2. **Standalone books** — books not in any series, shown as they are today
3. **Series management actions** — a button/link to open the series management modal (built in SESSION-07)

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/components/Sidebar/BookSelector.tsx` | Modify | Group books by series, add collapsible series sections |
| `src/renderer/components/Sidebar/SeriesGroup.tsx` | Create | Collapsible series group component for the sidebar |

---

## Implementation

### 1. Create `src/renderer/components/Sidebar/SeriesGroup.tsx`

A collapsible sidebar section that shows a series name and its volumes.

```typescript
type SeriesGroupProps = {
  seriesName: string;
  seriesSlug: string;
  volumes: Array<{
    volumeNumber: number;
    book: BookSummary;
  }>;
  activeSlug: string;
  onSelectBook: (slug: string) => void;
  onManageSeries: (slug: string) => void;
};
```

**Rendering:**

- A header row with:
  - Expand/collapse chevron icon (right-pointing when collapsed, down when expanded)
  - Series name in slightly muted text with a book-stack icon
  - Volume count badge (e.g. "3 volumes")
  - A small gear icon button to open series management (calls `onManageSeries`)
- When expanded, renders each volume as a book row:
  - Volume number prefix (e.g. "Vol. 1 —")
  - Book title
  - Status badge (reuse existing `StatusBadge` pattern from `BookSelector`)
  - Active highlight if this book is the current selection
- Collapsed by default for series where no book is active. Expanded if any book in the series is the active book.

**Styling:**
- Use `zinc-800` background for the series header
- Indent volume entries slightly (e.g., `pl-4`) to visually nest them
- Use `blue-500` left border accent on the series group when any volume is active
- Chevron rotates with `transition-transform duration-150`

### 2. Modify `src/renderer/components/Sidebar/BookSelector.tsx`

Read `src/renderer/components/Sidebar/BookSelector.tsx` in full.

**2a.** Import the new store and component:

```typescript
import { useSeriesStore } from '../../stores/seriesStore';
import { SeriesGroup } from './SeriesGroup';
```

**2b.** In the component body, load series data on mount:

```typescript
const { seriesList, loadSeries } = useSeriesStore();

useEffect(() => {
  loadSeries();
}, [loadSeries]);
```

**2c.** Compute grouped vs. standalone books:

```typescript
// Build a map of bookSlug to series info
const bookToSeries = useMemo(() => {
  const map = new Map<string, { seriesSlug: string; seriesName: string; volumeNumber: number }>();
  for (const series of seriesList) {
    for (const vol of series.volumes) {
      map.set(vol.bookSlug, {
        seriesSlug: series.slug,
        seriesName: series.name,
        volumeNumber: vol.volumeNumber,
      });
    }
  }
  return map;
}, [seriesList]);

// Partition books into series groups and standalone
const { seriesGroups, standaloneBooks } = useMemo(() => {
  const groups = new Map<string, {
    seriesSlug: string;
    seriesName: string;
    volumes: Array<{ volumeNumber: number; book: BookSummary }>;
  }>();
  const standalone: BookSummary[] = [];

  for (const book of books) {
    const seriesInfo = bookToSeries.get(book.slug);
    if (seriesInfo) {
      let group = groups.get(seriesInfo.seriesSlug);
      if (!group) {
        group = {
          seriesSlug: seriesInfo.seriesSlug,
          seriesName: seriesInfo.seriesName,
          volumes: [],
        };
        groups.set(seriesInfo.seriesSlug, group);
      }
      group.volumes.push({ volumeNumber: seriesInfo.volumeNumber, book });
    } else {
      standalone.push(book);
    }
  }

  // Sort volumes within each group by volume number
  for (const group of groups.values()) {
    group.volumes.sort((a, b) => a.volumeNumber - b.volumeNumber);
  }

  return { seriesGroups: Array.from(groups.values()), standaloneBooks: standalone };
}, [books, bookToSeries]);
```

**2d.** In the render output, replace the flat book list with:
1. Series groups first (rendered with `<SeriesGroup />`)
2. Then standalone books (rendered with the existing book row JSX)

Add a visual separator between series groups and standalone books if both exist.

**2e.** Add a "Manage Series" button in the dropdown menu (where "Create New Book" lives). For now, wire it to log — SESSION-07 will implement the actual modal.

**2f.** Reload series data when the books list changes:

```typescript
useEffect(() => {
  loadSeries();
}, [books, loadSeries]);
```

---

## Architecture Compliance

- [ ] Renderer accesses backend only through `window.novelEngine` (via stores)
- [ ] Only `import type` from domain for type declarations
- [ ] No direct IPC calls in components — all through stores
- [ ] Tailwind utility classes only — no custom CSS

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Books in a series appear under collapsible series headers in the sidebar
3. Standalone books appear below series groups in the existing style
4. Clicking a book in a series group selects it as the active book
5. Series groups auto-expand when the active book is in that series
6. The gear icon on series groups is present (actual modal comes in SESSION-07)

---

## State Update

After completing this session, update `prompts/feature/series-bible/STATE.md`:
- Set SESSION-06 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
