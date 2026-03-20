import { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import { useViewStore } from '../../stores/viewStore';
import { useBookStore } from '../../stores/bookStore';
import type { BookMeta, BookStatus } from '@domain/types';

// Configure marked for safe rendering
marked.setOptions({ async: false });

const STATUS_COLORS: Record<BookStatus, string> = {
  scaffolded: 'bg-zinc-600 text-zinc-200',
  outlining: 'bg-amber-700 text-amber-100',
  'first-draft': 'bg-blue-700 text-blue-100',
  'revision-1': 'bg-purple-700 text-purple-100',
  'revision-2': 'bg-purple-600 text-purple-100',
  'copy-edit': 'bg-cyan-700 text-cyan-100',
  final: 'bg-green-700 text-green-100',
  published: 'bg-green-600 text-green-100',
};

const QUICK_ACCESS_FILES = [
  { path: 'source/voice-profile.md', label: 'Voice Profile', icon: '🎤' },
  { path: 'source/scene-outline.md', label: 'Scene Outline', icon: '📋' },
  { path: 'source/story-bible.md', label: 'Story Bible', icon: '📖' },
  { path: 'about.json', label: 'Book Info', icon: '📝' },
];

function Breadcrumb({ filePath }: { filePath: string }): React.ReactElement {
  const parts = filePath.split('/');
  return (
    <div className="flex items-center gap-1 text-sm text-zinc-400">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-zinc-600">/</span>}
          <span className={i === parts.length - 1 ? 'text-zinc-200 font-medium' : ''}>
            {part}
          </span>
        </span>
      ))}
    </div>
  );
}

function NoFileSelected({ onFileSelect }: { onFileSelect: (path: string) => void }): React.ReactElement {
  const { activeSlug } = useBookStore();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8">
      <div className="text-center">
        <div className="text-lg text-zinc-400">Select a file from the sidebar</div>
        <div className="mt-1 text-sm text-zinc-600">or choose a common file below</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {QUICK_ACCESS_FILES.map((file) => (
          <button
            key={file.path}
            onClick={() => onFileSelect(file.path)}
            disabled={!activeSlug}
            className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-2xl">{file.icon}</span>
            <div>
              <div className="text-sm font-medium text-zinc-200">{file.label}</div>
              <div className="text-xs text-zinc-500">{file.path}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function InlineEditField({
  value,
  onSave,
  className,
  placeholder,
}: {
  value: string;
  onSave: (newValue: string) => void;
  className: string;
  placeholder: string;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setEditValue(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditing(false);
      setEditValue(value);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`${className} w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 outline-none focus:border-blue-500`}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`${className} cursor-pointer rounded px-2 py-1 hover:bg-zinc-800`}
      title="Click to edit"
    >
      {value || placeholder}
    </span>
  );
}

function AboutJsonCard({
  content,
  activeSlug,
}: {
  content: string;
  activeSlug: string;
}): React.ReactElement {
  const { loadBooks } = useBookStore();
  const [isSaving, setIsSaving] = useState(false);
  const [coverTimestamp, setCoverTimestamp] = useState(Date.now());

  let meta: BookMeta;
  try {
    meta = JSON.parse(content) as BookMeta;
  } catch {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950 p-4 text-red-300">
        Failed to parse about.json
      </div>
    );
  }

  const handleSaveField = async (field: 'title' | 'author', value: string) => {
    setIsSaving(true);
    try {
      await window.novelEngine.books.updateMeta(activeSlug, { [field]: value });
      await loadBooks();
    } catch (error) {
      console.error(`Failed to save ${field}:`, error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadCover = async () => {
    try {
      const result = await window.novelEngine.books.uploadCover(activeSlug);
      if (result) {
        setCoverTimestamp(Date.now());
        await loadBooks();
      }
    } catch (error) {
      console.error('Failed to upload cover:', error);
    }
  };

  const statusClass = STATUS_COLORS[meta.status] ?? 'bg-zinc-600 text-zinc-200';
  const createdDate = new Date(meta.created).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const coverSrc = `novel-asset://cover/${activeSlug}?t=${coverTimestamp}`;

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      {isSaving && (
        <div className="mb-3 text-xs text-zinc-500">Saving...</div>
      )}

      {/* Cover Image */}
      <div className="mb-6 flex flex-col items-center">
        <CoverImageSection
          coverSrc={coverSrc}
          hasCover={!!meta.coverImage}
          onUpload={handleUploadCover}
        />
      </div>

      {/* Title */}
      <div className="mb-2">
        <InlineEditField
          value={meta.title}
          onSave={(v) => handleSaveField('title', v)}
          className="text-2xl font-bold text-zinc-100"
          placeholder="Book Title"
        />
      </div>

      {/* Author */}
      <div className="mb-4">
        <InlineEditField
          value={meta.author}
          onSave={(v) => handleSaveField('author', v)}
          className="text-lg text-zinc-300"
          placeholder="Author Name"
        />
      </div>

      {/* Status */}
      <div className="flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass}`}>
          {meta.status}
        </span>
        <span className="text-sm text-zinc-500">Created {createdDate}</span>
      </div>
    </div>
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

  useEffect(() => {
    setImgError(false);
  }, [coverSrc]);

  if (!hasCover || imgError) {
    return (
      <button
        onClick={onUpload}
        className="flex h-[220px] w-[160px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-700 text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-400"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
          />
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
        className="absolute bottom-2 right-2 rounded bg-zinc-800/80 px-2 py-1 text-xs text-zinc-300 backdrop-blur hover:bg-zinc-700/80"
      >
        Change
      </button>
    </div>
  );
}

function MarkdownViewer({ content }: { content: string }): React.ReactElement {
  const html = marked.parse(content) as string;
  return (
    <div
      className="prose prose-invert prose-zinc max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export function FilesView(): React.ReactElement {
  const { payload } = useViewStore();
  const { activeSlug } = useBookStore();
  const { navigate } = useViewStore();

  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Payload-driven navigation
  useEffect(() => {
    if (payload.filePath) {
      setFilePath(payload.filePath);
    }
  }, [payload.filePath]);

  // Load file content when path changes
  useEffect(() => {
    if (!filePath || !activeSlug) {
      setContent('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    window.novelEngine.files.read(activeSlug, filePath).then((result) => {
      if (!cancelled) {
        setContent(result);
        setLoading(false);
      }
    }).catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Failed to load file');
        setContent('');
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [filePath, activeSlug]);

  const handleQuickAccess = useCallback((path: string) => {
    navigate('files', { filePath: path });
  }, [navigate]);

  if (!filePath) {
    return <NoFileSelected onFileSelect={handleQuickAccess} />;
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <div className="text-red-400">Failed to load file</div>
        <div className="text-sm text-zinc-500">{error}</div>
        <button
          onClick={() => setFilePath(null)}
          className="mt-2 rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          Back
        </button>
      </div>
    );
  }

  const isAboutJson = filePath === 'about.json';
  const isMarkdown = filePath.endsWith('.md');

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-8 py-3">
        <Breadcrumb filePath={filePath} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isAboutJson ? (
          <AboutJsonCard content={content} activeSlug={activeSlug} />
        ) : isMarkdown ? (
          <MarkdownViewer content={content} />
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-sm text-zinc-300">{content}</pre>
        )}
      </div>

      {/* Footer — word count for markdown */}
      {isMarkdown && content && (
        <div className="shrink-0 border-t border-zinc-800 px-8 py-2 text-right text-xs text-zinc-500">
          {countWords(content).toLocaleString()} words
        </div>
      )}
    </div>
  );
}
