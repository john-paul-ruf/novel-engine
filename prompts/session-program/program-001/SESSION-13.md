# SESSION-13 — Reading Mode

> **Feature:** small-queue-intake
> **Layer(s):** M01 (domain), M05 (filesystem infra), M08 (application skipped — direct infra call), M09 (IPC/main), M10 (renderer)
> **Depends on:** Nothing (standalone)
> **Estimated effort:** 30 min

---

## Context

A full-manuscript reading mode: all chapters assembled in order, displayed as a continuous scroll with good typography. No editing, no sidebar distractions. Read-throughs without leaving the app or triggering a Pandoc build.

---

## Files to Read First

- `src/domain/interfaces.ts` — IFileSystemService (to add assembleManuscript)
- `src/infrastructure/filesystem/FileSystemService.ts` — listDirectory, readFile implementations
- `src/main/ipc/handlers.ts` — books: namespace handlers
- `src/preload/index.ts` — window.novelEngine.books namespace
- `src/renderer/stores/viewStore.ts` — ViewId type, navigate
- `src/renderer/components/Layout/AppLayout.tsx` — ViewContent to add ReadingModeView
- `src/renderer/components/Build/BuildView.tsx` — where to add a "Read" entry point

---

## Step 1: Domain — Add ManuscriptAssembly type and IFileSystemService method

In `src/domain/types.ts`, add a section `// === Manuscript Assembly ===`:

```ts
// === Manuscript Assembly ===

export type ManuscriptAssembly = {
  content: string;       // full markdown — all chapters concatenated in order
  chapterCount: number;
  wordCount: number;
  chapters: { slug: string; title: string; wordCount: number }[];
};
```

In `src/domain/interfaces.ts`, add to `IFileSystemService`:

```ts
/**
 * Assemble the full manuscript by reading all chapter draft.md files
 * in order and concatenating them with chapter headings.
 * Returns the combined markdown suitable for the reading mode view.
 */
assembleManuscript(bookSlug: string): Promise<ManuscriptAssembly>;
```

---

## Step 2: Infrastructure — Implement assembleManuscript

In `src/infrastructure/filesystem/FileSystemService.ts`, implement the new method:

```ts
async assembleManuscript(bookSlug: string): Promise<ManuscriptAssembly> {
  const chaptersDir = path.join(this.booksPath, bookSlug, 'chapters');
  let entries: string[] = [];
  try {
    entries = await fs.readdir(chaptersDir);
  } catch {
    return { content: '', chapterCount: 0, wordCount: 0, chapters: [] };
  }

  // Sort numerically by chapter prefix (e.g., "01-opening", "02-conflict")
  const chapterDirs = entries
    .filter(e => /^\d+-.+/.test(e))
    .sort((a, b) => {
      const numA = parseInt(a.match(/^(\d+)/)?.[1] ?? '0', 10);
      const numB = parseInt(b.match(/^(\d+)/)?.[1] ?? '0', 10);
      return numA - numB;
    });

  const chapters: ManuscriptAssembly['chapters'] = [];
  const parts: string[] = [];

  for (const dir of chapterDirs) {
    const draftPath = path.join(chaptersDir, dir, 'draft.md');
    let draft = '';
    try {
      draft = await fs.readFile(draftPath, 'utf-8');
    } catch {
      continue; // skip chapters without a draft
    }

    // Derive a display title from the slug
    const slug = dir;
    const titleFromSlug = dir.replace(/^\d+-/, '').replace(/-/g, ' ');
    const title = titleFromSlug.charAt(0).toUpperCase() + titleFromSlug.slice(1);

    const wc = draft.trim().split(/\s+/).filter(Boolean).length;
    chapters.push({ slug, title, wordCount: wc });
    parts.push(`# ${title}\n\n${draft.trim()}`);
  }

  const content = parts.join('\n\n---\n\n');
  const wordCount = chapters.reduce((sum, c) => sum + c.wordCount, 0);

  return { content, chapterCount: chapters.length, wordCount, chapters };
}
```

---

## Step 3: IPC — Add handler

In `src/main/ipc/handlers.ts`, add (in the `books:` section):

```ts
ipcMain.handle('books:assembleManuscript', (_e, bookSlug: string) =>
  fileSystemService.assembleManuscript(bookSlug)
);
```

---

## Step 4: Preload — Expose on bridge

In `src/preload/index.ts`, add to the `books` namespace:

```ts
assembleManuscript: (bookSlug: string) =>
  ipcRenderer.invoke('books:assembleManuscript', bookSlug),
```

---

## Step 5: ViewStore — Add 'reading' view

In `src/renderer/stores/viewStore.ts`:
- Add `'reading'` to the `ViewId` union: `type ViewId = '...' | 'reading';`
- The `navigate` function already handles unknown views gracefully — no other changes needed

---

## Step 6: Create ReadingModeView component

Create `src/renderer/components/Reading/ReadingModeView.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import { useBookStore } from '../../stores/bookStore';
import { useViewStore } from '../../stores/viewStore';
import type { ManuscriptAssembly } from '@domain/types';

export function ReadingModeView(): React.ReactElement {
  const { activeSlug } = useBookStore();
  const { navigate } = useViewStore();
  const [assembly, setAssembly] = useState<ManuscriptAssembly | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentChapter, setCurrentChapter] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeSlug) return;
    setLoading(true);
    setError(null);
    window.novelEngine.books.assembleManuscript(activeSlug)
      .then(setAssembly)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load manuscript'))
      .finally(() => setLoading(false));
  }, [activeSlug]);

  // Track reading progress via IntersectionObserver on chapter headings
  useEffect(() => {
    if (!assembly || !contentRef.current) return;
    const headings = contentRef.current.querySelectorAll('h1[data-chapter-index]');
    if (!headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length > 0) {
          const idx = parseInt((visible[0].target as HTMLElement).dataset.chapterIndex ?? '0', 10);
          setCurrentChapter(idx + 1);
        }
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    headings.forEach(h => observer.observe(h));
    return () => observer.disconnect();
  }, [assembly]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-zinc-400">Assembling manuscript...</div>
      </div>
    );
  }

  if (error || !assembly) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-red-400">{error ?? 'No manuscript to display'}</p>
        <button onClick={() => navigate('build')} className="text-sm text-blue-500 hover:underline">
          Back to Build
        </button>
      </div>
    );
  }

  // Render chapter headings with data-chapter-index for IntersectionObserver
  const htmlParts = assembly.chapters.map((ch, idx) => {
    const chapterContent = assembly.content
      .split(/\n---\n/)
      [idx] ?? '';
    // Replace the first H1 with an indexed one for tracking
    return chapterContent.replace(
      /^# .+/m,
      `<h1 data-chapter-index="${idx}">${ch.title}</h1>`
    );
  }).join('\n\n<hr class="my-12 border-zinc-700">\n\n');

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-950">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-3">
        <button
          onClick={() => navigate('build')}
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← Exit Reading Mode
        </button>
        <span className="text-xs text-zinc-400">
          Chapter {currentChapter} of {assembly.chapterCount} — {assembly.wordCount.toLocaleString()} words
        </span>
      </div>

      {/* Reading content */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto"
      >
        <div
          className="mx-auto max-w-2xl px-8 py-12 prose prose-zinc dark:prose-invert prose-lg"
          dangerouslySetInnerHTML={{ __html: marked.parse(assembly.content) as string }}
        />
      </div>
    </div>
  );
}
```

Note: the IntersectionObserver chapter tracking approach works with the `marked`-rendered HTML. The `data-chapter-index` insertion via string replacement is a pragmatic approach — if the rendered HTML does not have accessible h1 tags, simplify to just show a static "Chapter X of Y" based on scroll position percentage instead.

---

## Step 7: Add ReadingModeView to AppLayout

In `src/renderer/components/Layout/AppLayout.tsx`:
- Import `ReadingModeView` from `'../Reading/ReadingModeView'`
- Add to `ViewContent`:
  ```tsx
  <div className={`h-full ${currentView === 'reading' ? '' : 'hidden'}`}>
    <ReadingModeView />
  </div>
  ```

---

## Step 8: Add entry point in BuildView

In `src/renderer/components/Build/BuildView.tsx`:
- Read the file to understand the current layout
- Add a "Read Full Manuscript" button near the top of the Build view (or alongside the build format buttons)

```tsx
<button
  onClick={() => navigate('reading')}
  className="flex items-center gap-2 rounded-md px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
>
  📖 Read Full Manuscript
</button>
```

---

## Architecture Compliance

- [x] Domain: ManuscriptAssembly type in types.ts; method in IFileSystemService
- [x] Infrastructure: assembleManuscript in FileSystemService — reads files, no external dependencies
- [x] IPC: one-liner handler
- [x] Preload: typed bridge method
- [x] Renderer: ReadingModeView + viewStore update + AppLayout + BuildView entry point
- [x] No Pandoc involved — pure file read + concatenation

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Build view has a "📖 Read Full Manuscript" button
3. Clicking it navigates to the reading view
4. The reading view assembles all chapters in order with chapter headings
5. The top bar shows current chapter / total count / word count
6. "← Exit Reading Mode" returns to the Build view
7. Empty manuscript (no chapters): shows an appropriate empty state

---

## State Update

Set SESSION-13 to `done` in STATE.md.
