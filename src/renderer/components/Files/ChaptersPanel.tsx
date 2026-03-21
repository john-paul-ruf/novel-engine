import { useState, useEffect, useMemo } from 'react';
import { useFileChangeStore } from '../../stores/fileChangeStore';

type ChaptersPanelProps = {
  activeSlug: string;
  onFileSelect: (path: string) => void;
};

type ChapterInfo = {
  slug: string;
  number: number;
  title: string;
  wordCount: number;
  hasDraft: boolean;
  hasNotes: boolean;
};

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

export function ChaptersPanel({
  activeSlug,
  onFileSelect,
}: ChaptersPanelProps): React.ReactElement {
  const revision = useFileChangeStore((s) => s.revision);
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const loadChapters = async () => {
      try {
        // Get chapter directories
        const entries = await window.novelEngine.files.listDir(activeSlug, 'chapters');
        const chapterDirs = entries.filter((e) => e.isDirectory);

        if (chapterDirs.length === 0) {
          if (!cancelled) {
            setChapters([]);
            setLoading(false);
          }
          return;
        }

        // Get per-chapter word counts
        const wordCounts = await window.novelEngine.books.wordCount(activeSlug);
        const wordCountMap = new Map(wordCounts.map((wc) => [wc.slug, wc.wordCount]));

        // Check draft/notes existence in parallel
        const chapterInfos = await Promise.all(
          chapterDirs.map(async (dir) => {
            const { number, title } = parseChapterName(dir.name);
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
            };
          }),
        );

        // Sort by chapter number
        chapterInfos.sort((a, b) => a.number - b.number);

        if (!cancelled) {
          setChapters(chapterInfos);
          setLoading(false);
        }
      } catch {
        // chapters directory may not exist yet
        if (!cancelled) {
          setChapters([]);
          setLoading(false);
        }
      }
    };

    loadChapters();

    return () => {
      cancelled = true;
    };
  }, [activeSlug, revision]);

  const maxWordCount = useMemo(() => {
    if (chapters.length === 0) return 1;
    return Math.max(...chapters.map((c) => c.wordCount), 1);
  }, [chapters]);

  const totalWordCount = useMemo(
    () => chapters.reduce((sum, c) => sum + c.wordCount, 0),
    [chapters],
  );

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

  if (chapters.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 py-8 text-center">
        <div className="text-zinc-500">No chapters yet</div>
        <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
          Chapters will appear here as Verity writes the first draft
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {chapters.map((chapter) => (
          <div
            key={chapter.slug}
            className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
          >
            {/* Chapter number */}
            <div className="w-10 shrink-0 text-right font-mono text-sm text-zinc-500">
              {chapter.number}
            </div>

            {/* Title — clickable, opens draft.md */}
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

            {/* Draft/Notes status badges */}
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
        ))}
      </div>

      {/* Summary footer */}
      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <span>{chapters.length} chapter{chapters.length !== 1 ? 's' : ''}</span>
        <span>{totalWordCount.toLocaleString()} total words</span>
      </div>
    </div>
  );
}
