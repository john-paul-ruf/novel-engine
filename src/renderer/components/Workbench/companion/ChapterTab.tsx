import { useEffect, useState } from 'react';
import { useBookStore } from '../../../stores/bookStore';
import { useDashboardStore } from '../../../stores/dashboardStore';
import { useViewStore } from '../../../stores/viewStore';
import { Icon } from '../../common/Icon';
import { ProseViewer, useBookFile } from '../../common/ProseViewer';
import { VersionHistoryModal } from '../../common/VersionHistoryModal';

function humanize(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** "02-the-burger" → "Ch 2 — The Burger"; front/back matter get their plain title. */
function chapterLabel(slug: string): string {
  const back = slug.match(/^z(\d+)-(.+)$/i);
  if (back) return humanize(back[2]);
  const front = slug.match(/^00-(\d+)-(.+)$/);
  if (front) return humanize(front[2]);
  const body = slug.match(/^(\d+)-(.+)$/);
  if (body) return `Ch ${parseInt(body[1], 10)} — ${humanize(body[2])}`;
  return slug;
}

/**
 * Typeset chapter reader for the companion pane: chapter dropdown + scrubber
 * dots, live-refreshing draft (Verity's writes land via fileChangeStore),
 * and a jump-off to the manuscript view.
 */
export function ChapterTab(): React.ReactElement {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const chapters = useBookStore((s) => s.chapters);
  const dashboardData = useDashboardStore((s) => s.data);
  const { navigate } = useViewStore();

  const [selected, setSelected] = useState<string | null>(null);
  const [historyPath, setHistoryPath] = useState<string | null>(null);

  // Book switch → reset so the new book's default is adopted.
  useEffect(() => {
    setSelected(null);
    setHistoryPath(null);
  }, [activeSlug]);

  // Default: the most recently modified chapter draft (dashboard recent files,
  // kept fresh by the always-mounted LibraryView), else the last written chapter.
  useEffect(() => {
    if (chapters.length === 0) return;
    if (selected !== null && chapters.some((c) => c.slug === selected)) return;

    let fallback: string | null = null;
    if (dashboardData?.bookSlug === activeSlug) {
      const recentChapter = [...dashboardData.recentFiles]
        .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
        .map((f) => f.path.match(/^chapters\/([^/]+)\/draft\.md$/)?.[1])
        .find((slug) => slug && chapters.some((c) => c.slug === slug));
      fallback = recentChapter ?? null;
    }
    if (!fallback) {
      const written = chapters.filter((c) => c.wordCount > 0);
      fallback = (written[written.length - 1] ?? chapters[chapters.length - 1]).slug;
    }
    setSelected(fallback);
  }, [chapters, selected, dashboardData, activeSlug]);

  const { content, loading, error } = useBookFile(
    activeSlug,
    selected ? `chapters/${selected}/draft.md` : null,
  );

  if (chapters.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-ne-ink-faint">
        Chapters appear here as Verity drafts them.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Chapter select + scrubber */}
      <div className="flex shrink-0 items-center gap-3 border-b border-ne-line-soft px-3 py-2">
        <select
          value={selected ?? ''}
          onChange={(e) => setSelected(e.target.value)}
          className="min-w-0 max-w-[60%] shrink-0 rounded-md border border-ne-line bg-ne-bg2 px-2 py-1 text-[11px] text-ne-ink-dim outline-none transition-colors hover:border-ne-brass/50"
          title="Select chapter"
        >
          {chapters.map((chapter) => (
            <option key={chapter.slug} value={chapter.slug}>
              {chapterLabel(chapter.slug)}
              {chapter.wordCount > 0 ? ` · ${chapter.wordCount.toLocaleString()}w` : ''}
            </option>
          ))}
        </select>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[5px]">
          {chapters.map((chapter) => (
            <button
              key={chapter.slug}
              onClick={() => setSelected(chapter.slug)}
              title={chapterLabel(chapter.slug)}
              className={`h-[7px] w-[7px] shrink-0 rounded-full transition-colors ${
                chapter.slug === selected
                  ? 'bg-ne-brass-hi shadow-[0_0_7px_rgba(232,201,136,.7)]'
                  : chapter.wordCount > 0
                    ? 'bg-ne-brass'
                    : 'bg-ne-bg3'
              }`}
            />
          ))}
        </div>
        {selected && !error && (
          <button
            onClick={() => setHistoryPath(`chapters/${selected}/draft.md`)}
            title="Version history"
            className="flex shrink-0 items-center gap-1 rounded-md border border-ne-line bg-ne-bg2 px-2 py-1 text-[11px] text-ne-ink-dim transition-colors hover:border-ne-brass/50 hover:text-ne-ink"
          >
            <Icon name="history" size={10} strokeWidth={2} />
            History
          </button>
        )}
      </div>

      {/* Typeset draft */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6 pb-14">
        {error ? (
          <div className="pt-8 text-center text-sm text-ne-ink-faint">
            No draft yet for {selected ? chapterLabel(selected) : 'this chapter'}.
          </div>
        ) : loading ? (
          <div className="pt-8 text-center text-sm text-ne-ink-faint">Loading…</div>
        ) : (
          <ProseViewer content={content} />
        )}
      </div>

      {/* Jump to the manuscript view */}
      {selected && (
        <div className="flex shrink-0 items-center justify-end border-t border-ne-line-soft px-4 py-1.5">
          <button
            onClick={() => navigate('manuscript', { chapterSlug: selected })}
            className="text-[11px] text-ne-ink-dim transition-colors hover:text-ne-brass-hi"
          >
            Open in Manuscript →
          </button>
        </div>
      )}

      {historyPath && activeSlug && (
        <VersionHistoryModal
          bookSlug={activeSlug}
          filePath={historyPath}
          onClose={() => setHistoryPath(null)}
        />
      )}
    </div>
  );
}
