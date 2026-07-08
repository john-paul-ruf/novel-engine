import { useEffect, useMemo, useState } from 'react';
import type { ChapterEditStatus } from '@domain/types';
import { useFileChangeStore } from '../../stores/fileChangeStore';
import { DeleteConfirmModal, useDeleteFile } from '../Files/DeleteConfirmModal';
import { Icon } from '../common/Icon';

// ── Chapter list (same source + parsing as the legacy ChaptersPanel) ─────────

export type ChapterKind = 'copyright' | 'dedication' | 'body' | 'backmatter';

export type ChapterInfo = {
  slug: string;
  number: number;
  title: string;
  wordCount: number;
  hasDraft: boolean;
  hasNotes: boolean;
  hasUserEdits: boolean;
  kind: ChapterKind;
};

function humanize(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseChapterName(folderName: string): { number: number; title: string; kind: ChapterKind } {
  const zMatch = folderName.match(/^z(\d+)-(.+)$/i);
  if (zMatch) {
    return { number: parseInt(zMatch[1], 10), title: humanize(zMatch[2]), kind: 'backmatter' };
  }
  const fmMatch = folderName.match(/^00-(\d+)-(.+)$/);
  if (fmMatch) {
    const subIndex = parseInt(fmMatch[1], 10);
    if (subIndex === 0) return { number: 0, title: 'Copyright', kind: 'copyright' };
    if (subIndex === 1) return { number: 1, title: 'Dedication', kind: 'dedication' };
    return { number: subIndex, title: humanize(fmMatch[2]), kind: 'copyright' };
  }
  const match = folderName.match(/^(\d+)-(.+)$/);
  if (!match) return { number: 0, title: folderName, kind: 'body' };
  return { number: parseInt(match[1], 10), title: humanize(match[2]), kind: 'body' };
}

const KIND_ORDER: Record<ChapterKind, number> = {
  copyright: 0,
  dedication: 1,
  body: 2,
  backmatter: 3,
};

/**
 * Chapter inventory for the manuscript screen — same listDir + wordCount +
 * exists checks ChaptersPanel performs, refreshed on every file change.
 */
export function useChapterList(activeSlug: string): { chapters: ChapterInfo[]; loading: boolean } {
  const revision = useFileChangeStore((s) => s.revision);
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeSlug) {
      setChapters([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const entries = await window.novelEngine.files.listDir(activeSlug, 'chapters');
        if (cancelled) return;

        const chapterDirs = entries.filter((e) => e.isDirectory);
        if (chapterDirs.length === 0) {
          if (!cancelled) {
            setChapters([]);
            setLoading(false);
          }
          return;
        }

        const wordCounts = await window.novelEngine.books.wordCount(activeSlug);
        if (cancelled) return;
        const wordCountMap = new Map(wordCounts.map((wc) => [wc.slug, wc.wordCount]));

        let editStatuses: ChapterEditStatus[] = [];
        try {
          editStatuses = await window.novelEngine.versions.getChapterEditStatuses(activeSlug);
        } catch { /* badge is best-effort — ignore */ }
        if (cancelled) return;
        const editedSet = new Set(
          editStatuses.filter((s) => s.hasUserEdits).map((s) => s.chapterSlug),
        );

        const infos = await Promise.all(
          chapterDirs.map(async (dir) => {
            const { number, title, kind } = parseChapterName(dir.name);
            let hasDraft = false;
            let hasNotes = false;
            try {
              hasDraft = await window.novelEngine.files.exists(activeSlug, `chapters/${dir.name}/draft.md`);
            } catch { /* treat as no draft */ }
            try {
              hasNotes = await window.novelEngine.files.exists(activeSlug, `chapters/${dir.name}/notes.md`);
            } catch { /* treat as no notes */ }
            return { slug: dir.name, number, title, wordCount: wordCountMap.get(dir.name) ?? 0, hasDraft, hasNotes, hasUserEdits: editedSet.has(dir.name), kind };
          }),
        );

        infos.sort((a, b) => {
          const kindDiff = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
          return kindDiff !== 0 ? kindDiff : a.number - b.number;
        });

        if (!cancelled) {
          setChapters(infos);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setChapters([]);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSlug, revision]);

  return { chapters, loading };
}

// ── Rail ──────────────────────────────────────────────────────────────────────

type ChapterRailProps = {
  activeSlug: string;
  chapters: ChapterInfo[];
  loading: boolean;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onOpenNotes: (slug: string) => void;
  onDeepDive: (slug: string) => void;
  isDeepDiving: boolean;
};

function ChapterRow({
  chapter,
  isSelected,
  onSelect,
  onOpenNotes,
  onDeepDive,
  isDeepDiving,
  onRequestDelete,
}: {
  chapter: ChapterInfo;
  isSelected: boolean;
  onSelect: () => void;
  onOpenNotes: () => void;
  onDeepDive: () => void;
  isDeepDiving: boolean;
  onRequestDelete: (e: React.MouseEvent) => void;
}): React.ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const isCopyright = chapter.kind === 'copyright';

  return (
    <div className="group relative">
      <button
        onClick={onSelect}
        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
          isSelected ? 'bg-ne-brass-dim' : 'hover:bg-ne-bg1'
        }`}
      >
        <span
          className={`w-5 shrink-0 text-right font-ne-serif text-sm ${
            isSelected ? 'text-ne-brass-hi' : 'text-ne-ink-faint'
          }`}
        >
          {chapter.kind === 'backmatter' ? `z${chapter.number}` : chapter.number}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[12.5px] font-medium ${
              isSelected ? 'text-ne-ink' : 'text-ne-ink-dim'
            }`}
          >
            {chapter.title}
          </span>
          <span className="block text-[10.5px] tabular-nums text-ne-ink-faint">
            {chapter.wordCount > 0 ? `${chapter.wordCount.toLocaleString()} words` : '—'}
          </span>
        </span>
        {isCopyright ? (
          <span className="shrink-0 rounded border border-ne-line px-1.5 py-0.5 text-[9px] font-bold tracking-[0.06em] text-ne-ink-faint">
            AUTO
          </span>
        ) : chapter.hasDraft && chapter.hasUserEdits ? (
          <span className="shrink-0 rounded border border-ne-brass/40 bg-ne-brass/15 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.06em] text-ne-brass">
            EDITED
          </span>
        ) : chapter.hasDraft ? (
          <span className="shrink-0 rounded border border-ne-spark/30 bg-ne-spark/15 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.06em] text-ne-spark">
            DRAFT
          </span>
        ) : (
          <span className="shrink-0 rounded border border-ne-line px-1.5 py-0.5 text-[9px] font-bold tracking-[0.06em] text-ne-ink-faint">
            EMPTY
          </span>
        )}
      </button>

      {/* Context menu trigger — hover reveal (copyright is display-only) */}
      {!isCopyright && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
          title="Chapter actions"
          className="absolute right-1.5 top-1.5 rounded p-0.5 text-ne-ink-faint opacity-0 transition-opacity hover:text-ne-ink group-hover:opacity-100"
        >
          <Icon name="chevronDown" size={12} strokeWidth={2} />
        </button>
      )}

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-1 top-7 z-40 w-44 rounded-lg border border-ne-line bg-ne-bg1 py-1 shadow-xl">
            <button
              onClick={() => {
                setMenuOpen(false);
                onOpenNotes();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ne-ink-dim hover:bg-ne-bg2 hover:text-ne-ink"
            >
              <Icon name="pencil" size={11} strokeWidth={2} />
              {chapter.hasNotes ? 'Notes' : 'Notes (new)'}
            </button>
            {chapter.kind === 'body' && chapter.hasDraft && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onDeepDive();
                }}
                disabled={isDeepDiving}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ne-ink-dim hover:bg-ne-bg2 hover:text-ne-ink disabled:opacity-50"
              >
                <Icon name="sparkles" size={11} strokeWidth={2} />
                {isDeepDiving ? 'Deep Dive…' : 'Deep Dive (Lumen)'}
              </button>
            )}
            <div className="my-1 border-t border-ne-line-soft" />
            <button
              onClick={(e) => {
                setMenuOpen(false);
                onRequestDelete(e);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ne-sable hover:bg-ne-bg2"
            >
              <Icon name="x" size={11} strokeWidth={2} />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * ~236px manuscript chapter rail: front matter / story chapters / back matter
 * with the legacy ChaptersPanel management (add back matter, delete, notes,
 * Deep Dive) folded into a per-row context menu.
 */
export function ChapterRail({
  activeSlug,
  chapters,
  loading,
  selectedSlug,
  onSelect,
  onOpenNotes,
  onDeepDive,
  isDeepDiving,
}: ChapterRailProps): React.ReactElement {
  const notifyChange = useFileChangeStore((s) => s.notifyChange);

  const [addingBackMatter, setAddingBackMatter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [addingInProgress, setAddingInProgress] = useState(false);

  const { pendingDelete, deleting, requestDelete, confirmDelete, cancelDelete } =
    useDeleteFile(activeSlug, notifyChange);

  const frontMatter = useMemo(
    () => chapters.filter((c) => c.kind === 'copyright' || c.kind === 'dedication'),
    [chapters],
  );
  const bodyChapters = useMemo(() => chapters.filter((c) => c.kind === 'body'), [chapters]);
  const backMatter = useMemo(() => chapters.filter((c) => c.kind === 'backmatter'), [chapters]);

  const handleAddBackMatterChapter = async (): Promise<void> => {
    const title = newChapterTitle.trim();
    if (!title || addingInProgress) return;

    setAddingInProgress(true);
    try {
      const maxNum = backMatter.reduce((max, ch) => Math.max(max, ch.number), -1);
      const nextNum = maxNum + 1;
      const slug = slugify(title) || `chapter-${nextNum}`;
      const folderName = `z${nextNum}-${slug}`;

      await window.novelEngine.files.write(activeSlug, `chapters/${folderName}/draft.md`, `# ${title}\n\n`);

      setNewChapterTitle('');
      setAddingBackMatter(false);
      notifyChange();
      onSelect(folderName);
    } catch (err) {
      console.error('[ChapterRail] Failed to create back matter chapter:', err);
    } finally {
      setAddingInProgress(false);
    }
  };

  const requestChapterDelete = (chapter: ChapterInfo, e: React.MouseEvent): void => {
    const extraWarning =
      chapter.kind === 'body' && chapter.hasDraft
        ? 'This is a Verity-authored draft. Deleting it will require re-generation via chat.'
        : undefined;
    requestDelete(
      { path: `chapters/${chapter.slug}`, name: chapter.title, isDirectory: true, extraWarning },
      e,
    );
  };

  const renderRow = (chapter: ChapterInfo): React.ReactElement => (
    <ChapterRow
      key={chapter.slug}
      chapter={chapter}
      isSelected={chapter.slug === selectedSlug}
      onSelect={() => onSelect(chapter.slug)}
      onOpenNotes={() => onOpenNotes(chapter.slug)}
      onDeepDive={() => onDeepDive(chapter.slug)}
      isDeepDiving={isDeepDiving}
      onRequestDelete={(e) => requestChapterDelete(chapter, e)}
    />
  );

  const sectionHeader = (label: string): React.ReactElement => (
    <div className="px-2.5 pb-1 pt-4 text-[9.5px] font-bold tracking-[0.13em] text-ne-ink-faint first:pt-1">
      {label}
    </div>
  );

  return (
    <aside className="flex w-[236px] shrink-0 flex-col border-r border-ne-line bg-ne-bg0">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="space-y-2 px-1 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-md bg-ne-bg1" />
            ))}
          </div>
        ) : chapters.length === 0 ? (
          <div className="px-3 pt-6 text-center text-xs text-ne-ink-faint">
            Chapters appear here as Verity writes the first draft.
          </div>
        ) : (
          <>
            {frontMatter.length > 0 && (
              <>
                {sectionHeader('FRONT MATTER')}
                {frontMatter.map(renderRow)}
              </>
            )}
            {sectionHeader('STORY CHAPTERS')}
            {bodyChapters.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-ne-ink-faint">No story chapters yet.</div>
            ) : (
              bodyChapters.map(renderRow)
            )}
            {sectionHeader('BACK MATTER')}
            {backMatter.map(renderRow)}
            {addingBackMatter ? (
              <div className="mt-1 flex items-center gap-1.5 rounded-md border border-ne-line bg-ne-bg1 px-2 py-1.5">
                <input
                  type="text"
                  value={newChapterTitle}
                  onChange={(e) => setNewChapterTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleAddBackMatterChapter();
                    if (e.key === 'Escape') {
                      setAddingBackMatter(false);
                      setNewChapterTitle('');
                    }
                  }}
                  placeholder="Chapter title"
                  className="min-w-0 flex-1 bg-transparent text-xs text-ne-ink outline-none placeholder:text-ne-ink-faint"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
                <button
                  onClick={() => void handleAddBackMatterChapter()}
                  disabled={!newChapterTitle.trim() || addingInProgress}
                  className="shrink-0 rounded bg-gradient-to-b from-ne-brass-hi to-ne-brass px-2 py-0.5 text-[10px] font-semibold text-ne-bg0 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {addingInProgress ? '…' : 'Add'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingBackMatter(true)}
                className="mt-1 flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] text-ne-ink-faint transition-colors hover:bg-ne-bg1 hover:text-ne-ink-dim"
              >
                <Icon name="plus" size={11} strokeWidth={2} />
                Add back matter
              </button>
            )}
          </>
        )}
      </div>

      {pendingDelete && (
        <DeleteConfirmModal
          name={pendingDelete.name}
          isDirectory={pendingDelete.isDirectory}
          deleting={deleting}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
          extraWarning={pendingDelete.extraWarning}
        />
      )}
    </aside>
  );
}
