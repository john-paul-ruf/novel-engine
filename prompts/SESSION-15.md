# Session 15 — Sidebar: Book Selector, Pipeline Tracker, File Tree

## Context

Novel Engine Electron app. Sessions 01–14 done. Now I need to flesh out the **sidebar** with three functional sections: book selector, pipeline tracker, and file tree. These replace the placeholder content from Session 13.

---

## Task 1: Book Selector

### `src/renderer/components/Sidebar/BookSelector.tsx`

Dropdown-style selector at the top of the sidebar (below the drag region).

**Display:**
- Shows the active book title and word count
- A dropdown chevron icon
- Clicking opens a dropdown panel showing all books

**Dropdown panel:**
- List of all books from `bookStore.books`
- Each item shows: title, status badge (colored pill), word count
- Clicking a book calls `bookStore.setActiveBook(slug)` and closes the dropdown
- Divider at the bottom
- "+ New Book" button at the bottom

**"+ New Book" flow:**
- Opens a minimal modal/dialog (not a full wizard)
- Single input: "Book Title"
- "Create" button → `bookStore.createBook(title)` → closes modal
- The new book becomes active automatically

**Status badges (colored pills):**
- `scaffolded` → gray
- `outlining`, `first-draft` → blue
- `revision-1`, `revision-2` → amber
- `copy-edit` → purple
- `final` → green
- `published` → emerald

### Data loading

On mount and when `bookStore.activeSlug` changes:
- Call `bookStore.loadBooks()`
- Call `pipelineStore.loadPipeline(activeSlug)`
- Call `chatStore.loadConversations(activeSlug)` — **required** so that the PipelineTracker's "Start" button can check for existing conversations via `chatStore.conversations.find(...)`. Without this, conversations are empty and every "Start" click creates a duplicate conversation.

---

## Task 2: Pipeline Tracker

### `src/renderer/components/Sidebar/PipelineTracker.tsx`

Visual step-by-step pipeline below the book selector.

**Layout:** Vertical list of all 13 phases. Each phase shows:
- Status icon on the left:
  - Complete: green circle with checkmark (`✓`)
  - Active: blue circle with pulse animation, filled
  - Locked: gray circle, outlined/empty
- Phase label
- Agent name in small gray text (e.g., "Verity")
- For the active phase: a small "Start" button on the right

**Connecting lines:** Between each phase, a thin vertical line:
- Green for complete→complete transitions
- Blue for complete→active
- Gray for active→locked and locked→locked

**Clicking a phase:**
- If `complete` or `active`: navigate to the chat view and load/create a conversation for that phase's agent
- If `locked`: do nothing (maybe show a tooltip: "Complete the previous phase first")

**Clicking "Start" on the active phase:**
1. Filter `chatStore.conversations` client-side: `conversations.find(c => c.agentName === agentName && c.pipelinePhase === phaseId)`. There is no backend query that filters by agent + phase.
2. If yes, open it
3. If no, create a new conversation via `chatStore.createConversation(agentName, bookSlug, phaseId)`
4. Navigate to the chat view

**Special case: "Build" phase (no agent):**
- Instead of "Start", show a "Build" button
- Clicking navigates to the Build view

**Data:** Uses `pipelineStore.phases`. Refresh when active book changes.

---

## Task 3: File Tree

### `src/renderer/components/Sidebar/FileTree.tsx`

Collapsible file tree below the pipeline tracker. Shows the active book's directory structure.

**Layout:**
- Section header: "Files" with a refresh icon button
- Tree of `FileEntry[]` from `window.novelEngine.files.listDir(activeSlug)`
- Directories are collapsible (click to toggle)
- Files show an icon based on extension:
  - `.md` → document icon
  - `.json` → gear icon
  - Other → generic file icon

**Clicking a file:**
- If `.md` file: call `viewStore.navigate('files', { filePath: relativePath })` where `relativePath` is relative to the book root (e.g., `'source/voice-profile.md'`).
- If `.json` → same pattern: `viewStore.navigate('files', { filePath: relativePath })`
- If in `dist/` → open the file externally (or show a "Download" option)

**Structure to display:**
```
source/
  voice-profile.md
  scene-outline.md
  story-bible.md
  reader-report.md
  dev-report.md
  ...
chapters/
  01-first-chapter/
    draft.md
    notes.md
  02-second-chapter/
    ...
assets/
dist/
about.json
```

**Collapsed by default:** `dist/`, `assets/`. Expanded by default: `source/`, `chapters/`.

**Data loading:** Load the file tree when the active book changes. Use `window.novelEngine.files.listDir(activeSlug)`.

---

## Task 4: Sidebar Assembly

### Update `src/renderer/components/Layout/Sidebar.tsx`

Replace placeholders with the real components:

```tsx
<div className="w-[260px] h-screen bg-zinc-900 border-r border-zinc-800 flex flex-col">
  {/* macOS drag region */}
  <div className="drag-region h-8 shrink-0" />

  {/* Book selector */}
  <BookSelector />

  {/* Pipeline tracker — scrollable */}
  <div className="flex-1 overflow-y-auto">
    <PipelineTracker />

    {/* Divider */}
    <div className="border-t border-zinc-800 mx-3 my-2" />

    {/* File tree */}
    <FileTree />
  </div>

  {/* Bottom nav */}
  <div className="shrink-0 border-t border-zinc-800 p-2">
    <NavButton icon="💬" label="Chat" view="chat" />
    <NavButton icon="📁" label="Files" view="files" />
    <NavButton icon="📦" label="Build" view="build" />
    <NavButton icon="⚙️" label="Settings" view="settings" />
  </div>
</div>
```

Use minimal emoji icons for now. Replace with Lucide icons later if desired.

---

## Verification

- Book selector shows all books, highlights the active one
- Creating a new book adds it to the list and switches to it
- Pipeline phases render with correct status (complete/active/locked)
- Clicking "Start" on the active phase creates a conversation and navigates to chat
- File tree shows the book's directory structure
- Clicking a `.md` file navigates to the Files view
- Everything refreshes when switching books
