import { useEffect, useRef, useState } from 'react';
import type { ManuscriptAssembly } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { usePaletteStore } from '../../stores/paletteStore';
import { useViewStore } from '../../stores/viewStore';
import { useChapterDeepDive } from '../../hooks/useChapterDeepDive';
import { FileEditor } from '../Files/FileEditor';
import { FindReplaceModal } from '../Files/FindReplaceModal';
import { Icon } from '../common/Icon';
import { ProseViewer, useBookFile } from '../common/ProseViewer';
import { ChapterRail, useChapterList } from './ChapterRail';
import { UserEditsDiffModal } from './UserEditsDiffModal';

/** Verity-authored chapter drafts (body chapters 02+) get tracked-edit UI: every change is versioned and surfaced to Verity. */
function isVerityDraft(path: string): boolean {
  const match = path.match(/^chapters\/(\d+)-[^/]+\/draft\.md$/);
  return match !== null && parseInt(match[1], 10) >= 2;
}

type ReaderScope = 'chapter' | 'book';
type Mode = 'reader' | 'editor';

// ── Palette registrations (S04 registry) ─────────────────────────────────────

let openFindReplaceFromPalette: (() => void) | null = null;
let openFullBookFromPalette: (() => void) | null = null;

const hasActiveBook = (): boolean => useBookStore.getState().activeSlug !== '';

usePaletteStore.getState().registerItems([
  {
    id: 'action-find-replace',
    group: 'Actions',
    label: 'Find & Replace — across the manuscript',
    icon: 'search',
    keywords: ['find', 'replace', 'search'],
    enabled: hasActiveBook,
    run: () => {
      useViewStore.getState().navigate('manuscript');
      openFindReplaceFromPalette?.();
    },
  },
  {
    id: 'action-read-full-manuscript',
    group: 'Actions',
    label: 'Read full manuscript',
    icon: 'manuscript',
    keywords: ['reading', 'book', 'full'],
    enabled: hasActiveBook,
    run: () => {
      useViewStore.getState().navigate('manuscript', { manuscriptMode: 'reader' });
      openFullBookFromPalette?.();
    },
  },
]);

// ── Segmented control ─────────────────────────────────────────────────────────

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}): React.ReactElement {
  return (
    <div className="flex overflow-hidden rounded-[7px] border border-ne-line">
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => onChange(option.id)}
          className={`px-3 py-1 text-[11px] transition-colors ${
            option.id === value ? 'bg-ne-bg2 text-ne-ink' : 'text-ne-ink-faint hover:text-ne-ink-dim'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ── View ──────────────────────────────────────────────────────────────────────

/**
 * The Manuscript screen: chapter rail + Reader/Editor workbench. Merges the
 * legacy Reading Mode (full-book flow), the Files Chapters tab (management),
 * file editing with history, and Chapter Deep Dive into one surface.
 */
export function ManuscriptView(): React.ReactElement {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const { currentView, payload } = useViewStore();
  const { chapters, loading: chaptersLoading } = useChapterList(activeSlug);
  const { deepDive, isDeepDiving } = useChapterDeepDive(activeSlug);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('reader');
  const [scope, setScope] = useState<ReaderScope>('chapter');
  /** Editor file override (notes.md, Explorer "Edit" payloads); null = selected draft. */
  const [fileOverride, setFileOverride] = useState<string | null>(null);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showUserEdits, setShowUserEdits] = useState(false);

  const bookRef = useRef<HTMLDivElement>(null);

  // Palette actions land here while the view is mounted (always, via ViewContent).
  useEffect(() => {
    openFindReplaceFromPalette = () => setShowFindReplace(true);
    openFullBookFromPalette = () => {
      setMode('reader');
      setScope('book');
    };
    return () => {
      openFindReplaceFromPalette = null;
      openFullBookFromPalette = null;
    };
  }, []);

  // Book switch → reset local state.
  useEffect(() => {
    setSelectedSlug(null);
    setFileOverride(null);
    setScope('chapter');
    setShowFindReplace(false);
    setShowUserEdits(false);
  }, [activeSlug]);

  // Deep links: chapterSlug / manuscriptMode / filePath (Explorer "Edit").
  useEffect(() => {
    if (currentView !== 'manuscript') return;
    if (payload.chapterSlug) {
      setSelectedSlug(payload.chapterSlug);
      setFileOverride(null);
      setScope('chapter');
    }
    if (payload.filePath) {
      setFileOverride(payload.filePath);
      const chapter = payload.filePath.match(/^chapters\/([^/]+)\//)?.[1];
      if (chapter) setSelectedSlug(chapter);
    }
    if (payload.manuscriptMode) setMode(payload.manuscriptMode);
  }, [currentView, payload]);

  // Default selection: first body chapter, else first row.
  useEffect(() => {
    if (chapters.length === 0) return;
    if (selectedSlug !== null && chapters.some((c) => c.slug === selectedSlug)) return;
    const firstBody = chapters.find((c) => c.kind === 'body');
    setSelectedSlug((firstBody ?? chapters[0]).slug);
    setFileOverride(null);
  }, [chapters, selectedSlug]);

  const selectedChapter = chapters.find((c) => c.slug === selectedSlug) ?? null;
  const bodyChapters = chapters.filter((c) => c.kind === 'body');
  const bodyWordCount = bodyChapters.reduce((sum, c) => sum + c.wordCount, 0);
  const bodyIndex = selectedChapter ? bodyChapters.findIndex((c) => c.slug === selectedChapter.slug) : -1;

  const draftPath = selectedSlug ? `chapters/${selectedSlug}/draft.md` : null;
  const editorPath = fileOverride ?? draftPath;

  // ── Reader (single chapter, live-refreshing) ───────────────────────────────
  const chapterFile = useBookFile(
    activeSlug,
    mode === 'reader' && scope === 'chapter' ? draftPath : null,
  );

  // ── Reader (full book) — ports ReadingModeView's assembly + tracking ───────
  const [assembly, setAssembly] = useState<ManuscriptAssembly | null>(null);
  const [assemblyError, setAssemblyError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'reader' || scope !== 'book' || !activeSlug) return;
    let cancelled = false;
    setAssembly(null);
    setAssemblyError(null);
    window.novelEngine.books
      .assembleManuscript(activeSlug)
      .then((result) => {
        if (!cancelled) setAssembly(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setAssemblyError(err instanceof Error ? err.message : 'Failed to load manuscript');
      });
    return () => {
      cancelled = true;
    };
  }, [mode, scope, activeSlug]);

  // Track reading progress via IntersectionObserver on chapter headings —
  // highlights the corresponding rail chapter while scrolling.
  useEffect(() => {
    if (mode !== 'reader' || scope !== 'book' || !assembly || !bookRef.current) return;
    const headings = bookRef.current.querySelectorAll<HTMLElement>('h1[data-chapter-index]');
    if (!headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const idx = parseInt((visible[0].target as HTMLElement).dataset.chapterIndex ?? '0', 10);
          const slug = assembly.chapters[idx]?.slug;
          if (slug) setSelectedSlug(slug);
        }
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [mode, scope, assembly]);

  const handleSelectChapter = (slug: string): void => {
    setSelectedSlug(slug);
    setFileOverride(null);
    if (mode === 'reader' && scope === 'book' && assembly) {
      const idx = assembly.chapters.findIndex((c) => c.slug === slug);
      if (idx >= 0) {
        bookRef.current
          ?.querySelector(`h1[data-chapter-index="${idx}"]`)
          ?.scrollIntoView({ block: 'start' });
      }
    }
  };

  const handleOpenNotes = (slug: string): void => {
    setSelectedSlug(slug);
    setFileOverride(`chapters/${slug}/notes.md`);
    setMode('editor');
  };

  // ── Editor content (loaded once per file — not revision-driven) ────────────
  const [editorContent, setEditorContent] = useState<string | null>(null);
  /** Bumped after a discard-revert to force the editor to reload from disk. */
  const [editorReloadKey, setEditorReloadKey] = useState(0);
  /** Tracked-edit UI for Verity drafts — editable, with every change versioned. */
  const isTrackedDraft = editorPath !== null && isVerityDraft(editorPath);

  useEffect(() => {
    if (mode !== 'editor' || !editorPath || !activeSlug) {
      setEditorContent(null);
      return;
    }
    let cancelled = false;
    window.novelEngine.files
      .read(activeSlug, editorPath)
      .then((content) => {
        if (!cancelled) setEditorContent(content);
      })
      .catch(() => {
        // Missing file (e.g. new notes.md) — start empty.
        if (!cancelled) setEditorContent('');
      });
    return () => {
      cancelled = true;
    };
    // editorReloadKey forces a reload from disk after a discard-revert
  }, [mode, editorPath, activeSlug, editorReloadKey]);

  if (!activeSlug) {
    return (
      <div className="flex h-full items-center justify-center bg-ne-bg0 text-sm text-ne-ink-faint">
        Select a book in the Library to read its manuscript
      </div>
    );
  }

  // Full-book HTML: chapter H1s carry data-chapter-index for the observer.
  const bookMarkdown = assembly
    ? assembly.content
        .split('\n\n---\n\n')
        .map((part, idx) =>
          part.replace(
            /^# .+/m,
            `<h1 data-chapter-index="${idx}">${assembly.chapters[idx]?.title ?? ''}</h1>`,
          ),
        )
        .join('\n\n---\n\n')
    : '';

  return (
    <div className="flex h-full min-h-0 bg-ne-bg0">
      <ChapterRail
        activeSlug={activeSlug}
        chapters={chapters}
        loading={chaptersLoading}
        selectedSlug={selectedSlug}
        onSelect={handleSelectChapter}
        onOpenNotes={handleOpenNotes}
        onDeepDive={(slug) => void deepDive(slug)}
        isDeepDiving={isDeepDiving}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center gap-3.5 border-b border-ne-line-soft px-5 py-2.5">
          <Segmented<Mode>
            options={[
              { id: 'reader', label: 'Reader' },
              { id: 'editor', label: 'Editor' },
            ]}
            value={mode}
            onChange={setMode}
          />
          {mode === 'reader' && (
            <Segmented<ReaderScope>
              options={[
                { id: 'chapter', label: 'Chapter' },
                { id: 'book', label: 'Full book' },
              ]}
              value={scope}
              onChange={setScope}
            />
          )}
          <span className="ml-auto text-[11px] tabular-nums text-ne-ink-faint">
            {bodyIndex >= 0
              ? `Chapter ${bodyIndex + 1} of ${bodyChapters.length}`
              : selectedChapter?.title ?? ''}
            {bodyWordCount > 0 && ` · ${bodyWordCount.toLocaleString()} words`}
          </span>
          <button
            onClick={() => setShowFindReplace(true)}
            title="Find & Replace"
            className="rounded-md border border-ne-line bg-ne-bg2 p-1.5 text-ne-ink-dim transition-colors hover:border-ne-brass/50 hover:text-ne-ink"
          >
            <Icon name="search" size={13} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        {mode === 'reader' && scope === 'chapter' && (
          <div className="min-h-0 flex-1 overflow-y-auto px-10 py-12 pb-24">
            {chapterFile.error || !selectedChapter?.hasDraft ? (
              <div className="pt-8 text-center text-sm text-ne-ink-faint">
                No draft yet{selectedChapter ? ` for ${selectedChapter.title}` : ''}.
              </div>
            ) : chapterFile.loading ? (
              <div className="pt-8 text-center text-sm text-ne-ink-faint">Loading…</div>
            ) : (
              <>
                {selectedChapter?.kind === 'body' && (
                  <div className="mx-auto mb-3 max-w-[68ch] font-ne-ui text-[13px] font-semibold uppercase tracking-[0.1em] text-ne-brass">
                    Chapter {selectedChapter.number}
                  </div>
                )}
                <ProseViewer content={chapterFile.content} wide />
              </>
            )}
          </div>
        )}

        {mode === 'reader' && scope === 'book' && (
          <div ref={bookRef} className="min-h-0 flex-1 overflow-y-auto px-10 py-12 pb-24">
            {assemblyError ? (
              <div className="pt-8 text-center text-sm text-ne-ink-faint">{assemblyError}</div>
            ) : !assembly ? (
              <div className="pt-8 text-center text-sm text-ne-ink-faint">Assembling manuscript…</div>
            ) : assembly.chapterCount === 0 ? (
              <div className="pt-8 text-center text-sm text-ne-ink-faint">No chapter drafts found yet.</div>
            ) : (
              <ProseViewer content={bookMarkdown} wide />
            )}
          </div>
        )}

        {mode === 'editor' && (
          <div className="flex min-h-0 flex-1 flex-col">
            {isTrackedDraft && editorPath && (
              <div className="flex shrink-0 items-center gap-2 border-b border-ne-spark/30 bg-ne-spark/10 px-6 py-2">
                <p className="min-w-0 flex-1 text-xs text-ne-ink-dim">
                  <strong className="text-ne-ink">You're editing Verity's draft.</strong>{' '}
                  Every change is tracked and shared with Verity on her next revision.
                </p>
                <button
                  onClick={() => setShowUserEdits(true)}
                  className="shrink-0 rounded-md border border-ne-line bg-ne-bg2 px-2.5 py-1 text-[11px] text-ne-ink-dim transition-colors hover:border-ne-brass/50 hover:text-ne-ink"
                >
                  View my changes
                </button>
              </div>
            )}
            {editorPath && editorContent !== null ? (
              <FileEditor
                key={`${editorPath}:${editorReloadKey}`}
                filePath={editorPath}
                initialContent={editorContent}
                onSave={async (newContent) => {
                  await window.novelEngine.files.write(activeSlug, editorPath, newContent);
                }}
                onClose={() => {
                  setFileOverride(null);
                  setMode('reader');
                }}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-ne-ink-faint">
                {editorPath ? 'Loading…' : 'Select a chapter to edit'}
              </div>
            )}
          </div>
        )}
      </div>

      {showFindReplace && <FindReplaceModal onClose={() => setShowFindReplace(false)} />}
      {showUserEdits && isTrackedDraft && editorPath && (
        <UserEditsDiffModal
          bookSlug={activeSlug}
          filePath={editorPath}
          chapterTitle={selectedChapter?.title ?? selectedSlug ?? ''}
          onClose={() => setShowUserEdits(false)}
          onReverted={() => setEditorReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
