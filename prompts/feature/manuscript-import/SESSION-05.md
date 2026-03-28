# SESSION-05 — BookSelector Integration & Polish

> **Feature:** manuscript-import
> **Layer(s):** Renderer
> **Depends on:** SESSION-04
> **Estimated effort:** 20 min

---

## Context

Sessions 01–04 built the complete import pipeline: domain types, chapter detection, the import service, IPC wiring, the import store, and the wizard UI with chapter preview. What remains is wiring the wizard into the existing book creation flow and handling edge cases.

This session:
1. Adds an "Import Manuscript" button to the `BookSelector` dropdown alongside the existing "New Book" button
2. Renders the `ImportWizard` modal from `BookSelector` when the user triggers it
3. Ensures the post-import flow correctly refreshes the book list, pipeline, and chat state
4. Updates the `window.novelEngine` type declaration so TypeScript is aware of the new `import` namespace

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/components/Sidebar/BookSelector.tsx` | Modify | Add "Import Manuscript" button, render `ImportWizard`, handle post-import navigation |
| `src/renderer/global.d.ts` (or equivalent) | Modify | Add `import` namespace to the `window.novelEngine` type declaration (if a global type file exists) |

---

## Implementation

### 1. Add "Import Manuscript" button to BookSelector

Read `src/renderer/components/Sidebar/BookSelector.tsx`.

**Add imports:**

```typescript
import { ImportWizard } from '../Import/ImportWizard';
import { useImportStore } from '../../stores/importStore';
```

**Add state for showing the import wizard:**

In the `BookSelector` component, add:

```typescript
const importStep = useImportStore((s) => s.step);
const startImport = useImportStore((s) => s.startImport);
```

**Add the "Import Manuscript" button** in the dropdown panel, adjacent to the "New Book" button. Place it in the same `border-t` section as "New Book", creating a two-button row:

Find the existing "New Book" button section (the `<div className="border-t border-zinc-200 dark:border-zinc-800 p-2">` that wraps the "+ New Book" button). Replace it with:

```tsx
<div className="border-t border-zinc-200 dark:border-zinc-800 p-2 flex gap-1">
  <button
    onClick={() => {
      setIsOpen(false);
      setShowNewBookModal(true);
    }}
    className="no-drag flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
  >
    <span>+</span>
    <span>New Book</span>
  </button>
  <button
    onClick={() => {
      setIsOpen(false);
      startImport();
    }}
    className="no-drag flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z" />
      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
    </svg>
    <span>Import</span>
  </button>
</div>
```

**Render the ImportWizard modal:**

After the existing modals (NewBookModal, ArchiveConfirmModal, PitchPreviewModal), conditionally render the import wizard:

```tsx
{importStep !== 'idle' && <ImportWizard />}
```

### 2. Handle post-import book refresh

The `ImportWizard` component's `handleOpenBook` and `handleGenerateSources` actions call `useBookStore.getState().setActiveBook(result.bookSlug)`, which already triggers:
- `loadBooks()` → refreshes the book list
- `switchBook(slug)` → resets chat context
- `refreshWordCount()` → updates word count display

The `useEffect` in `BookSelector` that watches `activeSlug` already handles:
- `setDisplayedBook(activeSlug)` → pipeline display
- `loadPipeline(activeSlug)` → pipeline phase detection
- `loadConversations(activeSlug)` → conversation list

No additional refresh logic is needed — the existing reactive chain handles everything.

### 3. Update window.novelEngine type declaration (if needed)

Check whether there is a `global.d.ts` or similar file that declares the `window.novelEngine` type. If the preload bridge is typed inline via `contextBridge.exposeInMainWorld`, the type may need a corresponding declaration.

Search for `novelEngine` in `.d.ts` files. If a global type declaration exists, add the `import` namespace:

```typescript
import: {
  selectFile: () => Promise<string | null>;
  preview: (filePath: string) => Promise<ImportPreview>;
  commit: (config: ImportCommitConfig) => Promise<ImportResult>;
};
```

If no global declaration file exists (the preload types flow through contextBridge), this step can be skipped — TypeScript will infer the types from the preload's `api` object.

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Renderer accesses backend only through `window.novelEngine`
- [x] Import store uses `import type` for domain types
- [x] No business logic in the BookSelector — it delegates to the store
- [x] All Tailwind utilities — no custom CSS
- [x] Dark theme using zinc scale
- [x] IPC cleanup not needed (import uses invoke, not event listeners)
- [x] No `any` types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. BookSelector dropdown shows "New Book" and "Import" buttons side by side
3. Clicking "Import" opens the native file dialog
4. Selecting a .md file shows the chapter preview in the wizard
5. Selecting a .docx file converts to markdown and shows chapter preview
6. Canceling the file dialog returns to the dropdown without showing the wizard
7. "Import" button in the wizard creates the book and navigates to it
8. "Generate Source Documents" button creates a Verity conversation with the analysis prompt
9. Book list, pipeline, and word count refresh correctly after import
10. Error states (invalid file, failed conversion) show the error step with retry option

---

## State Update

After completing this session, update `prompts/feature/manuscript-import/STATE.md`:
- Set SESSION-05 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes: "Feature complete. All 5 sessions done."
