import { useState, useEffect, useMemo } from 'react';
import { useFileChangeStore } from '../../stores/fileChangeStore';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Copyright  — auto-generated from book metadata; read-only in the UI (folder 00-*)
 * Dedication — author-editable; title is always "Dedication" (folder 01-*)
 * Body       — Verity-written story chapters (folders 02-99)
 * Backmatter — author-written closing chapters (folders z0, z1, z2, …)
 */
type ChapterKind = 'copyright' | 'dedication' | 'body' | 'backmatter';

type ChapterInfo = {
  slug: string;
  number: number;    // numeric prefix: 0, 1, 2… for front/body; z-index for back matter
  title: string;
  wordCount: number;
  hasDraft: boolean;
  hasNotes: boolean;
  kind: ChapterKind;
};

type ChaptersPanelProps = {
  activeSlug: string;
  onFileSelect: (path: string) => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a chapter folder name into its kind, numeric position, and display title.
 *
 * Supported patterns:
 *   00-copyright-page  → kind: 'copyright',  title: 'Copyright',   number: 0
 *   01-dedication      → kind: 'dedication', title: 'Dedication',  number: 1
 *   02-the-beginning   → kind: 'body',       title: 'The Beginning', number: 2
 *   z0-acknowledgments → kind: 'backmatter', title: 'Acknowledgments', number: 0
 */
function parseChapterName(folderName: string): { number: number; title: string; kind: ChapterKind } {
  // Back matter: z0-title, z1-title, … (case-insensitive)
  const zMatch = folderName.match(/^z(\d+)-(.+)$/i);
  if (zMatch) {
    return {
      number: parseInt(zMatch[1], 10),
      title: humanize(zMatch[2]),
      kind: 'backmatter',
    };
  }

  // Numbered chapters: 00-..., 01-..., 02-..., etc.
  const match = folderName.match(/^(\d+)-(.+)$/);
  if (!match) return { number: 0, title: folderName, kind: 'body' };

  const num = parseInt(match[1], 10);
  // Enforce fixed titles for front matter chapters regardless of folder slug
  if (num === 0) return { number: 0, title: 'Copyright', kind: 'copyright' };
  if (num === 1) return { number: 1, title: 'Dedication', kind: 'dedication' };
  return { number: num, title: humanize(match[2]), kind: 'body' };
}

/** Convert a kebab-case slug to Title Case words. */
function humanize(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Convert a display title to a URL-safe slug for folder naming. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const KIND_ORDER: Record<ChapterKind, number> = {
  copyright: 0,
  dedication: 1,
  body: 2,
  backmatter: 3,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ChaptersPanel({
  activeSlug,
  onFileSelect,
}: ChaptersPanelProps): React.ReactElement {
  const fileRevision = useFileChangeStore((s) => s.revision);

  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  // Incremented after user-initiated changes (e.g. adding a back matter chapter)
  const [refreshKey, setRefreshKey] = useState(0);

  // Back matter addition state
  const [addingBackMatter, setAddingBackMatter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [addingInProgress, setAddingInProgress] = useState(false);

  // ── Load chapters ────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const entries = await window.novelEngine.files.listDir(activeSlug, 'chapters');
        if (cancelled) return;

        const chapterDirs = entries.filter((e) => e.isDirectory);
        if (chapterDirs.length === 0) {
          if (!cancelled) { setChapters([]); setLoading(false); }
          return;
        }

        const wordCounts = await window.novelEngine.books.wordCount(activeSlug);
        if (cancelled) return;

        const wordCountMap = new Map(wordCounts.map((wc) => [wc.slug, wc.wordCount]));

        const chapterInfos = await Promise.all(
          chapterDirs.map(async (dir) => {
            const { number, title, kind } = parseChapterName(dir.name);
            const slug = dir.name;

            let hasDraft = false;
            let hasNotes = false;
            try {
              hasDraft = await window.novelEngine.files.exists(activeSlug, `chapters/${slug}/draft.md`);
            } catch { /* treat as no draft */ }
            try {
              hasNotes = await window.novelEngine.files.exists(activeSlug, `chapters/${slug}/notes.md`);
            } catch { /* treat as no notes */ }

            return {
              slug,
              number,
              title,
              wordCount: wordCountMap.get(slug) ?? 0,
              hasDraft,
              hasNotes,
              kind,
            };
          }),
        );

        // Front matter → body → back matter; within each group, sort by number
        chapterInfos.sort((a, b) => {
          const kindDiff = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
          return kindDiff !== 0 ? kindDiff : a.number - b.number;
        });

        if (!cancelled) { setChapters(chapterInfos); setLoading(false); }
      } catch {
        if (!cancelled) { setChapters([]); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [activeSlug, fileRevision, refreshKey]);

  // ── Derived data ─────────────────────────────────────────────────────────

  const frontMatter = useMemo(() => chapters.filter((c) => c.kind === 'copyright' || c.kind === 'dedication'), [chapters]);
  const bodyChapters = useMemo(() => chapters.filter((c) => c.kind === 'body'), [chapters]);
  const backMatter = useMemo(() => chapters.filter((c) => c.kind === 'backmatter'), [chapters]);

  const maxWordCount = useMemo(
    () => Math.max(...chapters.map((c) => c.wordCount), 1),
    [chapters],
  );

  const bodyWordCount = useMemo(
    () => bodyChapters.reduce((sum, c) => sum + c.wordCount, 0),
    [bodyChapters],
  );

  // ── Add back matter ──────────────────────────────────────────────────────

  const handleAddBackMatterChapter = async () => {
    const title = newChapterTitle.trim();
    if (!title || addingInProgress) return;

    setAddingInProgress(true);
    try {
      // Find the highest existing z-number to avoid collisions even when there are gaps
      const maxNum = backMatter.reduce((max, ch) => Math.max(max, ch.number), -1);
      const nextNum = maxNum + 1;
      const slug = slugify(title) || `chapter-${nextNum}`;
      const folderName = `z${nextNum}-${slug}`;

      await window.novelEngine.files.write(
        activeSlug,
        `chapters/${folderName}/draft.md`,
        `# ${title}\n\n`,
      );

      setNewChapterTitle('');
      setAddingBackMatter(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error('[ChaptersPanel] Failed to create back matter chapter:', err);
    } finally {
      setAddingInProgress(false);
    }
  };

  // ── Render helpers ───────────────────────────────────────────────────────

  /** Standard editable row — used for body and back matter chapters. */
  const renderEditableRow = (chapter: ChapterInfo) => (
    <div
      key={chapter.slug}
      className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
    >
      {/* Position label */}
      <div className="w-10 shrink-0 text-right font-mono text-sm text-zinc-500">
        {chapter.kind === 'backmatter' ? `z${chapter.number}` : chapter.number}
      </div>

      {/* Title — click opens draft.md */}
      <button
        onClick={() => onFileSelect(`chapters/${chapter.slug}/draft.md`)}
        className="flex-1 text-left text-sm font-medium text-zinc-800 dark:text-zinc-200 hover:text-white"
      >
        {chapter.title}
      </button>

      {/* Word count bar */}
      <div className="flex w-32 items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-blue-500/60"
            style={{ width: `${Math.min(100, (chapter.wordCount / maxWordCount) * 100)}%` }}
          />
        </div>
        <span className="w-14 text-right text-xs tabular-nums text-zinc-500">
          {chapter.wordCount > 0 ? `${chapter.wordCount.toLocaleString()}w` : '—'}
        </span>
      </div>

      {/* Draft / Notes badges */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => onFileSelect(`chapters/${chapter.slug}/draft.md`)}
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            chapter.hasDraft
              ? 'bg-green-500/15 text-green-600 dark:text-green-400'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600'
          }`}
          title={chapter.hasDraft ? 'Open draft' : 'No draft yet'}
        >
          Draft
        </button>
        <button
          onClick={() => onFileSelect(`chapters/${chapter.slug}/notes.md`)}
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            chapter.hasNotes
              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600'
          }`}
          title={chapter.hasNotes ? 'Open notes' : 'No notes yet'}
        >
          Notes
        </button>
      </div>
    </div>
  );

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[52px] animate-pulse rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-200/50 dark:bg-zinc-800/50"
          />
        ))}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Front Matter ─────────────────────────────────────────────────── */}
      {frontMatter.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Front Matter
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
            {frontMatter.map((chapter) => {
              if (chapter.kind === 'copyright') {
                // Copyright page is auto-generated — display only, no edit affordance
                return (
                  <div
                    key={chapter.slug}
                    className="flex items-center gap-4 px-4 py-3"
                  >
                    <div className="w-10 shrink-0 text-right font-mono text-sm text-zinc-400 dark:text-zinc-600">
                      00
                    </div>
                    <span className="flex-1 text-sm font-medium text-zinc-400 dark:text-zinc-500">
                      {chapter.title}
                    </span>
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500">
                      Auto-generated
                    </span>
                  </div>
                );
              }

              // Dedication — fully editable (title is always "Dedication")
              return renderEditableRow(chapter);
            })}
          </div>
        </div>
      )}

      {/* ── Story Chapters (body) ─────────────────────────────────────────── */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Story Chapters
        </div>
        {bodyChapters.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 py-8 text-center">
            <div className="text-zinc-500">No story chapters yet</div>
            <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
              Chapters will appear here as Verity writes the first draft
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
            {bodyChapters.map(renderEditableRow)}
          </div>
        )}
      </div>

      {/* ── Back Matter ──────────────────────────────────────────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Back Matter
          </div>
          {!addingBackMatter && (
            <button
              onClick={() => setAddingBackMatter(true)}
              className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
            >
              + Add Chapter
            </button>
          )}
        </div>

        {backMatter.length > 0 && (
          <div className="mb-3 divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
            {backMatter.map(renderEditableRow)}
          </div>
        )}

        {/* Inline form for adding a new back matter chapter */}
        {addingBackMatter && (
          <div className="flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2">
            <input
              type="text"
              value={newChapterTitle}
              onChange={(e) => setNewChapterTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAddBackMatterChapter();
                if (e.key === 'Escape') { setAddingBackMatter(false); setNewChapterTitle(''); }
              }}
              placeholder="Chapter title (e.g. Acknowledgments)"
              className="flex-1 bg-transparent text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <button
              onClick={() => void handleAddBackMatterChapter()}
              disabled={!newChapterTitle.trim() || addingInProgress}
              className="rounded px-2.5 py-1 text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {addingInProgress ? 'Adding…' : 'Add'}
            </button>
            <button
              onClick={() => { setAddingBackMatter(false); setNewChapterTitle(''); }}
              className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {backMatter.length === 0 && !addingBackMatter && (
          <div className="rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 py-6 text-center">
            <div className="text-sm text-zinc-400 dark:text-zinc-600">No back matter yet</div>
            <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
              Add acknowledgments, author's notes, or other closing material
            </div>
          </div>
        )}
      </div>

      {/* ── Summary footer ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          {bodyChapters.length} story chapter{bodyChapters.length !== 1 ? 's' : ''}
          {backMatter.length > 0 && ` · ${backMatter.length} back matter`}
        </span>
        <span>{bodyWordCount.toLocaleString()} manuscript words</span>
      </div>
    </div>
  );
}
