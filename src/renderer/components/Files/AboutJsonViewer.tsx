import { useCallback, useEffect, useRef, useState } from 'react';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { useViewStore } from '../../stores/viewStore';
import type { BookMeta, BookStatus } from '@domain/types';

const ALL_STATUSES: BookStatus[] = [
  'scaffolded', 'outlining', 'first-draft', 'revision-1', 'revision-2', 'copy-edit', 'final', 'published',
];

const STATUS_COLORS: Record<BookStatus, string> = {
  scaffolded: 'bg-zinc-300 dark:bg-zinc-600 text-zinc-800 dark:text-zinc-200',
  outlining: 'bg-amber-700 text-amber-100',
  'first-draft': 'bg-blue-700 text-blue-100',
  'revision-1': 'bg-purple-700 text-purple-100',
  'revision-2': 'bg-purple-600 text-purple-100',
  'copy-edit': 'bg-cyan-700 text-cyan-100',
  final: 'bg-green-700 text-green-100',
  published: 'bg-green-600 text-green-100',
};

function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function InlineEditField({
  value,
  onSave,
  className,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  className: string;
  placeholder: string;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setEditValue(value); }, [value]);
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setEditValue(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') { setEditing(false); setEditValue(value); }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`${className} w-full rounded border border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 outline-none focus:border-blue-500`}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`${className} cursor-pointer rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800`}
      title="Click to edit"
    >
      {value || placeholder}
    </span>
  );
}

function StatusDropdown({
  value,
  onSave,
}: {
  value: BookStatus;
  onSave: (v: string) => void;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const statusClass = STATUS_COLORS[value] ?? 'bg-zinc-300 dark:bg-zinc-600 text-zinc-800 dark:text-zinc-200';

  useEffect(() => {
    if (editing && selectRef.current) selectRef.current.focus();
  }, [editing]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    setEditing(false);
    if (v !== value) onSave(v);
  };

  if (editing) {
    return (
      <select
        ref={selectRef}
        value={value}
        onChange={handleChange}
        onBlur={() => setEditing(false)}
        className="rounded border border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-800 dark:text-zinc-200 outline-none focus:border-blue-500"
      >
        {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium ${statusClass} hover:ring-2 hover:ring-blue-500/50`}
      title="Click to change status"
    >
      {value}
    </span>
  );
}

function CoverImageSection({
  coverSrc,
  hasCover,
  onUpload,
}: {
  coverSrc: string;
  hasCover: boolean;
  onUpload: () => void;
}): React.ReactElement {
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setImgError(false); }, [coverSrc]);

  if (!hasCover || imgError) {
    return (
      <button
        onClick={onUpload}
        className="flex h-[220px] w-[160px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 transition-colors hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
        <span className="text-sm">Upload Cover</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <img
        src={coverSrc}
        alt="Book cover"
        className="max-w-[200px] rounded-lg object-contain shadow-lg"
        onError={() => setImgError(true)}
      />
      <button
        onClick={onUpload}
        className="absolute bottom-2 right-2 rounded bg-zinc-100 dark:bg-zinc-800/80 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 backdrop-blur hover:bg-zinc-200 dark:hover:bg-zinc-700/80"
      >
        Change
      </button>
    </div>
  );
}

/**
 * Generic rendering for a single JSON value.
 * Arrays and objects render as a collapsed <details> block.
 */
function JsonValue({ fieldKey, value }: { fieldKey: string; value: unknown }): React.ReactElement {
  if (value === null || value === undefined) {
    return <span className="text-zinc-400 dark:text-zinc-500 italic text-sm">—</span>;
  }
  if (typeof value === 'object') {
    return (
      <details className="mt-0.5">
        <summary className="cursor-pointer text-xs text-zinc-500 dark:text-zinc-400 select-none">
          {Array.isArray(value) ? `[${(value as unknown[]).length} items]` : '{…}'}
        </summary>
        <pre className="mt-1 whitespace-pre-wrap rounded bg-zinc-100 dark:bg-zinc-800 p-2 font-mono text-xs text-zinc-700 dark:text-zinc-300">
          {JSON.stringify(value, null, 2)}
        </pre>
      </details>
    );
  }
  if (fieldKey === 'created' || fieldKey === 'updatedAt') {
    const d = new Date(String(value));
    const formatted = !isNaN(d.getTime())
      ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : String(value);
    return <span className="text-sm text-zinc-700 dark:text-zinc-300">{formatted}</span>;
  }
  return <span className="text-sm text-zinc-700 dark:text-zinc-300">{String(value)}</span>;
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

const SPARK_METADATA_PROMPT =
  'Read about.json and enrich the book metadata — add any additional fields that would be useful for tracking this project. Write the updated about.json back to disk.';

const PRIORITY_KEYS = ['title', 'author', 'status', 'created', 'coverImage', 'slug'];

export function AboutJsonViewer({
  bookSlug,
  onEdit,
  onOpenSpark,
}: {
  bookSlug: string;
  onEdit: () => void;
  onOpenSpark: () => void;
}): React.ReactElement {
  const { loadBooks } = useBookStore();
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [coverTimestamp, setCoverTimestamp] = useState(Date.now());

  // Load the file on mount / when bookSlug changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.novelEngine.files
      .read(bookSlug, 'about.json')
      .then((text) => { if (!cancelled) { setRawContent(text); setLoading(false); } })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load about.json');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [bookSlug]);

  const handleSaveField = useCallback(
    async (field: string, value: string) => {
      setIsSaving(true);
      try {
        const updated = await window.novelEngine.books.updateMeta(bookSlug, { [field]: value });
        const nextSlug = updated.slug !== bookSlug ? updated.slug : bookSlug;
        if (updated.slug !== bookSlug) {
          const { setActiveBook } = useBookStore.getState();
          await setActiveBook(nextSlug);
        }
        await loadBooks();
        const refreshed = await window.novelEngine.files.read(nextSlug, 'about.json');
        setRawContent(refreshed);
      } catch (err) {
        console.error(`Failed to save ${field}:`, err);
      } finally {
        setIsSaving(false);
      }
    },
    [bookSlug, loadBooks],
  );

  const handleUploadCover = useCallback(async () => {
    try {
      const result = await window.novelEngine.books.uploadCover(bookSlug);
      if (result) {
        setCoverTimestamp(Date.now());
        await loadBooks();
      }
    } catch (err) {
      console.error('Failed to upload cover:', err);
    }
  }, [bookSlug, loadBooks]);

  // ── Loading / error states ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-sm text-zinc-500">Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-sm text-red-500">{error}</span>
      </div>
    );
  }

  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(rawContent ?? '{}') as Record<string, unknown>;
  } catch {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-sm text-red-400">Failed to parse about.json</span>
      </div>
    );
  }

  const typedMeta = meta as Partial<BookMeta>;
  const coverSrc = `novel-asset://cover/${bookSlug}?t=${coverTimestamp}`;
  const parsedDate = typedMeta.created ? new Date(typedMeta.created) : null;
  const createdDate =
    parsedDate && !isNaN(parsedDate.getTime())
      ? parsedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : null;

  // Extra keys not handled by the structured card (generic rendering)
  const extraKeys = Object.keys(meta).filter((k) => !PRIORITY_KEYS.includes(k));

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Action header */}
      <div className="shrink-0 flex items-center justify-end gap-2 border-b border-zinc-200 dark:border-zinc-800 px-6 py-2">
        {isSaving && <span className="text-xs text-zinc-400">Saving…</span>}
        <button
          onClick={onEdit}
          className="rounded px-3 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          Edit JSON
        </button>
        <button
          onClick={onOpenSpark}
          className="flex items-center gap-1.5 rounded px-3 py-1 text-xs bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
          </svg>
          Chat with Spark
        </button>
      </div>

      {/* Card body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-6">

          {/* Cover */}
          <div className="mb-6 flex flex-col items-center">
            <CoverImageSection
              coverSrc={coverSrc}
              hasCover={!!typedMeta.coverImage}
              onUpload={handleUploadCover}
            />
          </div>

          {/* Title */}
          <div className="mb-2">
            <InlineEditField
              value={typedMeta.title ?? ''}
              onSave={(v) => handleSaveField('title', v)}
              className="text-2xl font-bold text-zinc-900 dark:text-zinc-100"
              placeholder="Book Title"
            />
          </div>

          {/* Author */}
          <div className="mb-4">
            <InlineEditField
              value={typedMeta.author ?? ''}
              onSave={(v) => handleSaveField('author', v)}
              className="text-lg text-zinc-700 dark:text-zinc-300"
              placeholder="Author Name"
            />
          </div>

          {/* Status + Created */}
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            {typedMeta.status && (
              <StatusDropdown
                value={typedMeta.status}
                onSave={(v) => handleSaveField('status', v)}
              />
            )}
            {createdDate && (
              <span className="text-sm text-zinc-500">Created {createdDate}</span>
            )}
          </div>

          {/* Slug (read-only) */}
          <div className="mb-4 text-xs text-zinc-400 dark:text-zinc-600 font-mono">
            {bookSlug}
          </div>

          {/* Extra / unknown fields — generic rendering */}
          {extraKeys.length > 0 && (
            <div className="mt-4 border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-2">
              {extraKeys.map((key) => (
                <div key={key} className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    {formatKey(key)}
                  </span>
                  <JsonValue fieldKey={key} value={meta[key]} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Hook — call from FilesView to build onOpenSpark
// ────────────────────────────────────────────────────────────────────────────

export function useOpenSpark(bookSlug: string): () => Promise<void> {
  const { navigate } = useViewStore();
  return useCallback(async () => {
    const { createConversation, sendMessage } = useChatStore.getState();
    await createConversation('Spark', bookSlug, null, 'pipeline');
    navigate('chat');
    // Brief yield so ChatView mounts and reads the active conversation before we stream
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    await sendMessage(SPARK_METADATA_PROMPT);
  }, [bookSlug, navigate]);
}
