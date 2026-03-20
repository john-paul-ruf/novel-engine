# Session 17 — File Viewer + Build Panel + Zip Export

## Context

Novel Engine Electron app. Sessions 01–16 done. Now I need the **file viewer** (read-only preview of all project files), the **build panel** (trigger the Pandoc build and show progress), and a **zip export** so the user can download all build artifacts as a single archive.

---

## Task 1: Files View

### `src/renderer/components/Files/FilesView.tsx`

The view shown when `currentView === 'files'`.

**Design principle:** The user never edits text directly in the app — all content is produced by agents and saved via "Save to File" (Session 19). The FilesView is a **read-only preview**. The only user-editable data is the book's title, author name, and cover image, which are edited via a small inline form on `about.json`.

**Layout:**
```
┌─────────────────────────────────────────┐
│  Breadcrumb: source / voice-profile.md  │
├─────────────────────────────────────────┤
│                                         │
│  Markdown content rendered beautifully  │
│  with full prose styling                │
│                                         │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│                             Word count  │
└─────────────────────────────────────────┘
```

**State:**
- `filePath: string | null` — currently open file (relative to book root)
- `content: string` — file content
- `isSaving: boolean` — for about.json inline edits only

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
2. Set `content` to the result

### View Mode (all files)

- Render markdown via `marked.parse(content)` for `.md` files
- For `about.json`: render a structured book info card (see below)
- Use Tailwind typography: `prose prose-invert prose-zinc max-w-none`
- Full-width, comfortable padding (px-8 py-6)
- Show word count at the bottom for `.md` files: `{N} words`

### Special case: `about.json` — Inline Title & Author Editing

When `filePath === 'about.json'`, instead of rendering raw JSON, show a **structured book info card** with:

- **Cover image** — displayed at the top of the card as a large preview (max 200px wide, aspect ratio preserved). Uses `novel-asset://cover/{activeSlug}?t={timestamp}` as `src` with an `onError` handler to hide the image if no cover exists. Below the image (or in place of it if no cover), show an **"Upload Cover"** button (`bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-3 py-1.5 rounded-lg`). On click, call `window.novelEngine.books.uploadCover(activeSlug)`. If it returns a non-null string, update the local timestamp state to force the `<img>` to re-fetch, and call `bookStore.loadBooks()` to refresh the sidebar thumbnail.
  - If no cover: show a dashed-border placeholder area (160×220px, `border-2 border-dashed border-zinc-700 rounded-lg flex items-center justify-center`) with a book icon and "Upload Cover" text, clickable.
  - If cover exists: show the image with a small "Change" button overlaid at the bottom-right corner.
- **Title** — displayed as an inline-editable text input (`text-2xl font-bold`). Clicking the text turns it into an input. On blur or Enter, save via `window.novelEngine.books.updateMeta(activeSlug, { title: newTitle })`.
- **Author** — same inline-editable pattern (`text-lg text-zinc-300`). Save via `window.novelEngine.books.updateMeta(activeSlug, { author: newAuthor })`.
- **Status** — displayed as a read-only colored badge (agents control this)
- **Created** — displayed as a read-only formatted date

After saving either field or uploading a cover, also call `bookStore.loadBooks()` to refresh the sidebar.

The title, author, and cover image are the **only fields** the user edits directly in the entire app. Everything else flows through agent conversations and "Save to File" (Session 19).

### No edit mode for any other file

All `.md` files — chapters, source documents, reports, build outputs — are **read-only**. There is no Edit button, no textarea, no save/cancel toolbar. Content is produced by agents and persisted via Session 19's "Save to File" mechanism.

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
│  [Build All Formats]  [Download All]    │
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
│  📄 output.md      [Open]              │
│  📄 output.docx    [Open]              │
│  📄 output.epub    [Open]              │
│                                         │
└─────────────────────────────────────────┘
```

**State:**
- `logs: string[]` — build progress messages
- `isBuilding: boolean`
- `isExporting: boolean`
- `buildResult: BuildResult | null`
- `pandocAvailable: boolean`

**On mount:**
- Check Pandoc availability via `window.novelEngine.build.isPandocAvailable()`
- Load word count for display
- Register progress listener: `window.novelEngine.build.onProgress(msg => addLog(msg))`
- Return cleanup for the listener

**Build button:**
- Disabled if `isBuilding` or `!pandocAvailable`
- If Pandoc not available: show warning "Pandoc not found. Install Pandoc to generate output files." with a link to pandoc.org (use `window.novelEngine.shell.openExternal('https://pandoc.org')` — **never `window.open()`**)
- On click:
  1. Clear logs, set `isBuilding: true`
  2. Call `window.novelEngine.build.run(activeSlug)`
  3. On return: set `buildResult`, set `isBuilding: false`

**Download All button (zip export):**
- Only shown after a successful build (when `buildResult` exists and has at least one successful format)
- Styled as a prominent button next to the Build button: `bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-lg`
- Disabled while `isExporting`
- On click:
  1. Set `isExporting: true`
  2. Call `window.novelEngine.build.exportZip(activeSlug)`
  3. Returns the saved file path (string) or `null` if the user cancelled the save dialog
  4. Set `isExporting: false`
  5. On success: briefly flash "Saved to {path}" in green text below the button

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

## Task 3: Shell Open + Zip Export IPC

The `shell.openPath` and `shell.openExternal` handlers and preload bridge methods were already added in Session 11. No changes needed there.

Add the `books:getAbsolutePath` handler to `src/main/ipc/handlers.ts`:

```typescript
ipcMain.handle('books:getAbsolutePath', (_, bookSlug: string, relativePath: string) => {
  return path.join(paths.booksDir, bookSlug, relativePath);
});
```

And add to the preload `books` section in `src/preload/index.ts`:
```typescript
getAbsolutePath: (bookSlug: string, relativePath: string): Promise<string> =>
  ipcRenderer.invoke('books:getAbsolutePath', bookSlug, relativePath),
```

### Zip Export IPC

Add to `src/main/ipc/handlers.ts`:

```typescript
import { dialog } from 'electron';
import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { readdir } from 'node:fs/promises';

ipcMain.handle('build:exportZip', async (event, bookSlug: string) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error('No window found');

  const distDir = path.join(paths.booksDir, bookSlug, 'dist');

  // Read the book title for the default filename
  const meta = await services.fs.getBookMeta(bookSlug);
  const slug = meta.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // Show save dialog
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export Build Artifacts',
    defaultPath: `${slug}-build.zip`,
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  });

  if (canceled || !filePath) return null;

  // Create zip with all dist/ files (md, docx, epub, pdf)
  return new Promise<string>((resolve, reject) => {
    const output = createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(filePath));
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(distDir, false);
    archive.finalize();
  });
});
```

**npm dependency:** Add `archiver` and `@types/archiver` to the project:
```bash
npm install archiver
npm install -D @types/archiver
```

Add `'archiver'` to the `external` array in `vite.main.config.ts` alongside `better-sqlite3`.

Update the preload `build` section in `src/preload/index.ts`:
```typescript
exportZip: (bookSlug: string): Promise<string | null> =>
  ipcRenderer.invoke('build:exportZip', bookSlug),
```

---

## Task 4: Pipeline Gate — Build Must Precede Publish

The `publish` phase (Quill) requires `dist/` artifacts to exist. The pipeline already enforces this: `build` phase is `complete` only when `dist/output.md` exists, and `publish` is `locked` until `build` is complete. However, add an explicit guard in the PipelineTracker (Session 15) so that clicking "Start" on the `publish` phase shows a warning if `dist/` is empty:

In `PipelineTracker.tsx`, when the user clicks "Start" on the `publish` phase:
1. Check if `dist/output.md` exists via `window.novelEngine.files.exists(activeSlug, 'dist/output.md')`
2. If it doesn't exist, show a toast/inline warning: "Run the Build step first to generate output files."
3. If it does exist, proceed normally (create/open conversation with Quill)

This is a safety net — the pipeline status should already prevent this — but it gives a clear user-facing message.

---

## Verification

- Clicking a file in the sidebar opens it in the Files view
- Markdown files render with full typography (headings, bold, lists, code blocks)
- All files are **read-only** — no edit button, no textarea on any `.md` file
- Opening `about.json` shows a structured card with cover image area, inline-editable Title and Author fields
- Uploading a cover image via the card shows the image preview and updates the sidebar thumbnail
- Editing title or author saves immediately and refreshes the sidebar
- Build button triggers the build and shows progress in real time
- "Download All" button appears after a successful build
- Clicking "Download All" opens a save dialog and creates a zip of all dist/ files
- Output files appear after build and are clickable (opens in OS default app)
- Pandoc missing shows a clear warning (doesn't crash)
- `npx tsc --noEmit` passes with all new files
