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
    window.novelEngine.books
      .assembleManuscript(activeSlug)
      .then((result) => {
        setAssembly(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load manuscript');
        setLoading(false);
      });
  }, [activeSlug]);

  // Track reading progress via IntersectionObserver on chapter headings
  useEffect(() => {
    if (!assembly || !contentRef.current) return;
    const headings = contentRef.current.querySelectorAll<HTMLElement>('h1[data-chapter-index]');
    if (!headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const idx = parseInt(
            (visible[0].target as HTMLElement).dataset.chapterIndex ?? '0',
            10,
          );
          setCurrentChapter(idx + 1);
        }
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [assembly]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-zinc-400">Assembling manuscript…</div>
      </div>
    );
  }

  if (error || !assembly) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-red-400">{error ?? 'No manuscript to display'}</p>
        <button
          onClick={() => navigate('build')}
          className="text-sm text-blue-500 hover:underline"
        >
          Back to Build
        </button>
      </div>
    );
  }

  if (assembly.chapterCount === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-zinc-400">No chapter drafts found yet.</p>
        <button
          onClick={() => navigate('build')}
          className="text-sm text-blue-500 hover:underline"
        >
          Back to Build
        </button>
      </div>
    );
  }

  // Build HTML: insert data-chapter-index on each chapter H1 for IntersectionObserver tracking
  const chapterParts = assembly.content.split('\n\n---\n\n');
  const indexedHtml = chapterParts
    .map((part, idx) =>
      part.replace(/^# .+/m, `<h1 data-chapter-index="${idx}">${assembly.chapters[idx]?.title ?? ''}</h1>`),
    )
    .join('\n\n<hr class="my-12 border-zinc-700">\n\n');

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-950">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-3">
        <button
          onClick={() => navigate('build')}
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
        >
          ← Exit Reading Mode
        </button>
        <span className="text-xs text-zinc-400">
          Chapter {currentChapter} of {assembly.chapterCount} —{' '}
          {assembly.wordCount.toLocaleString()} words
        </span>
      </div>

      {/* Reading content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        <div
          className="mx-auto max-w-2xl px-8 py-12 prose prose-zinc dark:prose-invert prose-lg prose-p:leading-relaxed prose-p:my-4 prose-hr:my-12 prose-hr:border-zinc-300 dark:prose-hr:border-zinc-700 prose-h1:mt-12 prose-h1:mb-6"
          dangerouslySetInnerHTML={{ __html: marked.parse(indexedHtml) as string }}
        />
      </div>
    </div>
  );
}