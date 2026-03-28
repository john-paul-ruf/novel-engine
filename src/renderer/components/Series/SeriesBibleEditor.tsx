import { useMemo } from 'react';

type SeriesBibleEditorProps = {
  content: string;
  dirty: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
};

export function SeriesBibleEditor({
  content,
  dirty,
  onChange,
  onSave,
}: SeriesBibleEditorProps): React.ReactElement {
  const stats = useMemo(() => {
    const chars = content.length;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    return { chars, words };
  }, [content]);

  return (
    <div className="flex flex-col h-full">
      <div className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
        This document is shared across all books in the series. Agents will reference it for cross-volume continuity.
      </div>

      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="# Series Bible&#10;&#10;Write your shared world details, character registries, timeline, and continuity notes here..."
        className="flex-1 min-h-[300px] w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 font-mono text-sm text-zinc-800 dark:text-zinc-300 placeholder-zinc-400 dark:placeholder-zinc-600 outline-none focus:border-blue-500 resize-none"
      />

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          {stats.words.toLocaleString()} words &middot; {stats.chars.toLocaleString()} chars
        </span>

        <button
          onClick={onSave}
          disabled={!dirty}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {dirty ? 'Save Bible' : 'Saved'}
        </button>
      </div>
    </div>
  );
}
