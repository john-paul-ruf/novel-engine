import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import { useFileChangeStore } from '../../stores/fileChangeStore';

marked.setOptions({ async: false });

/** Literary typeset styling per the streamlined-workspace mock. */
const PROSE_CLASS = [
  'mx-auto max-w-[62ch] font-ne-serif text-[16.5px] leading-[1.78] text-ne-ink',
  '[&_p]:mb-4 [&_p]:indent-[1.4em] [&_p:first-of-type]:indent-0',
  '[&_h1]:mb-5 [&_h1]:text-[26px] [&_h1]:font-medium [&_h1]:leading-snug',
  '[&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:font-ne-ui [&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-[0.1em] [&_h2]:text-ne-ink-dim',
  '[&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-[19px] [&_h3]:font-medium',
  '[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1',
  '[&_blockquote]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-ne-brass/40 [&_blockquote]:pl-4 [&_blockquote]:text-ne-ink-dim',
  '[&_hr]:my-9 [&_hr]:border-ne-line',
  '[&_a]:text-ne-quill [&_a]:underline',
  '[&_code]:font-ne-mono [&_code]:text-[13px] [&_code]:text-ne-ink-dim',
  '[&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-ne-bg2 [&_pre]:p-3',
  '[&_table]:mb-4 [&_table]:w-full [&_table]:font-ne-ui [&_table]:text-[13px]',
  '[&_th]:border-b [&_th]:border-ne-line [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
  '[&_td]:border-b [&_td]:border-ne-line-soft [&_td]:px-2 [&_td]:py-1',
].join(' ');

type ProseViewerProps = {
  content: string;
  /** Render as raw monospace text (JSON, non-markdown files). */
  raw?: boolean;
};

/**
 * Shared typeset markdown renderer for the workspace (companion tabs,
 * SESSION-11 manuscript view). Callers own the scroll container.
 */
export function ProseViewer({ content, raw = false }: ProseViewerProps): React.ReactElement {
  if (raw) {
    return (
      <pre className="mx-auto max-w-[72ch] whitespace-pre-wrap font-ne-mono text-[12.5px] leading-relaxed text-ne-ink-dim">
        {content}
      </pre>
    );
  }
  const html = marked.parse(content) as string;
  return <div className={PROSE_CLASS} dangerouslySetInnerHTML={{ __html: html }} />;
}

type BookFileState = {
  content: string;
  loading: boolean;
  error: string | null;
};

/**
 * Read a book file and keep it live: re-reads whenever the file-change
 * revision bumps (agent writes), keeping the previous content on screen
 * while the refresh is in flight so streaming edits land without a flash.
 */
export function useBookFile(bookSlug: string, path: string | null): BookFileState {
  const revision = useFileChangeStore((s) => s.revision);
  const [state, setState] = useState<BookFileState>({ content: '', loading: false, error: null });
  const loadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!bookSlug || !path) {
      loadedKeyRef.current = null;
      setState({ content: '', loading: false, error: null });
      return;
    }

    let cancelled = false;
    const key = `${bookSlug}:${path}`;
    // Same file refreshing (revision bump) → keep content on screen.
    // Different file → clear immediately so stale prose never shows.
    setState((prev) =>
      loadedKeyRef.current === key
        ? { ...prev, loading: prev.content === '', error: null }
        : { content: '', loading: true, error: null },
    );
    loadedKeyRef.current = key;

    window.novelEngine.files
      .read(bookSlug, path)
      .then((content) => {
        if (!cancelled) setState({ content, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            content: '',
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to read file',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bookSlug, path, revision]);

  return state;
}
