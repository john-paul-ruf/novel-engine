import { useImportStore } from '../../stores/importStore';

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function ChapterPreviewList() {
  const chapters = useImportStore((s) => s.chapters);
  const renameChapter = useImportStore((s) => s.renameChapter);
  const mergeWithNext = useImportStore((s) => s.mergeWithNext);
  const removeChapter = useImportStore((s) => s.removeChapter);

  const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

  return (
    <div className="flex flex-col">
      <div className="max-h-[400px] overflow-y-auto">
        {chapters.map((chapter, i) => (
          <div
            key={chapter.index}
            className="flex items-start gap-3 px-3 py-2 border-b border-zinc-200 dark:border-zinc-800"
          >
            {/* Chapter number */}
            <span className="mt-1 flex-shrink-0 text-xs font-mono text-zinc-400 w-6 text-right">
              {i + 1}
            </span>

            {/* Title + preview */}
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={chapter.title}
                onChange={(e) => renameChapter(i, e.target.value)}
                className="w-full text-sm font-medium bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-zinc-900 dark:text-zinc-100"
              />
              <p className="text-xs text-zinc-400 dark:text-zinc-500 line-clamp-1 mt-0.5">
                {chapter.content.slice(0, 100).replace(/\n/g, ' ')}
              </p>
            </div>

            {/* Word count badge */}
            <span className="flex-shrink-0 mt-1 text-xs text-zinc-500">
              {formatNumber(chapter.wordCount)}w
            </span>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
              {i < chapters.length - 1 && (
                <button
                  onClick={() => mergeWithNext(i)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 px-1"
                  title="Merge with next chapter"
                >
                  Merge ↓
                </button>
              )}
              {chapters.length > 1 && (
                <button
                  onClick={() => removeChapter(i)}
                  className="text-xs text-zinc-400 hover:text-red-500 dark:hover:text-red-400 px-1"
                  title="Remove chapter"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Summary bar */}
      <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-700">
        {chapters.length} chapter{chapters.length !== 1 ? 's' : ''} · {formatNumber(totalWords)} words
      </div>
    </div>
  );
}
