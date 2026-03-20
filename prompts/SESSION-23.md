# Session 23 — File Browser View with View Mode Switching

## Context

Novel Engine Electron app. Sessions 01–22 built the complete app including agent chat, pipeline tracking, save-to-file, and voice/author profile setup. However, the **Files view** (`FilesView.tsx`) is currently a **single-file reader** — when you click a file in the sidebar `FileTree`, it loads that one file in the main content area. There is no way to browse, navigate, and explore the book's file structure directly from the main content area.

The sidebar `FileTree` gives a tree overview, but it's narrow, cramped, and doesn't show file metadata (size, word count, last modified). Authors working on complex novels need a **proper file browser** — something that feels like a lightweight Finder/Explorer embedded in the app — where they can see their book's structure at a glance, navigate into directories, and switch between different rendering modes.

This session adds:

1. **A full file browser view** in the main content area with directory navigation, breadcrumb trail, and file metadata
2. **Three view modes** the user can switch between: Browser (filesystem grid/list), Reader (the current single-file markdown viewer), and Editor (raw markdown editing with save)
3. **A view mode switcher** in the Files view header

---

## Design

### View Modes

| Mode | Description | When |
|------|-------------|------|
| **Browser** | Grid/list of files and folders in the current directory. Shows name, type icon, word count (for `.md`), last modified. Click a folder to navigate into it. Click a file to switch to Reader mode. | Default when navigating to `files` view without a specific `filePath` |
| **Reader** | The existing rendered markdown/JSON viewer. Read-only. Shows breadcrumb, word count footer. | When a file is selected (current behavior) |
| **Editor** | Raw markdown textarea with live preview toggle. Save button writes back to disk. | User clicks "Edit" button from Reader mode |

### File Entry Enhancement

The existing `FileEntry` type only has `name`, `path`, `isDirectory`, and `children`. The browser needs more metadata. Rather than changing the domain type (which would require infrastructure changes), the browser will fetch metadata on-demand for the current directory's files using existing IPC calls.

### Navigation Model

The browser maintains a **current directory path** (relative to book root, e.g. `""` for root, `"source"`, `"chapters/01-the-beginning"`). Navigation works like a filesystem:

- Click folder → navigate into it (update current directory)
- Breadcrumb segments are clickable → navigate to that ancestor
- Click file → switch to Reader mode for that file
- "Back" button or breadcrumb → navigate up
- The sidebar `FileTree` click behavior is preserved — it still opens files in Reader mode

---

## Task 1: Update View Store

### Update `src/renderer/stores/viewStore.ts`

Add a `fileViewMode` field and `fileBrowserPath` to the payload/state:

```typescript
type FileViewMode = 'browser' | 'reader' | 'editor';

type ViewPayload = {
  filePath?: string;
  fileViewMode?: FileViewMode;
  fileBrowserPath?: string;       // current directory in browser mode
  conversationId?: string;
};

type ViewState = {
  currentView: ViewId;
  payload: ViewPayload;
  navigate: (view: ViewId, payload?: ViewPayload) => void;
};
```

Export the `FileViewMode` type.

When navigating to `files` with a `filePath`, default `fileViewMode` to `'reader'`. When navigating to `files` without a `filePath`, default `fileViewMode` to `'browser'`.

---

## Task 2: File Browser Component

### Create `src/renderer/components/Files/FileBrowser.tsx`

A filesystem-style directory browser. This is the main new component.

**Props:**
```typescript
type FileBrowserProps = {
  currentPath: string;            // current directory relative to book root ('' = root)
  onNavigate: (path: string) => void;    // navigate to directory
  onFileSelect: (path: string) => void;  // open file in reader mode
};
```

**Behavior:**

1. On mount and when `currentPath` changes, call `window.novelEngine.files.listDir(activeSlug, currentPath)` to get directory contents
2. For each `.md` file in the listing, estimate word count by reading the file and counting words (do this lazily — load on visible, or batch after initial render)
3. Display entries in a **grid layout** (default) or **list layout** (toggleable)

**Grid Layout (default):**
Each entry is a card:
- **Folders**: `📁` icon, folder name, subdirectory count (from children length)
- **Markdown files**: `📄` icon, file name (without `.md`), word count badge, truncated first line as preview
- **JSON files**: `⚙️` icon, file name
- **Other files**: `📎` icon, file name

Card styling:
```
rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 hover:bg-zinc-800/80 cursor-pointer transition-colors
```

**List Layout:**
A table-style layout with columns: Icon | Name | Type | Words | Actions

**Layout toggle:** A small icon button group in the header (grid icon / list icon).

**Empty state:** If the directory is empty, show a centered message: "This directory is empty."

**Sorting:** Directories first, then files. Alphabetical within each group. Chapters directory sorts numerically by chapter number prefix.

### Special handling for `chapters/` directory

When browsing `chapters/`, each chapter subfolder card should show:
- Chapter number + title extracted from the folder name (e.g., `01-the-beginning` → "Chapter 1: The Beginning")
- Word count of `draft.md` inside the chapter
- A "Draft" and "Notes" quick-access link

---

## Task 3: File Editor Component

### Create `src/renderer/components/Files/FileEditor.tsx`

A markdown editor with save functionality.

**Props:**
```typescript
type FileEditorProps = {
  filePath: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;            // return to reader mode
};
```

**Layout:**
- Full-height textarea with monospace font
- Top bar: file path (breadcrumb), "Preview" toggle, "Save" button (blue-500), "Cancel" button
- When "Preview" is toggled on, split the view: left = editor textarea, right = rendered markdown
- Unsaved changes indicator: show a dot or asterisk next to the file name when content differs from `initialContent`

**Textarea styling:**
```
w-full h-full bg-zinc-950 text-zinc-200 font-mono text-sm p-6 resize-none outline-none border-none
placeholder-zinc-600
```

**Save behavior:**
- Call `window.novelEngine.files.write(activeSlug, filePath, content)` on save
- Show brief "Saved ✓" toast/indicator near the save button
- After save, update `initialContent` reference so the unsaved indicator resets
- Keyboard shortcut: `Cmd/Ctrl+S` saves (use `useEffect` with keydown listener)

**Guard against navigation:**
- If there are unsaved changes and the user tries to navigate away (by clicking sidebar, switching views, etc.), the component should... just let them. Don't block navigation. Authors hate modals. But DO auto-save if the content has changed (write silently to disk before unmounting). Use `useEffect` cleanup.

---

## Task 4: Update FilesView — View Mode Orchestrator

### Update `src/renderer/components/Files/FilesView.tsx`

Refactor `FilesView` to be a **view mode orchestrator** that switches between Browser, Reader, and Editor based on the current mode.

**New structure:**

```tsx
export function FilesView(): React.ReactElement {
  const { payload, navigate } = useViewStore();
  const { activeSlug } = useBookStore();

  const viewMode: FileViewMode = payload.fileViewMode ?? (payload.filePath ? 'reader' : 'browser');
  const filePath = payload.filePath ?? null;
  const browserPath = payload.fileBrowserPath ?? '';

  // File content state (shared between reader and editor)
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load file when filePath changes (for reader/editor modes)
  useEffect(() => { /* existing file loading logic */ }, [filePath, activeSlug]);

  // View mode handlers
  const handleBrowse = (dirPath: string) => {
    navigate('files', { fileBrowserPath: dirPath, fileViewMode: 'browser' });
  };

  const handleFileSelect = (path: string) => {
    navigate('files', { filePath: path, fileViewMode: 'reader' });
  };

  const handleEdit = () => {
    navigate('files', { filePath, fileViewMode: 'editor' });
  };

  const handleCloseEditor = () => {
    navigate('files', { filePath, fileViewMode: 'reader' });
  };

  const handleSave = async (newContent: string) => {
    if (!activeSlug || !filePath) return;
    await window.novelEngine.files.write(activeSlug, filePath, newContent);
    setContent(newContent);  // update reader content
  };

  const handleBackToBrowser = () => {
    // Navigate to browser mode, pointing at the parent directory of the current file
    const parentDir = filePath ? filePath.split('/').slice(0, -1).join('/') : '';
    navigate('files', { fileBrowserPath: parentDir, fileViewMode: 'browser' });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header with view mode switcher */}
      <FilesHeader
        viewMode={viewMode}
        filePath={filePath}
        browserPath={browserPath}
        onModeChange={/* ... */}
        onBrowse={handleBrowse}
        onBackToBrowser={handleBackToBrowser}
        onEdit={handleEdit}
      />

      {/* Content area */}
      {viewMode === 'browser' && (
        <FileBrowser
          currentPath={browserPath}
          onNavigate={handleBrowse}
          onFileSelect={handleFileSelect}
        />
      )}
      {viewMode === 'reader' && (
        /* existing reader content: AboutJsonCard / MarkdownViewer / pre */
      )}
      {viewMode === 'editor' && filePath && (
        <FileEditor
          filePath={filePath}
          initialContent={content}
          onSave={handleSave}
          onClose={handleCloseEditor}
        />
      )}
    </div>
  );
}
```

---

## Task 5: Files Header with View Mode Switcher + Breadcrumb

### Create `src/renderer/components/Files/FilesHeader.tsx`

A unified header for the Files view that shows context-appropriate controls.

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│  📁 > source > voice-profile.md          [Browse] [Read] [Edit] │
│  ─────────────────────────────────────────────────────────────── │
└──────────────────────────────────────────────────────────────────┘
```

**Breadcrumb (left side):**
- In **browser mode**: Shows the current directory path. Each segment is clickable and navigates to that directory. Root is shown as the book title or "📁" icon.
- In **reader/editor mode**: Shows the file path. Parent directories are clickable (navigate to browser at that directory). The file name segment is not clickable.

**View mode buttons (right side):**
Three icon buttons, one highlighted for the active mode:

```tsx
<div className="flex items-center gap-1 rounded-lg bg-zinc-800 p-0.5">
  <button
    onClick={() => onModeChange('browser')}
    className={`rounded px-2.5 py-1 text-xs transition-colors ${
      viewMode === 'browser'
        ? 'bg-zinc-700 text-zinc-100'
        : 'text-zinc-400 hover:text-zinc-200'
    }`}
    title="Browse files"
  >
    ⊞
  </button>
  <button
    onClick={() => onModeChange('reader')}
    disabled={!filePath}
    className={`rounded px-2.5 py-1 text-xs transition-colors ${
      viewMode === 'reader'
        ? 'bg-zinc-700 text-zinc-100'
        : 'text-zinc-400 hover:text-zinc-200'
    } disabled:opacity-30 disabled:cursor-not-allowed`}
    title="Read file"
  >
    👁
  </button>
  <button
    onClick={() => onModeChange('editor')}
    disabled={!filePath || !filePath.endsWith('.md')}
    className={`rounded px-2.5 py-1 text-xs transition-colors ${
      viewMode === 'editor'
        ? 'bg-zinc-700 text-zinc-100'
        : 'text-zinc-400 hover:text-zinc-200'
    } disabled:opacity-30 disabled:cursor-not-allowed`}
    title="Edit file"
  >
    ✏️
  </button>
</div>
```

The Edit button is only enabled for `.md` files (markdown is the only editable format in this app — `about.json` has its own card editor).

---

## Task 6: Sidebar FileTree Integration

### Update `src/renderer/components/Sidebar/FileTree.tsx`

The sidebar `FileTree` already navigates to files in reader mode via `navigate('files', { filePath: entry.path })`. Update it so clicking a **directory** in the sidebar opens the **browser mode** at that directory:

```typescript
const handleFileClick = (entry: FileEntry) => {
  if (isInDist(entry.path)) {
    window.novelEngine.shell.openPath(entry.path).catch(console.error);
    return;
  }

  if (entry.isDirectory) {
    // Open browser mode at this directory
    navigate('files', { fileBrowserPath: entry.path, fileViewMode: 'browser' });
    return;
  }

  // Files open in reader mode (existing behavior)
  if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) {
    navigate('files', { filePath: entry.path, fileViewMode: 'reader' });
  }
};
```

This means the sidebar tree and the main browser are now complementary:
- Sidebar gives the persistent tree overview → click to jump directly
- Browser gives the detailed, metadata-rich directory view → explore and navigate

---

## Task 7: Quick Actions in Browser

### Add contextual actions to file cards in `FileBrowser.tsx`

Each file card in the browser has a small actions area (shown on hover):

**For `.md` files:**
- **Read** — opens in reader mode (default click action)
- **Edit** — opens directly in editor mode
- **Open in Chat** — only for certain files (e.g., `voice-profile.md` → opens voice setup chat, `reader-report.md` → opens the relevant pipeline chat)

**For `about.json`:**
- **View** — opens the `AboutJsonCard` in reader mode

**For `dist/` files:**
- **Open Externally** — calls `shell.openPath`

Actions appear as small icon buttons in the top-right of each card on hover:

```tsx
<div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
  <button
    onClick={(e) => { e.stopPropagation(); onEdit(entry.path); }}
    className="rounded bg-zinc-700 p-1 text-xs text-zinc-300 hover:bg-zinc-600"
    title="Edit"
  >
    ✏️
  </button>
</div>
```

---

## Summary of Changes by File

| File | Change |
|------|--------|
| `src/renderer/stores/viewStore.ts` | Add `FileViewMode` type, `fileViewMode` and `fileBrowserPath` to payload |
| `src/renderer/components/Files/FilesView.tsx` | Refactor to view mode orchestrator (browser/reader/editor) |
| `src/renderer/components/Files/FileBrowser.tsx` | **NEW** — filesystem grid/list directory browser |
| `src/renderer/components/Files/FileEditor.tsx` | **NEW** — markdown editor with save, preview, auto-save |
| `src/renderer/components/Files/FilesHeader.tsx` | **NEW** — breadcrumb + view mode switcher |
| `src/renderer/components/Sidebar/FileTree.tsx` | Directory clicks open browser mode instead of doing nothing |

---

## Architecture Notes

- **No new IPC channels needed.** The browser uses existing `files:listDir` and `files:read` for metadata. The editor uses existing `files:write`.
- **No domain changes.** `FileEntry` type is sufficient. Word counts and metadata are derived in the renderer from file content.
- **No infrastructure changes.** All new code is in the renderer layer.
- **Layer boundaries preserved.** The new components access the backend only through `window.novelEngine`.

---

## Verification

1. **Browser mode:**
   - Navigate to Files → see the book's root directory as a grid of cards
   - Folders show `📁` icon, files show type-appropriate icons
   - Click a folder → navigates into it, breadcrumb updates
   - Click breadcrumb segment → navigates to that ancestor directory
   - Click a `.md` file → switches to reader mode showing rendered markdown
   - Chapters directory shows chapter cards with word counts

2. **View mode switching:**
   - Click "Browse" button → shows directory browser at the parent of the current file
   - Click "Read" button → shows rendered file content (disabled when no file selected)
   - Click "Edit" button → shows raw markdown editor (disabled for non-.md files)
   - Active mode button is visually highlighted

3. **Editor mode:**
   - Edit a file → unsaved changes indicator appears
   - Click Save or Cmd/Ctrl+S → file is written to disk, indicator clears
   - Click Cancel → returns to reader mode
   - Navigate away with unsaved changes → content auto-saves silently

4. **Sidebar integration:**
   - Click a directory in the sidebar FileTree → opens browser mode at that directory
   - Click a file in the sidebar → opens reader mode (existing behavior preserved)

5. **Compilation:**
   - `npx tsc --noEmit` passes with all changes
   - No new imports that violate layer boundaries
