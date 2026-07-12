import { useEffect, useState } from 'react';
import { useQueryStore } from '../../stores/queryStore';

export function LetterPreview({
  bookSlug,
  targetSlug,
  onClose,
}: {
  bookSlug: string;
  targetSlug: string;
  onClose: () => void;
}): React.ReactElement {
  const readLetter = useQueryStore((s) => s.readLetter);
  const saveLetter = useQueryStore((s) => s.saveLetter);
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    readLetter(bookSlug, targetSlug)
      .then((text) => { setContent(text); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bookSlug, targetSlug, readLetter]);

  const handleSave = async (): Promise<void> => {
    await saveLetter(bookSlug, targetSlug, content);
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-[13px] border border-ne-line bg-ne-bg1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ne-line px-5 py-3">
          <h2 className="font-ne-serif text-base text-ne-ink">Query Letter — {targetSlug}</h2>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={handleSave} className="rounded-lg bg-ne-brass px-3 py-1.5 text-xs font-medium text-ne-bg0">
                  Save
                </button>
                <button onClick={() => setEditing(false)} className="rounded-lg border border-ne-line px-3 py-1.5 text-xs text-ne-ink-dim">
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="rounded-lg border border-ne-line px-3 py-1.5 text-xs text-ne-ink-dim hover:bg-ne-bg2">
                Edit
              </button>
            )}
            <button onClick={onClose} className="rounded-lg border border-ne-line px-3 py-1.5 text-xs text-ne-ink-dim hover:bg-ne-bg2">
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-sm text-ne-ink-faint">Loading…</p>
          ) : editing ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="h-full min-h-[300px] w-full resize-none rounded-md border border-ne-line bg-ne-bg0 px-4 py-3 font-mono text-sm text-ne-ink focus:outline-none focus:border-ne-brass"
            />
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-ne-ink-dim">
              {content}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}