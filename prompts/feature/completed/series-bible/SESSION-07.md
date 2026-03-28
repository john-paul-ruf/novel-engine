# SESSION-07 — Renderer: Series Management Modal & Bible Editor

> **Feature:** series-bible
> **Layer(s):** Renderer
> **Depends on:** SESSION-05, SESSION-06
> **Estimated effort:** 30 min

---

## Context

SESSION-05 created the `seriesStore` and SESSION-06 added series groups to the `BookSelector`. This session builds the series management UI — a modal dialog for creating, editing, and managing series, plus an integrated bible editor.

The modal handles:
1. Creating new series
2. Editing series name and description
3. Adding/removing books from a series
4. Reordering volumes via drag or arrows
5. Editing the shared series bible with a markdown editor
6. Deleting a series

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/components/Series/SeriesModal.tsx` | Create | Main series management modal |
| `src/renderer/components/Series/SeriesForm.tsx` | Create | Create/edit series name and description |
| `src/renderer/components/Series/VolumeList.tsx` | Create | Volume ordering and management |
| `src/renderer/components/Series/SeriesBibleEditor.tsx` | Create | Markdown editor for the series bible |
| `src/renderer/stores/seriesStore.ts` | Modify | Add `isModalOpen` / `openModal` / `closeModal` state |
| `src/renderer/components/Sidebar/BookSelector.tsx` | Modify | Wire "Manage Series" button to open the modal |

---

## Implementation

### 1. Update `src/renderer/stores/seriesStore.ts`

Read `src/renderer/stores/seriesStore.ts`. Add modal visibility state:

```typescript
// Add to state type:
isModalOpen: boolean;
modalMode: 'list' | 'create' | 'edit' | 'bible';
openModal: (mode?: 'list' | 'create' | 'edit' | 'bible') => void;
closeModal: () => void;

// Implementation:
isModalOpen: false,
modalMode: 'list',
openModal: (mode = 'list') => set({ isModalOpen: true, modalMode: mode }),
closeModal: () => set({ isModalOpen: false }),
```

### 2. Create `src/renderer/components/Series/SeriesForm.tsx`

A form for creating or editing a series.

**Props:**

```typescript
type SeriesFormProps = {
  mode: 'create' | 'edit';
  initialName?: string;
  initialDescription?: string;
  onSubmit: (name: string, description: string) => void;
  onCancel: () => void;
};
```

**Rendering:**
- Text input for series name (required, with validation for non-empty)
- Textarea for description (optional)
- Submit button ("Create Series" or "Save Changes")
- Cancel button

**Styling:** Dark theme — `zinc-800` card, `zinc-700` inputs, `blue-500` submit button.

### 3. Create `src/renderer/components/Series/VolumeList.tsx`

Displays and manages the ordered list of volumes in a series.

**Props:**

```typescript
type VolumeListProps = {
  volumes: SeriesVolume[];
  books: BookSummary[];       // all books for resolving titles
  onReorder: (orderedSlugs: string[]) => void;
  onRemove: (bookSlug: string) => void;
  onAdd: () => void;          // opens a book picker
};
```

**Rendering:**
- Each volume row shows: volume number, book title, status badge, move up/down arrows, remove button (X)
- An "Add Book" button at the bottom that opens a dropdown/picker of books not already in any series
- Volume numbers are displayed but auto-computed from position (1, 2, 3...)

**Reordering:**
- Use up/down arrow buttons for simplicity (no drag-and-drop library needed)
- Moving a volume calls `onReorder` with the new slug order

**Book Picker:**
- A dropdown or sub-panel listing available books (books not in any series)
- Uses the `bookStore`'s book list, filtered against the current series volumes and books in other series
- To check if a book is in another series, the component can use `seriesStore.seriesList` to build a set of all booked slugs

### 4. Create `src/renderer/components/Series/SeriesBibleEditor.tsx`

A markdown editor for the shared series bible.

**Props:**

```typescript
type SeriesBibleEditorProps = {
  content: string;
  dirty: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
};
```

**Rendering:**
- A textarea (monospaced font) for editing the series bible markdown
- A "Save" button that is enabled only when `dirty` is true
- A character/word count display
- Helper text: "This document is shared across all books in the series. Agents will reference it for cross-volume continuity."

**Styling:** Full-height textarea with `zinc-900` background, `zinc-300` text, `font-mono`.

### 5. Create `src/renderer/components/Series/SeriesModal.tsx`

The main modal that ties everything together.

**State machine** based on `seriesStore.modalMode`:

- **`list`**: Shows all series in a list with select/create/delete actions
  - Each series row shows: name, volume count, description excerpt
  - Click a series -> selects it in the store, switches to `edit` mode
  - "Create New Series" button -> switches to `create` mode
  - Delete button (with confirmation) on each row
- **`create`**: Shows `SeriesForm` in create mode
  - On submit -> `seriesStore.createSeries(name, description)` -> switch to `edit` mode with the new series selected
- **`edit`**: Shows the selected series details
  - Tabbed sub-views: "Volumes" and "Series Bible"
  - **Volumes tab**: `VolumeList` component + `SeriesForm` (collapsed inline for renaming)
  - **Series Bible tab**: `SeriesBibleEditor` component
  - Back button to return to `list` mode
- **`bible`**: Direct shortcut to the bible editor for the active series (used when clicking "Edit Series Bible" from the sidebar)

**Modal shell:**
- Overlay with `bg-black/50`
- Centered card with `max-w-2xl` width, `max-h-[80vh]` height, overflow scroll
- Close button (X) in top-right corner
- Title bar showing the current mode

### 6. Wire Up in `src/renderer/components/Sidebar/BookSelector.tsx`

Read `src/renderer/components/Sidebar/BookSelector.tsx`.

**6a.** Import `SeriesModal`:

```typescript
import { SeriesModal } from '../Series/SeriesModal';
```

**6b.** Wire the "Manage Series" button (added in SESSION-06) to open the modal:

```typescript
const { openModal, isModalOpen } = useSeriesStore();

// In the dropdown menu:
<button onClick={() => openModal('list')}>Manage Series</button>
```

**6c.** Wire the gear icon in `SeriesGroup` headers to open the modal in edit mode:

```typescript
onManageSeries={(slug) => {
  seriesStore.selectSeries(slug).then(() => openModal('edit'));
}}
```

**6d.** Render the modal:

```typescript
{isModalOpen && <SeriesModal />}
```

---

## Architecture Compliance

- [ ] Renderer accesses backend only through stores (which use `window.novelEngine`)
- [ ] Only `import type` from domain
- [ ] Tailwind utility classes only
- [ ] No business logic in components — all state mutations through store actions
- [ ] Modal cleanup on unmount (if any listeners)

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. "Manage Series" button in BookSelector dropdown opens the modal
3. Can create a new series from the modal
4. Can add/remove books from a series
5. Can reorder volumes with up/down arrows
6. Can edit and save the series bible
7. Can delete a series (books remain, just the grouping is removed)
8. Gear icon on series groups opens the modal in edit mode for that series
9. Modal closes cleanly with X button or Escape key

---

## State Update

After completing this session, update `prompts/feature/series-bible/STATE.md`:
- Set SESSION-07 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
