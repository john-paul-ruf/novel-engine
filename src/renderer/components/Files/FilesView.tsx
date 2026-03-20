import { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import { useViewStore } from '../../stores/viewStore';
import { useBookStore } from '../../stores/bookStore';
import { FilesHeader } from './FilesHeader';
import { FileBrowser } from './FileBrowser';
import { FileEditor } from './FileEditor';
import { StructuredBrowser } from './StructuredBrowser';
import type { FileViewMode } from '../../stores/viewStore';
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
  const { payload, navigate } = useViewStore();
  const { activeSlug } = useBookStore();

  const viewMode: FileViewMode = payload.fileViewMode ?? (payload.filePath ? 'reader' : 'browser');
  const filePath = payload.filePath ?? null;
  const browserPath = payload.fileBrowserPath ?? '';

  // File content state (shared between reader and editor)
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load file when filePath changes (for reader/editor modes)
  useEffect(() => {
    if (!filePath || !activeSlug) {
      setContent('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    window.novelEngine.files
      .read(activeSlug, filePath)
      .then((result) => {
        if (!cancelled) {
          setContent(result);
          setLoading(false);
        }
      })
      .catch((err) => {
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

  // View mode handlers
  const handleBrowse = useCallback(
    (dirPath: string) => {
      navigate('files', { fileBrowserPath: dirPath, fileViewMode: 'browser' });
    },
    [navigate],
  );

  const handleFileSelect = useCallback(
    (path: string) => {
      navigate('files', { filePath: path, fileViewMode: 'reader' });
    },
    [navigate],
  );

  const handleEdit = useCallback(() => {
    navigate('files', { filePath: filePath ?? undefined, fileViewMode: 'editor' });
  }, [navigate, filePath]);

  const handleCloseEditor = useCallback(() => {
    navigate('files', { filePath: filePath ?? undefined, fileViewMode: 'reader' });
  }, [navigate, filePath]);

  const handleSave = useCallback(
    async (newContent: string) => {
      if (!activeSlug || !filePath) return;
      await window.novelEngine.files.write(activeSlug, filePath, newContent);
      setContent(newContent);
    },
    [activeSlug, filePath],
  );

  const handleFileEdit = useCallback(
    (path: string) => {
      navigate('files', { filePath: path, fileViewMode: 'editor' });
    },
    [navigate],
  );

  const handleBackToBrowser = useCallback(() => {
    const parentDir = filePath ? filePath.split('/').slice(0, -1).join('/') : '';
    navigate('files', { fileBrowserPath: parentDir, fileViewMode: 'browser' });
  }, [navigate, filePath]);

  const handleModeChange = useCallback(
    (mode: FileViewMode) => {
      if (mode === 'browser') {
        const parentDir = filePath ? filePath.split('/').slice(0, -1).join('/') : browserPath;
        navigate('files', { fileBrowserPath: parentDir, fileViewMode: 'browser' });
      } else if (mode === 'reader') {
        navigate('files', { filePath: filePath ?? undefined, fileViewMode: 'reader' });
      } else if (mode === 'editor') {
        navigate('files', { filePath: filePath ?? undefined, fileViewMode: 'editor' });
      }
    },
    [navigate, filePath, browserPath],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header with view mode switcher */}
      <FilesHeader
        viewMode={viewMode}
        filePath={filePath}
        browserPath={browserPath}
        onModeChange={handleModeChange}
        onBrowse={handleBrowse}
        onBackToBrowser={handleBackToBrowser}
        onEdit={handleEdit}
      />

      {/* Content area */}
      {viewMode === 'browser' && (
        browserPath ? (
          <FileBrowser
            currentPath={browserPath}
            onNavigate={handleBrowse}
            onFileSelect={handleFileSelect}
          />
        ) : (
          <StructuredBrowser
            activeSlug={activeSlug}
            onFileSelect={handleFileSelect}
            onFileEdit={handleFileEdit}
          />
        )
      )}

      {viewMode === 'reader' && (
        <ReaderContent
          filePath={filePath}
          content={content}
          loading={loading}
          error={error}
          activeSlug={activeSlug}
          onFileSelect={handleFileSelect}
          onClearFile={handleBackToBrowser}
        />
      )}

      {viewMode === 'editor' && filePath && (
        <FileEditor
          filePath={filePath}
          initialContent={content}
          onSave={handleSave}
          onClose={handleCloseEditor}
        />
      )}
    </div>
  );
}

/**
 * The reader content — extracted from the original FilesView for clarity.
 * Handles loading states, about.json card, markdown rendering, and raw content display.
 */
function ReaderContent({
  filePath,
  content,
  loading,
  error,
  activeSlug,
  onFileSelect,
  onClearFile,
}: {
  filePath: string | null;
  content: string;
  loading: boolean;
  error: string | null;
  activeSlug: string;
  onFileSelect: (path: string) => void;
  onClearFile: () => void;
}): React.ReactElement {
  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-zinc-500">Select a file to view</div>
      </div>
    );
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
          onClick={onClearFile}
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
    <>
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
    </>
  );
}

