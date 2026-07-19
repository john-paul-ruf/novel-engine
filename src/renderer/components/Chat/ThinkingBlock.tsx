import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { useSettingsStore } from '../../stores/settingsStore';

marked.setOptions({ breaks: true, gfm: true });

type ThinkingBlockProps = {
  content: string;
  isStreaming: boolean;
  tokenEstimate?: number;
};

export function ThinkingBlock({
  content,
  isStreaming,
  tokenEstimate,
}: ThinkingBlockProps): React.ReactElement {
  const autoCollapseThinking = useSettingsStore(
    (s) => s.settings?.autoCollapseThinking ?? true
  );

  // Determine initial expanded state:
  // - Streaming messages: always start expanded (user is watching live)
  // - Persisted messages: respect the autoCollapseThinking setting.
  //   Previously this was `useState(isStreaming)`, which ALWAYS collapsed
  //   persisted thinking blocks — making it look like thinking was "gone"
  //   even when autoCollapseThinking was false.
  const [expanded, setExpanded] = useState(isStreaming || !autoCollapseThinking);
  // Previous streaming state lives in a ref, NOT state: a setState here would
  // re-render, re-run the effect below via its dep change, and its cleanup
  // would cancel the pending auto-collapse timer before it could fire.
  const prevStreamingRef = useRef(isStreaming);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Expand when streaming starts; auto-collapse 1.5s after it ends in place.
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;
    if (isStreaming && !wasStreaming) {
      setExpanded(true);
    }
    if (!isStreaming && wasStreaming && autoCollapseThinking) {
      const timer = setTimeout(() => setExpanded(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, autoCollapseThinking]);

  // Auto-scroll within thinking panel while streaming
  useEffect(() => {
    if (isStreaming && expanded && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [content, isStreaming, expanded]);

  // Only parse markdown when content changes — avoids re-parsing on every render
  // caused by parent re-renders or state changes (expanded toggle, scroll, etc.)
  const renderedHtml = useMemo(
    () => (content ? String(marked.parse(content)) : ''),
    [content],
  );

  // When collapsed, show a brief preview of the thinking content so
  // the user knows there IS content behind the disclosure toggle.
  const previewSnippet = useMemo(() => {
    if (expanded || !content) return '';
    const plain = content.replace(/[#*_`~\[\]]/g, '').trim();
    return plain.length > 120 ? plain.slice(0, 120) + '…' : plain;
  }, [content, expanded]);

  return (
    <div className="mb-2 rounded-lg border border-amber-400/40 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-950/20">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left"
      >
        <span className="text-sm">🧠</span>

        <span className="flex-1 text-sm font-medium text-amber-800 dark:text-amber-300">
          {isStreaming ? 'Thinking...' : 'Agent Thinking'}
        </span>

        {isStreaming && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75 dark:bg-amber-400" />
            <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-400" />
          </span>
        )}

        {tokenEstimate !== undefined && tokenEstimate > 0 && (
          <span className="font-mono text-xs text-amber-600 dark:text-amber-400/60">
            ~{tokenEstimate.toLocaleString()} tokens
          </span>
        )}

        <span className="text-xs text-amber-600 dark:text-amber-400/60">
          {expanded ? '▼' : '▶'}
        </span>
      </button>

      {/* Preview snippet when collapsed — shows the user thinking content exists */}
      {!expanded && previewSnippet && (
        <div className="border-t border-amber-400/30 dark:border-amber-500/10 px-4 py-2">
          <p className="text-xs leading-relaxed text-amber-700/70 dark:text-amber-200/40 italic line-clamp-2">
            {previewSnippet}
          </p>
        </div>
      )}

      {expanded && (
        <div
          ref={bodyRef}
          className="max-h-64 overflow-y-auto border-t border-amber-400/30 dark:border-amber-500/10 px-4 py-3"
        >
          {renderedHtml ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none font-mono text-amber-900/80 dark:text-amber-200/70 prose-p:my-2.5 prose-p:leading-relaxed prose-headings:text-amber-900 dark:prose-headings:text-amber-200/80 prose-headings:mt-4 prose-headings:mb-2 prose-strong:text-amber-900 dark:prose-strong:text-amber-200/80 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-hr:my-4 prose-hr:border-amber-500/30 dark:prose-hr:border-amber-500/20 prose-code:text-amber-800 dark:prose-code:text-amber-200/80 prose-a:text-amber-700 dark:prose-a:text-amber-300/70"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          ) : (
            <div className="font-mono text-sm text-amber-700/60 dark:text-amber-200/40">
              Waiting for thinking output...
            </div>
          )}

          {isStreaming && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-amber-600/60 dark:bg-amber-400/60" />
          )}
        </div>
      )}
    </div>
  );
}
