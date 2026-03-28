import { useEffect, useState, useCallback } from 'react';
import { useVersionStore } from '../../stores/versionStore';
import { DiffViewer } from './DiffViewer';
import type { FileVersionSummary, FileVersionSource } from '@domain/types';

type VersionHistoryPanelProps = {
  bookSlug: string;
  filePath: string;
  onClose: () => void;
  /** Called after a successful revert so parent can reload file content */
  onReverted?: () => void;
};

const SOURCE_LABELS: Record<FileVersionSource, { label: string; className: string }> = {
  user: { label: 'You', className: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  agent: { label: 'Agent', className: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  revert: { label: 'Revert', className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
};

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHr = Math.floor(diffMs / 3_600_000);
    const diffDay = Math.floor(diffMs / 86_400_000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    }) + ' ' + date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function VersionEntry({
  version,
  isSelected,
  onSelect,
  onRevert,
}: {
  version: FileVersionSummary;
  isSelected: boolean;
  onSelect: () => void;
  onRevert: () => void;
}): React.ReactElement {
  const [showConfirm, setShowConfirm] = useState(false);
  const sourceInfo = SOURCE_LABELS[version.source];

  return (
    <div
      className={`border-l-2 pl-3 py-2 cursor-pointer transition-colors ${
        isSelected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`px-1.5 py-0.5 text-[10px] rounded border ${sourceInfo.className}`}>
            {sourceInfo.label}
          </span>
          <span className="text-xs text-zinc-400 truncate">
            {formatTimestamp(version.createdAt)}
          </span>
        </div>
        <span className="text-[10px] text-zinc-600 shrink-0">
          {formatBytes(version.byteSize)}
        </span>
      </div>

      {/* Revert button — only show when selected */}
      {isSelected && !showConfirm && (
        <button
          className="mt-2 px-2 py-1 text-xs bg-amber-600/20 text-amber-300 border border-amber-600/30 rounded hover:bg-amber-600/30 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setShowConfirm(true);
          }}
        >
          Revert to this version
        </button>
      )}

      {/* Confirmation */}
      {isSelected && showConfirm && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-amber-300">Are you sure?</span>
          <button
            className="px-2 py-0.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-500 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setShowConfirm(false);
              onRevert();
            }}
          >
            Yes, revert
          </button>
          <button
            className="px-2 py-0.5 text-xs bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setShowConfirm(false);
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function VersionHistoryPanel({
  bookSlug,
  filePath,
  onClose,
  onReverted,
}: VersionHistoryPanelProps): React.ReactElement {
  const {
    versions,
    totalCount,
    isLoading,
    selectedVersionId,
    diff,
    isDiffLoading,
    error,
    loadHistory,
    loadMoreHistory,
    selectVersion,
    revertToVersion,
    reset,
  } = useVersionStore();

  // Load history when panel opens or file changes
  useEffect(() => {
    loadHistory(bookSlug, filePath);
    return () => reset();
  }, [bookSlug, filePath, loadHistory, reset]);

  const handleRevert = useCallback(async (versionId: number) => {
    await revertToVersion(versionId);
    onReverted?.();
  }, [revertToVersion, onReverted]);

  const fileName = filePath.split('/').pop() ?? filePath;

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-l border-zinc-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-zinc-100 truncate">Version History</h3>
          <p className="text-xs text-zinc-500 truncate">{fileName}</p>
        </div>
        <button
          className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
          onClick={onClose}
          title="Close history"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-700/50 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Content area: version list + diff */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Version timeline */}
        <div className="overflow-auto flex-shrink-0 max-h-[40%] border-b border-zinc-700">
          {isLoading && versions.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-zinc-500 text-sm">
              Loading history...
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-500 text-sm text-center px-4">
              <p>No version history yet.</p>
              <p className="text-xs mt-1">Versions are created when files are saved or modified by agents.</p>
            </div>
          ) : (
            <div className="p-3 space-y-1">
              <div className="text-[10px] text-zinc-600 mb-2">
                {totalCount} version{totalCount !== 1 ? 's' : ''}
              </div>
              {versions.map((v) => (
                <VersionEntry
                  key={v.id}
                  version={v}
                  isSelected={selectedVersionId === v.id}
                  onSelect={() => selectVersion(v.id)}
                  onRevert={() => handleRevert(v.id)}
                />
              ))}
              {versions.length < totalCount && (
                <button
                  className="w-full py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  onClick={loadMoreHistory}
                  disabled={isLoading}
                >
                  {isLoading ? 'Loading...' : `Load more (${totalCount - versions.length} remaining)`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Diff viewer */}
        <div className="flex-1 overflow-auto p-3">
          {isDiffLoading ? (
            <div className="flex items-center justify-center py-8 text-zinc-500 text-sm">
              Computing diff...
            </div>
          ) : diff ? (
            <DiffViewer diff={diff} />
          ) : selectedVersionId ? (
            <div className="flex items-center justify-center py-8 text-zinc-500 text-sm">
              Loading...
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-zinc-500 text-sm">
              Select a version from the timeline above to view its changes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
