import type { FileViewMode } from '../../stores/viewStore';

type FilesHeaderProps = {
  viewMode: FileViewMode;
  filePath: string | null;
  browserPath: string;
  onModeChange: (mode: FileViewMode) => void;
  onBrowse: (dirPath: string) => void;
  onBackToBrowser: () => void;
  onEdit?: () => void;
};

function BreadcrumbSegments({
  segments,
  onNavigate,
}: {
  segments: { label: string; path: string; clickable: boolean }[];
  onNavigate: (path: string) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-zinc-400 dark:text-zinc-600">/</span>}
          {seg.clickable ? (
            <button
              onClick={() => onNavigate(seg.path)}
              className="rounded px-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
            >
              {seg.label}
            </button>
          ) : (
            <span className="text-zinc-800 dark:text-zinc-200 font-medium px-1 py-0.5">{seg.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function buildBrowserBreadcrumbs(browserPath: string): { label: string; path: string; clickable: boolean }[] {
  const segments: { label: string; path: string; clickable: boolean }[] = [];

  if (!browserPath) {
    // At root — show non-clickable root icon (already here)
    segments.push({ label: '📁', path: '', clickable: false });
    return segments;
  }

  // Root is clickable when we're in a subdirectory
  segments.push({ label: '📁', path: '', clickable: true });

  const parts = browserPath.split('/').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const path = parts.slice(0, i + 1).join('/');
    const isLast = i === parts.length - 1;
    segments.push({ label: parts[i], path, clickable: !isLast });
  }

  return segments;
}

function buildFileBreadcrumbs(filePath: string): { label: string; path: string; clickable: boolean }[] {
  const segments: { label: string; path: string; clickable: boolean }[] = [
    { label: '📁', path: '', clickable: true },
  ];

  const parts = filePath.split('/').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const path = parts.slice(0, i + 1).join('/');
    const isLast = i === parts.length - 1;
    segments.push({ label: parts[i], path, clickable: !isLast });
  }

  return segments;
}

export function FilesHeader({
  viewMode,
  filePath,
  browserPath,
  onModeChange,
  onBrowse,
  onBackToBrowser,
  onEdit,
}: FilesHeaderProps): React.ReactElement {
  const breadcrumbs =
    viewMode === 'browser'
      ? buildBrowserBreadcrumbs(browserPath)
      : filePath
        ? buildFileBreadcrumbs(filePath)
        : buildBrowserBreadcrumbs('');

  const handleBreadcrumbNavigate = (path: string) => {
    onBrowse(path);
  };

  return (
    <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-6 py-2.5 flex items-center justify-between gap-4">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        {(viewMode === 'reader' || viewMode === 'editor') && (
          <button
            onClick={onBackToBrowser}
            className="shrink-0 rounded p-1 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
            title="Back to browser"
          >
            ←
          </button>
        )}
        <BreadcrumbSegments
          segments={breadcrumbs}
          onNavigate={handleBreadcrumbNavigate}
        />
      </div>

      {/* Right: Edit button + View mode switcher */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Edit button — only for .md files in reader/editor mode */}
        {filePath?.endsWith('.md') && (viewMode === 'reader' || viewMode === 'editor') && (
          <button
            onClick={viewMode === 'reader' ? onEdit : () => onModeChange('reader')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              viewMode === 'editor'
                ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
            title={viewMode === 'editor' ? 'Back to preview' : 'Edit file'}
          >
            {viewMode === 'editor' ? '👁 Preview' : '✏️ Edit'}
          </button>
        )}

        <div className="flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5">
          <button
            onClick={() => onModeChange('browser')}
            className={`rounded px-2.5 py-1 text-xs transition-colors ${
              viewMode === 'browser'
                ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
            title="Browse files"
          >
            ⊞
          </button>
          <button
            onClick={() => onModeChange('reader')}
            disabled={!filePath}
            className={`rounded px-2.5 py-1 text-xs transition-colors ${
              viewMode === 'reader' || viewMode === 'editor'
                ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
            title="Read file"
          >
            👁
          </button>
        </div>
      </div>
    </div>
  );
}
