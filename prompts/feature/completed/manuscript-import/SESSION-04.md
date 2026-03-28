# SESSION-04 — Import Store & Import Wizard UI

> **Feature:** manuscript-import
> **Layer(s):** Renderer
> **Depends on:** SESSION-03
> **Estimated effort:** 30 min

---

## Context

Sessions 01–03 built the full backend: domain types, chapter detection, `ManuscriptImportService`, IPC handlers, and preload bridge. The renderer can now call `window.novelEngine.import.selectFile()`, `.preview()`, and `.commit()`.

This session builds the renderer layer:
1. **`importStore`** — Zustand store managing the multi-step import flow state
2. **`ImportWizard`** — Modal component with steps: loading → chapter preview → configuration → importing → success
3. **`ChapterPreviewList`** — Component showing detected chapters with inline rename and merge controls

The wizard is designed as a standalone modal that can be triggered from the BookSelector dropdown. It manages its own lifecycle and cleans up when dismissed.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/importStore.ts` | Create | Zustand store for import flow state |
| `src/renderer/components/Import/ImportWizard.tsx` | Create | Multi-step import wizard modal |
| `src/renderer/components/Import/ChapterPreviewList.tsx` | Create | Chapter list with rename and merge controls |

---

## Implementation

### 1. Create `src/renderer/stores/importStore.ts`

A Zustand store that manages the import wizard's state machine.

```typescript
import { create } from 'zustand';
import type { DetectedChapter, ImportPreview, ImportResult } from '@domain/types';

type ImportStep = 'idle' | 'loading' | 'preview' | 'importing' | 'success' | 'error';

type ImportState = {
  step: ImportStep;
  preview: ImportPreview | null;
  result: ImportResult | null;
  error: string;
  title: string;
  author: string;
  chapters: DetectedChapter[];

  startImport: () => Promise<void>;
  updateTitle: (title: string) => void;
  updateAuthor: (author: string) => void;
  renameChapter: (index: number, newTitle: string) => void;
  mergeWithNext: (index: number) => void;
  removeChapter: (index: number) => void;
  commitImport: () => Promise<void>;
  reset: () => void;
};
```

**State fields:**
- `step` — Current wizard step. Drives which UI panel is shown.
- `preview` — The raw `ImportPreview` from the backend (null until loaded).
- `result` — The `ImportResult` after successful commit (null until committed).
- `error` — Error message string (empty when no error).
- `title` — Editable book title (initialized from `preview.detectedTitle`).
- `author` — Editable author name (initialized from `preview.detectedAuthor` or settings.authorName).
- `chapters` — Editable copy of detected chapters (initialized from `preview.chapters`).

**Actions:**

- **`startImport()`** — Calls `window.novelEngine.import.selectFile()`. If user cancels, resets to idle. Otherwise sets `step = 'loading'`, calls `window.novelEngine.import.preview(filePath)`, populates state from the preview, and sets `step = 'preview'`. On error, sets `step = 'error'` with the message.

- **`updateTitle(title)`** — Sets the editable title field.

- **`updateAuthor(author)`** — Sets the editable author field.

- **`renameChapter(index, newTitle)`** — Updates the title of the chapter at `index` in the `chapters` array. Creates a new array (immutable update).

- **`mergeWithNext(index)`** — Merges chapter at `index` with chapter at `index + 1`. The merged chapter keeps the first chapter's title. Content is concatenated with a blank line separator. Word counts are summed. Indices are recalculated. No-op if `index` is the last chapter.

- **`removeChapter(index)`** — Removes the chapter at `index`. Content is appended to the previous chapter (or discarded if it's the first chapter and there are others). No-op if only one chapter remains.

- **`commitImport()`** — Sets `step = 'importing'`. Calls `window.novelEngine.import.commit({ title, author, chapters })`. On success, sets `result` and `step = 'success'`. On error, sets `step = 'error'`.

- **`reset()`** — Returns all state to initial values (`step = 'idle'`, nulls, empty strings, empty arrays).

**Important:** When `startImport` populates from the preview, initialize `author` from the settings store if `detectedAuthor` is empty:

```typescript
const settingsAuthor = (await window.novelEngine.settings.load()).authorName;
set({
  title: data.detectedTitle || 'Untitled',
  author: data.detectedAuthor || settingsAuthor || '',
  chapters: [...data.chapters],
});
```

### 2. Create `src/renderer/components/Import/ImportWizard.tsx`

A modal overlay component that renders different content based on `importStore.step`.

**Structure:**

```
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
  <div className="w-[640px] max-h-[80vh] rounded-lg border ... bg-zinc-50 dark:bg-zinc-900 shadow-xl flex flex-col">
    {/* Header */}
    {/* Content — switches on step */}
    {/* Footer with action buttons */}
  </div>
</div>
```

**Step rendering:**

- **`loading`** — Spinner with "Analyzing manuscript..." text. No action buttons.

- **`preview`** — Two sections:
  1. **Book details** — Title and author text inputs (editable, pre-filled from detection).
  2. **Chapters** — Renders `<ChapterPreviewList />` showing all detected chapters with controls.
  
  If `preview.ambiguous` is true, show an amber warning bar: "Chapter detection was uncertain. Please review the splits below and adjust as needed."
  
  Footer buttons: "Cancel" (calls `reset()`) and "Import" (calls `commitImport()`). Import button disabled if title is empty or chapters array is empty.

- **`importing`** — Spinner with "Creating book..." text. No action buttons.

- **`success`** — Green checkmark icon. Shows: title, chapter count, word count. Footer buttons: "Open Book" (navigates to the new book) and "Generate Source Documents" (triggers multi-agent source generation — wired in SESSION-06). Both call `reset()` after their action.

- **`error`** — Red error icon with error message text. Footer buttons: "Try Again" (calls `reset()` then `startImport()`) and "Close" (calls `reset()`).

**"Open Book" action:**
```typescript
const handleOpenBook = async () => {
  if (!result) return;
  await useBookStore.getState().setActiveBook(result.bookSlug);
  reset();
};
```

**"Generate Source Documents" action:**
This button will be wired in SESSION-06 to trigger `startGeneration()` from the import store, which runs a multi-agent sequential pipeline. For now, make it a placeholder that calls a `startGeneration` action (to be added in SESSION-06):

```typescript
const handleGenerateSources = () => {
  // Will be implemented in SESSION-06 — calls startGeneration()
  // which runs Spark + Verity sequentially to produce pitch, outline,
  // bible, voice profile, and motif ledger
};
```

**Component must not render when `step === 'idle'`.** The parent component conditionally renders `<ImportWizard />` only when step is not idle. Alternatively, the wizard returns `null` when step is idle.

### 3. Create `src/renderer/components/Import/ChapterPreviewList.tsx`

A scrollable list of detected chapters with inline editing controls.

**Props:** None — reads directly from `importStore`.

**Each chapter row shows:**
- Chapter number (index + 1)
- Editable title (inline text input, calls `renameChapter`)
- Word count badge
- First 100 characters of content as a preview snippet (truncated, muted text)
- Action buttons:
  - "Merge ↓" — merges with next chapter (hidden on last chapter). Calls `mergeWithNext(index)`.
  - "×" — removes chapter (hidden if only 1 chapter remains). Calls `removeChapter(index)`.

**Styling:**
- Each row: `px-3 py-2 border-b border-zinc-200 dark:border-zinc-800`
- Title input: `text-sm font-medium bg-transparent border-b border-transparent focus:border-blue-500 outline-none`
- Word count: `text-xs text-zinc-500` badge
- Preview: `text-xs text-zinc-400 dark:text-zinc-500 line-clamp-1`
- Action buttons: `text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300`
- The list is wrapped in a scrollable container: `max-h-[400px] overflow-y-auto`

**Summary bar at bottom:**
Show total chapter count and total word count: "24 chapters · 62,450 words"

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Renderer accesses backend only through `window.novelEngine`
- [x] Store uses `import type` for domain types — no value imports from domain
- [x] Components use Zustand for shared state — no prop drilling beyond 2 levels
- [x] All Tailwind utilities — no custom CSS
- [x] Dark theme using zinc scale
- [x] No `any` types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `importStore` exposes all required state fields and actions
3. `ImportWizard` renders correct content for each step (loading, preview, importing, success, error)
4. `ChapterPreviewList` shows chapters with editable titles, word counts, and merge/remove controls
5. Merge action correctly combines two adjacent chapters
6. Remove action correctly removes a chapter and redistributes content
7. Success step provides both "Open Book" and "Generate Source Documents" options

---

## State Update

After completing this session, update `prompts/feature/manuscript-import/STATE.md`:
- Set SESSION-04 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
