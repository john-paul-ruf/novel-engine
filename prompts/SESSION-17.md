# Session 17 — File Viewer/Editor + Build Panel

## Context

Novel Engine Electron app. Sessions 01–16 done. Now I need the **file viewer** (view and edit markdown files) and the **build panel** (trigger the Pandoc build and show progress).

---

## Task 1: Files View

### `src/renderer/components/Files/FilesView.tsx`

The view shown when `currentView === 'files'`.

**Layout:**
```
┌─────────────────────────────────────────┐
│  Breadcrumb: source / voice-profile.md  │
├─────────────────────────────────────────┤
│                                         │
│  Markdown content rendered beautifully  │
│  with full prose styling                │
│                                         │
│                 — or —                   │
│                                         │
│  Edit mode: raw markdown textarea       │
│                                         │
├─────────────────────────────────────────┤
│  [Edit] [Save] [Cancel]    Word count   │
└─────────────────────────────────────────┘
```

**State:**
- `filePath: string | null` — currently open file (relative to book root)
- `content: string` — file content
- `editContent: string` — buffer for edit mode
- `isEditing: boolean`
- `isSaving: boolean`
- `isDirty: boolean` — editContent !== content

**Payload-driven navigation:**
On mount and when `viewStore.payload.filePath` changes, set `filePath` to the payload value and load the file:

```typescript
const { payload } = useViewStore();

useEffect(() => {
  if (payload.filePath) {
    setFilePath(payload.filePath);
  }
}, [payload.filePath]);
```

This connects to the FileTree sidebar component (Session 15) which calls `viewStore.navigate('files', { filePath })`.

**No file selected state:**
Show a centered message: "Select a file from the sidebar" with a grid of quick-access cards for common files: voice-profile.md, scene-outline.md, story-bible.md, about.json.

### File Loading

When `filePath` changes:
1. Call `window.novelEngine.files.read(activeSlug, filePath)`
2. Set `content` and `editContent` to the result
3. Set `isEditing: false`

### View Mode

- Render markdown via `marked.parse(content)`
- Use Tailwind typography: `prose prose-invert prose-zinc max-w-none`
- Full-width, comfortable padding (px-8 py-6)
- Show word count at the bottom: `{N} words`

### Edit Mode

- Textarea fills the content area
- Monospace font: `font-mono text-sm`
- `bg-zinc-900 text-zinc-100`
- Line numbers on the left (optional — can be a stretch goal)
- Save button: writes to disk via `window.novelEngine.files.write(activeSlug, filePath, editContent)`, then reload content
- Cancel button: resets `editContent` to `content`, exits edit mode
- Keyboard shortcut: `Cmd/Ctrl+S` saves

### Which files are editable?

- `chapters/*/draft.md` → editable (this is the author's prose)
- `chapters/*/notes.md` → editable (author notes)
- `source/voice-profile.md` → editable
- `source/scene-outline.md` → editable
- `source/story-bible.md` → editable
- `about.json` → editable (but show as JSON with syntax awareness)
- Everything else → read-only (reports, build outputs)

Logic: a file is editable if its path matches `chapters/**/*.md`, `source/voice-profile.md`, `source/scene-outline.md`, `source/story-bible.md`, or `about.json`.

### Unsaved changes warning

If `isDirty` and the user tries to navigate away (change file or change view), show a confirm dialog: "You have unsaved changes. Discard?"

---

## Task 2: Build Panel

### `src/renderer/components/Build/BuildView.tsx`

The view shown when `currentView === 'build'`.

**Layout:**
```
┌─────────────────────────────────────────┐
│  Build Manuscript                       │
│  {Book Title} — {Word Count} words      │
├─────────────────────────────────────────┤
│                                         │
│  [Build All Formats]                    │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ Progress Log                      │  │
│  │ (terminal-style dark panel)       │  │
│  │                                   │  │
│  │ Checking Pandoc...                │  │
│  │ Pandoc found ✓                    │  │
│  │ Loading book metadata...          │  │
│  │ Assembling chapters...            │  │
│  │   Added 01-the-beginning (2,345)  │  │
│  │   Added 02-the-middle (3,456)     │  │
│  │ Total: 5,801 words                │  │
│  │ Generating DOCX...                │  │
│  │ DOCX ✓                            │  │
│  │ Generating EPUB...                │  │
│  │ EPUB ✓                            │  │
│  │ Generating PDF...                 │  │
│  │ PDF failed: pdflatex not found    │  │
│  │ Build complete!                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Output Files                           │
│  📄 output.md                          │
│  📄 output.docx                        │
│  📄 output.epub                        │
│                                         │
└─────────────────────────────────────────┘
```

**State:**
- `logs: string[]` — build progress messages
- `isBuilding: boolean`
- `buildResult: BuildResult | null`
- `pandocAvailable: boolean`

**On mount:**
- Check Pandoc availability via `window.novelEngine.build.isPandocAvailable()`
- Load word count for display
- Register progress listener: `window.novelEngine.build.onProgress(msg => addLog(msg))`
- Return cleanup for the listener

**Build button:**
- Disabled if `isBuilding` or `!pandocAvailable`
- If Pandoc not available: show warning "Pandoc not found. Install Pandoc to generate output files." with a link to pandoc.org
- On click:
  1. Clear logs, set `isBuilding: true`
  2. Call `window.novelEngine.build.run(activeSlug)`
  3. On return: set `buildResult`, set `isBuilding: false`

**Progress log:**
- `bg-zinc-950 text-green-400 font-mono text-sm rounded-lg p-4`
- `max-h-80 overflow-y-auto`
- Auto-scrolls to bottom as new lines arrive
- Lines starting with "ERROR" render in `text-red-400`
- Lines ending with "✓" render with green checkmark
- Pulsing cursor at the end while building

**Output files:**
- Only shown after a successful build
- Each file is a clickable row
- Clicking opens the file in the OS default application via shell integration:
  ```typescript
  const absPath = await window.novelEngine.books.getAbsolutePath(activeSlug, `dist/output.${format}`);
  await window.novelEngine.shell.openPath(absPath);
  ```
- Show file size if available

---

## Task 3: Shell Open IPC

Add to `src/main/ipc/handlers.ts`:
```typescript
import { shell } from 'electron';

'shell:openPath' → (_, absolutePath: string) → shell.openPath(absolutePath)
```

Update `src/preload/index.ts` with explicit shell and path resolution APIs:

```typescript
shell: {
  openPath: (absolutePath: string): Promise<string> =>
    ipcRenderer.invoke('shell:openPath', absolutePath),
},

// Add to existing books section:
getAbsolutePath: (bookSlug: string, relativePath: string): Promise<string> =>
  ipcRenderer.invoke('books:getAbsolutePath', bookSlug, relativePath),
```

The `books:getAbsolutePath` handler uses `paths.booksDir` from the `registerIpcHandlers` function signature (defined in Session 11):

```typescript
ipcMain.handle('books:getAbsolutePath', (_, bookSlug: string, relativePath: string) => {
  return path.join(paths.booksDir, bookSlug, relativePath);
});
```

---

## Verification

- Clicking a file in the sidebar opens it in the Files view
- Markdown files render with full typography (headings, bold, lists, code blocks)
- Edit mode shows a textarea with the raw markdown
- Save writes to disk and refreshes the view
- Unsaved changes warning appears when navigating away
- Build button triggers the build and shows progress in real time
- Output files appear after build and are clickable
- Pandoc missing shows a clear warning (doesn't crash)
