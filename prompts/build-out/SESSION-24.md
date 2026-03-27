# Session 24 — Structured File Browser with Categorized Panels

## Context

Novel Engine Electron app. Sessions 01–23 built the complete app including agent chat, pipeline tracking, save-to-file, voice/author profile setup, revision queue, pipeline-locked chat, and the file browser view with view mode switching.

Currently, the **FileBrowser** (Session 23) shows a flat filesystem-style directory view — folders and files displayed as a grid or list, exactly mirroring the disk structure under the book root. While functional, this feels like a generic file manager rather than a **novel-writing tool**. Authors don't think in terms of `source/` directories and `about.json` files — they think in terms of their **story materials**, **agent feedback**, and **chapters**.

This session replaces the flat filesystem browser with a **structured, categorized file browser** that organizes the book's files into three purpose-driven panels:

1. **Source** — The author's creative foundation: pitch, story bible, scene outline, voice profile
2. **Agent Output** — Feedback and reports from Ghostlight, Lumen, Sable, and Forge
3. **Chapters** — Per-chapter cards showing draft, notes, and completion status

Each panel is a self-contained section within a single scrollable page — no tabs, no navigation. The author sees everything at a glance when they open the Files view without a specific file selected.

---

## Design

### Layout

The structured browser is a **single vertically-scrolling page** with three collapsible sections stacked top-to-bottom:

```
┌──────────────────────────────────────────────────────────────────┐
│  📚 Book Title                                    [Browse] [Grid]│
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ▾ SOURCE                                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ 🎤 Voice │ │ 📋 Scene │ │ 📖 Story │ │ 💡 Pitch │            │
│  │ Profile  │ │ Outline  │ │  Bible   │ │          │            │
│  │ 2,340 w  │ │ 5,120 w  │ │ 8,901 w  │ │ 1,200 w  │            │
│  │ ✓ exists │ │ ✓ exists │ │ ✗ empty  │ │ ✓ exists │            │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│                                                                  │
│  ▾ AGENT OUTPUT                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │ 👻 Ghostlight │ │ 💡 Lumen     │ │ 🔴 Sable     │             │
│  │ Reader Report │ │ Dev Report   │ │ Audit Report │             │
│  │ 3,400 words   │ │ 4,200 words  │ │ — not yet —  │             │
│  └──────────────┘ └──────────────┘ └──────────────┘             │
│                                                                  │
│  ▾ CHAPTERS                                                      │
│  ┌─────────────────────────────────────────────────────┐         │
│  │ Ch 1: The Beginning     ██████████ 3,200w    ✓ Draft │         │
│  │                                              ✓ Notes │         │
│  ├─────────────────────────────────────────────────────┤         │
│  │ Ch 2: Into the Woods    ████████░░ 2,800w    ✓ Draft │         │
│  │                                              ✗ Notes │         │
│  ├─────────────────────────────────────────────────────┤         │
│  │ Ch 3: The Crossing      ░░░░░░░░░░    0w    ✗ Draft │         │
│  │                                              ✗ Notes │         │
│  └─────────────────────────────────────────────────────┘         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### When It Appears

- **No file selected** → show the structured browser (replaces `NoFileSelected`)
- **File selected** → show the reader or editor (existing behavior from Session 23)
- The view mode switcher in `FilesHeader` toggles between `'browser'` (structured), `'reader'`, and `'editor'`

### Interaction Model

- **Click a source card** → opens that file in reader mode
- **Click an agent output card** → opens that report in reader mode
- **Click a chapter row** → opens that chapter's `draft.md` in reader mode
- **Click "Notes" link on a chapter row** → opens that chapter's `notes.md` in reader mode
- **Hover actions on cards** → "Edit" button (for `.md` files), opens in editor mode
- **Section headers are collapsible** → click `▾ SOURCE` to collapse/expand that section (persisted in local component state, not store)

---

## Task 1: Source Files Panel

### Create `src/renderer/components/Files/SourcePanel.tsx`

A panel showing the four core source documents as cards.

**Source file definitions (hardcoded):**

```typescript
const SOURCE_FILES = [
  { path: 'source/voice-profile.md', label: 'Voice Profile', icon: '🎤', description: 'Your writing voice DNA' },
  { path: 'source/scene-outline.md', label: 'Scene Outline', icon: '📋', description: 'Scene-by-scene story structure' },
  { path: 'source/story-bible.md',   label: 'Story Bible',   icon: '📖', description: 'Characters, world, and lore' },
  { path: 'source/pitch.md',         label: 'Pitch',         icon: '💡', description: 'The core story concept' },
] as const;
```

**Props:**

```typescript
type SourcePanelProps = {
  activeSlug: string;
  onFileSelect: (path: string) => void;
  onFileEdit: (path: string) => void;
};
```

**Behavior:**

1. On mount and when `activeSlug` changes, check each source file's existence using `window.novelEngine.files.exists(activeSlug, path)`
2. For files that exist, read them using `window.novelEngine.files.read(activeSlug, path)` to get word counts
3. Display each file as a card in a responsive grid (2 columns on narrow, 4 columns on wide)

**Card design:**

```tsx
<div
  key={file.path}
  onClick={() => onFileSelect(file.path)}
  className="group relative cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-800/80"
>
  {/* Hover edit action */}
  {fileExists && file.path.endsWith('.md') && (
    <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        onClick={(e) => { e.stopPropagation(); onFileEdit(file.path); }}
        className="rounded bg-zinc-700 p-1 text-xs text-zinc-300 hover:bg-zinc-600"
        title="Edit"
      >
        ✏️
      </button>
    </div>
  )}

  <div className="mb-2 text-2xl">{file.icon}</div>
  <div className="text-sm font-medium text-zinc-200">{file.label}</div>
  <div className="mt-0.5 text-xs text-zinc-500">{file.description}</div>

  {/* Status line */}
  <div className="mt-3 flex items-center gap-2 text-xs">
    {fileExists ? (
      <>
        <span className="text-green-400">✓</span>
        <span className="text-zinc-400">{wordCount.toLocaleString()} words</span>
      </>
    ) : (
      <>
        <span className="text-zinc-600">○</span>
        <span className="text-zinc-600">Not created yet</span>
      </>
    )}
  </div>
</div>
```

**Loading state:** Show skeleton cards (pulsing zinc-800 rectangles) while checking file existence.

**Error handling:** If a file check fails, treat it as "not created" — don't break the panel.

---

## Task 2: Agent Output Panel

### Create `src/renderer/components/Files/AgentOutputPanel.tsx`

A panel showing agent-produced reports and feedback documents.

**Agent output definitions:**

```typescript
const AGENT_OUTPUTS = [
  {
    agent: 'Ghostlight' as const,
    files: [
      { path: 'source/reader-report.md', label: 'Reader Report', description: 'First cold-read impressions' },
      { path: 'source/reader-report-v1.md', label: 'Reader Report v2', description: 'Post-revision read' },
    ],
  },
  {
    agent: 'Lumen' as const,
    files: [
      { path: 'source/dev-report.md', label: 'Dev Report', description: 'Structural analysis & recommendations' },
      { path: 'source/dev-report-v1.md', label: 'Dev Report v2', description: 'Post-revision assessment' },
    ],
  },
  {
    agent: 'Sable' as const,
    files: [
      { path: 'source/audit-report.md', label: 'Audit Report', description: 'Copy-level issues & fixes' },
      { path: 'source/style-sheet.md', label: 'Style Sheet', description: 'Consistency rules for the manuscript' },
    ],
  },
  {
    agent: 'Forge' as const,
    files: [
      { path: 'source/project-tasks.md', label: 'Project Tasks', description: 'Revision task breakdown' },
      { path: 'source/revision-prompts.md', label: 'Revision Prompts', description: 'Per-chapter fix instructions' },
    ],
  },
] as const;
```

**Props:**

```typescript
type AgentOutputPanelProps = {
  activeSlug: string;
  onFileSelect: (path: string) => void;
  onFileEdit: (path: string) => void;
};
```

**Behavior:**

1. On mount and when `activeSlug` changes, check each output file's existence
2. For existing files, read to get word counts
3. Display agent groups with their color dots (from `AGENT_REGISTRY`)

**Layout:**

Agent outputs are grouped by agent. Each agent group is a horizontal row:

```tsx
<div className="space-y-4">
  {AGENT_OUTPUTS.map((group) => {
    const agentMeta = AGENT_REGISTRY[group.agent];
    return (
      <div key={group.agent}>
        {/* Agent header */}
        <div className="mb-2 flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: agentMeta.color }}
          />
          <span className="text-xs font-medium text-zinc-300">{group.agent}</span>
          <span className="text-xs text-zinc-600">— {agentMeta.role}</span>
        </div>

        {/* File cards */}
        <div className="grid grid-cols-2 gap-3">
          {group.files.map((file) => (
            <AgentOutputCard
              key={file.path}
              file={file}
              exists={fileStatuses[file.path]?.exists ?? false}
              wordCount={fileStatuses[file.path]?.wordCount ?? 0}
              onSelect={() => onFileSelect(file.path)}
              onEdit={() => onFileEdit(file.path)}
            />
          ))}
        </div>
      </div>
    );
  })}
</div>
```

**Card for existing files:**
- Left-aligned label + word count badge
- Hover shows "Read" and "Edit" action buttons
- Agent color accent on the left border: `border-l-2` with `style={{ borderLeftColor: agentMeta.color }}`

**Card for non-existent files:**
- Dimmed styling (`opacity-50`)
- Label text + "Not yet generated" subtext
- No click handler — clicking does nothing (or shows a tooltip "This file will be created by {Agent} during the {Phase} phase")

---

## Task 3: Chapters Panel

### Create `src/renderer/components/Files/ChaptersPanel.tsx`

A panel showing all chapters with their draft/notes status and word counts.

**Props:**

```typescript
type ChaptersPanelProps = {
  activeSlug: string;
  onFileSelect: (path: string) => void;
  onFileEdit: (path: string) => void;
};
```

**Behavior:**

1. On mount and when `activeSlug` changes, call `window.novelEngine.files.listDir(activeSlug, 'chapters')` to get chapter folders
2. For each chapter folder, check for `draft.md` and `notes.md` existence
3. Get word counts using `window.novelEngine.books.wordCount(activeSlug)` (returns per-chapter word counts)
4. Parse chapter folder names: `NN-slug-name` → chapter number + title (e.g., `01-the-beginning` → `Chapter 1: The Beginning`)

**Chapter name parser:**

```typescript
function parseChapterName(folderName: string): { number: number; title: string } {
  const match = folderName.match(/^(\d+)-(.+)$/);
  if (!match) return { number: 0, title: folderName };
  const num = parseInt(match[1], 10);
  const title = match[2]
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return { number: num, title };
}
```

**Chapter row layout:**

Each chapter is a row in a list (not cards — chapters are sequential and benefit from a list layout):

```tsx
<div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
  {chapters.map((chapter) => (
    <div
      key={chapter.slug}
      className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-zinc-800/50"
    >
      {/* Chapter number */}
      <div className="w-10 shrink-0 text-right text-sm font-mono text-zinc-500">
        {chapter.number}
      </div>

      {/* Title — clickable, opens draft.md */}
      <button
        onClick={() => onFileSelect(`chapters/${chapter.slug}/draft.md`)}
        className="flex-1 text-left text-sm font-medium text-zinc-200 hover:text-white"
      >
        {chapter.title}
      </button>

      {/* Word count bar */}
      <div className="flex w-32 items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-blue-500/60"
            style={{ width: `${Math.min(100, (chapter.wordCount / maxWordCount) * 100)}%` }}
          />
        </div>
        <span className="w-14 text-right text-xs tabular-nums text-zinc-500">
          {chapter.wordCount > 0 ? `${chapter.wordCount.toLocaleString()}w` : '—'}
        </span>
      </div>

      {/* Draft/Notes status badges */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => onFileSelect(`chapters/${chapter.slug}/draft.md`)}
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            chapter.hasDraft
              ? 'bg-green-500/15 text-green-400'
              : 'bg-zinc-800 text-zinc-600'
          }`}
          title={chapter.hasDraft ? 'Open draft' : 'No draft yet'}
        >
          Draft
        </button>
        <button
          onClick={() => onFileSelect(`chapters/${chapter.slug}/notes.md`)}
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            chapter.hasNotes
              ? 'bg-blue-500/15 text-blue-400'
              : 'bg-zinc-800 text-zinc-600'
          }`}
          title={chapter.hasNotes ? 'Open notes' : 'No notes yet'}
        >
          Notes
        </button>
      </div>

      {/* Hover edit action */}
      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onFileEdit(`chapters/${chapter.slug}/draft.md`); }}
          className="rounded bg-zinc-700 p-1 text-xs text-zinc-300 hover:bg-zinc-600"
          title="Edit draft"
        >
          ✏️
        </button>
      </div>
    </div>
  ))}
</div>
```

**Empty state:** If no chapter folders exist, show:

```tsx
<div className="rounded-lg border border-dashed border-zinc-800 py-8 text-center">
  <div className="text-zinc-500">No chapters yet</div>
  <div className="mt-1 text-xs text-zinc-600">
    Chapters will appear here as Verity writes the first draft
  </div>
</div>
```

**Summary footer** below the chapter list:

```tsx
<div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
  <span>{chapters.length} chapter{chapters.length !== 1 ? 's' : ''}</span>
  <span>{totalWordCount.toLocaleString()} total words</span>
</div>
```

---

## Task 4: Collapsible Section Wrapper

### Create `src/renderer/components/Files/CollapsibleSection.tsx`

A reusable wrapper for the three panels.

**Props:**

```typescript
type CollapsibleSectionProps = {
  title: string;
  badge?: string;             // e.g. "4 files", "12 chapters"
  defaultExpanded?: boolean;  // defaults to true
  children: React.ReactNode;
};
```

**Implementation:**

```tsx
export function CollapsibleSection({
  title,
  badge,
  defaultExpanded = true,
  children,
}: CollapsibleSectionProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div>
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 py-2 text-left"
      >
        <span className="text-xs text-zinc-500">{expanded ? '▾' : '▸'}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {title}
        </span>
        {badge && (
          <span className="text-xs text-zinc-600">{badge}</span>
        )}
      </button>
      {expanded && <div className="pb-6">{children}</div>}
    </div>
  );
}
```

---

## Task 5: Structured Browser Composition

### Create `src/renderer/components/Files/StructuredBrowser.tsx`

The main composition component that assembles the three panels.

**Props:**

```typescript
type StructuredBrowserProps = {
  activeSlug: string;
  onFileSelect: (path: string) => void;
  onFileEdit: (path: string) => void;
};
```

**Implementation:**

```tsx
export function StructuredBrowser({
  activeSlug,
  onFileSelect,
  onFileEdit,
}: StructuredBrowserProps): React.ReactElement {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <CollapsibleSection title="Source" badge="Story foundation">
        <SourcePanel
          activeSlug={activeSlug}
          onFileSelect={onFileSelect}
          onFileEdit={onFileEdit}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Agent Output" badge="Reports & feedback">
        <AgentOutputPanel
          activeSlug={activeSlug}
          onFileSelect={onFileSelect}
          onFileEdit={onFileEdit}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Chapters" badge="Manuscript">
        <ChaptersPanel
          activeSlug={activeSlug}
          onFileSelect={onFileSelect}
          onFileEdit={onFileEdit}
        />
      </CollapsibleSection>
    </div>
  );
}
```

---

## Task 6: Update FilesView — Replace NoFileSelected with StructuredBrowser

### Update `src/renderer/components/Files/FilesView.tsx`

Replace the `NoFileSelected` component (which shows 4 quick-access buttons) with the new `StructuredBrowser`.

**Changes:**

1. Import `StructuredBrowser`:

```typescript
import { StructuredBrowser } from './StructuredBrowser';
```

2. Remove the `NoFileSelected` component and the `QUICK_ACCESS_FILES` constant (they're no longer needed — the `StructuredBrowser` supersedes them).

3. Add an `onFileEdit` handler:

```typescript
const handleFileEdit = useCallback((path: string) => {
  navigate('files', { filePath: path, fileViewMode: 'editor' });
}, [navigate]);
```

4. Replace the `if (!filePath)` branch:

**Before:**
```tsx
if (!filePath) {
  return <NoFileSelected onFileSelect={handleQuickAccess} />;
}
```

**After:**
```tsx
if (!filePath) {
  return (
    <StructuredBrowser
      activeSlug={activeSlug}
      onFileSelect={handleQuickAccess}
      onFileEdit={handleFileEdit}
    />
  );
}
```

If Session 23 has already been executed and `FilesView` has view mode orchestration (`fileViewMode`), integrate accordingly — the `StructuredBrowser` replaces whatever was in the `viewMode === 'browser'` branch.

5. Keep everything else — the file loading logic, reader rendering (`AboutJsonCard`, `MarkdownViewer`, `pre`), word count footer, and `Breadcrumb` all remain unchanged.

---

## Task 7: Update ViewStore for Browser Mode (if not already done by Session 23)

### Update `src/renderer/stores/viewStore.ts`

If Session 23 hasn't been executed yet, add `fileViewMode` and `fileBrowserPath` to the view payload:

```typescript
type FileViewMode = 'browser' | 'reader' | 'editor';

type ViewPayload = {
  filePath?: string;
  fileViewMode?: FileViewMode;
  fileBrowserPath?: string;
  conversationId?: string;
};
```

Export `FileViewMode` type.

When navigating to `files` without a `filePath`, default `fileViewMode` to `'browser'`.

If Session 23 has already been executed, no changes are needed here.

---

## Summary of Changes by File

| File | Change |
|------|--------|
| `src/renderer/components/Files/SourcePanel.tsx` | **NEW** — Source document cards (pitch, outline, bible, voice) |
| `src/renderer/components/Files/AgentOutputPanel.tsx` | **NEW** — Agent report cards grouped by agent (Ghostlight, Lumen, Sable, Forge) |
| `src/renderer/components/Files/ChaptersPanel.tsx` | **NEW** — Chapter list with draft/notes status, word counts, progress bars |
| `src/renderer/components/Files/CollapsibleSection.tsx` | **NEW** — Reusable collapsible section wrapper |
| `src/renderer/components/Files/StructuredBrowser.tsx` | **NEW** — Composes the three panels into a single scrollable view |
| `src/renderer/components/Files/FilesView.tsx` | Replace `NoFileSelected` with `StructuredBrowser`; remove `QUICK_ACCESS_FILES` |
| `src/renderer/stores/viewStore.ts` | Add `FileViewMode` type export (if not already present from Session 23) |

---

## Architecture Notes

- **No new IPC channels needed.** All three panels use existing `files:exists`, `files:read`, `files:listDir`, and `books:wordCount` channels.
- **No domain changes.** `FileEntry` type is sufficient. Word counts and metadata are derived in the renderer.
- **No infrastructure changes.** All new code is in the renderer layer.
- **Layer boundaries preserved.** The new components access the backend only through `window.novelEngine`.
- **Import rule:** The panels import `AGENT_REGISTRY` from `@domain/constants` (allowed — renderer can import constants from domain as values since constants is pure data with no side effects). They import types via `import type` from `@domain/types`.

---

## Verification

1. **Source panel:**
   - Navigate to Files view without selecting a specific file → see the structured browser
   - Source section shows 4 cards: Voice Profile, Scene Outline, Story Bible, Pitch
   - Cards that exist show green checkmark + word count
   - Cards that don't exist show dimmed "Not created yet" text
   - Click a source card → opens that file in reader mode
   - Hover a card → edit button appears; click it → opens in editor mode

2. **Agent output panel:**
   - Agent groups show colored dots matching each agent's registry color
   - Each group shows its report files (reader-report, dev-report, audit-report, etc.)
   - Files that exist show word counts; files that don't exist are dimmed
   - Click an existing report → opens in reader mode

3. **Chapters panel:**
   - Chapter folders are listed in numeric order
   - Each row shows: chapter number, title (parsed from folder name), word count bar, Draft/Notes status badges
   - Click a chapter title or Draft badge → opens `draft.md` in reader mode
   - Click Notes badge → opens `notes.md` in reader mode
   - Summary footer shows total chapter count and total word count
   - Empty state shows "No chapters yet" message when no chapter folders exist

4. **Collapsible sections:**
   - Click a section header → collapses/expands that section
   - All three sections default to expanded

5. **Integration with existing views:**
   - Sidebar FileTree still works — clicking a file opens it in reader mode
   - Breadcrumb navigation works when viewing a file
   - Back/browse navigation returns to the structured browser

6. **Compilation:**
   - `npx tsc --noEmit` passes with all changes
   - No new imports that violate layer boundaries (all changes are renderer-only)
