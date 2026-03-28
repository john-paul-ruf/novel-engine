# SESSION-07 — Integrate Version History into FilesView & FileEditor

> **Feature:** content-version-control
> **Layer(s):** Renderer
> **Depends on:** SESSION-06
> **Estimated effort:** 30 min

---

## Context

SESSION-06 created the `VersionHistoryPanel` component. This final session integrates version history access into every place files are surfaced in the UI:

1. **FileEditor** — Add a "History" button to the editor toolbar that opens the `VersionHistoryPanel` as a right-side panel
2. **FilesView reader mode** — Add a "History" button to the reader toolbar
3. **StructuredBrowser** — Add a small history icon button next to each file entry (source docs, chapters, agent outputs)

The user requirement is: "I want to be able to access the history of any md and json file anywhere it is surfaced in the UI." This session fulfills that by adding history access points everywhere.

After a revert, the `FileEditor` reloads the file content to show the reverted state. The `FilesView` reader mode similarly refreshes.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/components/Files/FileEditor.tsx` | Modify | Add "History" toggle button to toolbar, render `VersionHistoryPanel` as right panel when active |
| `src/renderer/components/Files/FilesView.tsx` | Modify | Add "History" button to reader mode toolbar, render `VersionHistoryPanel` in reader mode |
| `src/renderer/components/Files/SourcePanel.tsx` | Modify | Add history icon button next to each file row |
| `src/renderer/components/Files/ChaptersPanel.tsx` | Modify | Add history icon button on chapter entries for draft.md and notes.md |
| `src/renderer/components/Files/AgentOutputPanel.tsx` | Modify | Add history icon button next to each file row |

---

## Implementation

### 1. Modify `FileEditor.tsx` — Add History Panel

Read `src/renderer/components/Files/FileEditor.tsx`.

**Add import:**
```typescript
import { VersionHistoryPanel } from './VersionHistoryPanel';
```

**Add state for history panel visibility:**
```typescript
const [showHistory, setShowHistory] = useState(false);
```

**Add a "History" button** to the toolbar (the bar with Save, Preview toggle, word count). Place it before the Close button:

```typescript
<button
  className={`px-3 py-1.5 text-xs rounded transition-colors ${
    showHistory
      ? 'bg-blue-600 text-white'
      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
  }`}
  onClick={() => setShowHistory(!showHistory)}
  title="Version history"
>
  <svg className="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
  History
</button>
```

**Wrap the editor content and history panel in a flex container.** The existing editor area becomes the left side, and the `VersionHistoryPanel` slides in on the right:

```typescript
<div className="flex flex-1 overflow-hidden">
  {/* Editor area (existing content) */}
  <div className={`flex-1 overflow-hidden flex flex-col ${showHistory ? 'w-1/2' : 'w-full'}`}>
    {/* ... existing textarea / preview content ... */}
  </div>

  {/* Version history panel */}
  {showHistory && activeSlug && (
    <div className="w-1/2 border-l border-zinc-700">
      <VersionHistoryPanel
        bookSlug={activeSlug}
        filePath={filePath}
        onClose={() => setShowHistory(false)}
        onReverted={() => {
          // Reload file content after revert
          window.novelEngine.files.read(activeSlug, filePath).then((newContent) => {
            setContent(newContent);
            setSavedContent(newContent);
          });
        }}
      />
    </div>
  )}
</div>
```

**Close history panel when file changes:**
```typescript
useEffect(() => {
  setShowHistory(false);
}, [filePath]);
```

### 2. Modify `FilesView.tsx` — Add History to Reader Mode

Read `src/renderer/components/Files/FilesView.tsx`.

**Add import:**
```typescript
import { VersionHistoryPanel } from './VersionHistoryPanel';
```

**Add state:**
```typescript
const [showHistory, setShowHistory] = useState(false);
```

Find the reader mode rendering section (where markdown content is displayed for a selected file). Add a "History" button in the reader toolbar area (near the Edit button and file path display):

```typescript
<button
  className={`px-2 py-1 text-xs rounded transition-colors ${
    showHistory
      ? 'bg-blue-600 text-white'
      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
  }`}
  onClick={() => setShowHistory(!showHistory)}
  title="Version history"
>
  History
</button>
```

Add the history panel alongside the reader content, using the same split-panel pattern as the editor. When `showHistory` is true, show the reader on the left half and `VersionHistoryPanel` on the right half.

**Close history on file change:**
```typescript
useEffect(() => {
  setShowHistory(false);
}, [selectedFile]);
```

On revert, reload the file content by re-calling `window.novelEngine.files.read()`.

### 3. Modify `SourcePanel.tsx` — History Icons

Read `src/renderer/components/Files/SourcePanel.tsx`.

For each file row in the source panel, add a small clock icon button that navigates to the file's history. When clicked, it should navigate to the files view with the history panel open.

Use the `useViewStore` to navigate:

```typescript
import { useViewStore } from '../../stores/viewStore';

// In the component:
const { navigate } = useViewStore();

// On history icon click for a file:
const handleHistory = (filePath: string) => {
  navigate('files', { filePath, fileViewMode: 'reader' });
  // The VersionHistoryPanel will be accessible via the History button in reader mode
};
```

Add a small icon button next to each file entry:

```typescript
<button
  className="p-1 text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all"
  onClick={(e) => {
    e.stopPropagation();
    handleHistory(file.path);
  }}
  title="Version history"
>
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
</button>
```

Add `group` class to the parent row element for hover reveal.

### 4. Modify `ChaptersPanel.tsx` — History Icons on Chapter Files

Read `src/renderer/components/Files/ChaptersPanel.tsx`.

Similar pattern to SourcePanel. For each chapter entry that shows draft.md and notes.md links, add a small history icon next to each file link.

```typescript
import { useViewStore } from '../../stores/viewStore';

// Add navigate from viewStore
const { navigate } = useViewStore();

// History button for a chapter file (e.g., `chapters/02-the-beginning/draft.md`)
<button
  className="p-0.5 text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all"
  onClick={(e) => {
    e.stopPropagation();
    navigate('files', { filePath: `chapters/${chapter.slug}/draft.md`, fileViewMode: 'reader' });
  }}
  title="Version history"
>
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
</button>
```

### 5. Modify `AgentOutputPanel.tsx` — History Icons

Read `src/renderer/components/Files/AgentOutputPanel.tsx`.

Same pattern as SourcePanel. Add history icon buttons next to agent output files.

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages
- [x] Application imports only from domain interfaces (not concrete classes)
- [x] IPC handlers are one-liner delegations
- [x] Renderer accesses backend only through `window.novelEngine`
- [x] Uses `import type` for domain types where applicable
- [x] All async operations have error handling
- [x] No `any` types
- [x] Tailwind utility classes only

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. **FileEditor**: "History" button appears in toolbar. Clicking opens the `VersionHistoryPanel` as a right-side split panel. Closing returns to full-width editor. Reverting reloads the editor content.
3. **FilesView reader mode**: "History" button appears in reader toolbar. Opens the same split-panel pattern.
4. **SourcePanel**: Clock icon appears on hover for each source file. Clicking navigates to reader view for that file.
5. **ChaptersPanel**: Clock icon appears on hover for draft.md and notes.md entries.
6. **AgentOutputPanel**: Clock icon appears on hover for each output file.
7. Version history is accessible from **every place** `.md` and `.json` files are surfaced in the UI.

---

## State Update

After completing this session, update `prompts/feature/content-version-control/STATE.md`:
- Set SESSION-07 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
