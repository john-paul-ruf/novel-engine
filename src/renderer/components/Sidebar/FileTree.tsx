import { useCallback, useEffect, useState } from 'react';
import type { FileEntry } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { useViewStore } from '../../stores/viewStore';
import { useFileChangeStore } from '../../stores/fileChangeStore';

const DEFAULT_EXPANDED = new Set(['source', 'chapters']);

function getFileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) return '📁';
  if (name.endsWith('.md')) return '📄';
  if (name.endsWith('.json')) return '⚙️';
  return '📎';
}

function isInDist(path: string): boolean {
  return path.startsWith('dist/') || path === 'dist';
}

function FileNode({
  entry,
  depth,
  expandedPaths,
  onToggle,
  onFileClick,
}: {
  entry: FileEntry;
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onFileClick: (entry: FileEntry) => void;
}): React.ReactElement {
  const isExpanded = expandedPaths.has(entry.path);
  const indent = depth * 12;

  if (entry.isDirectory) {
    return (
      <>
        <button
          onClick={() => onToggle(entry.path)}
          className="no-drag flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
          style={{ paddingLeft: `${indent + 4}px` }}
        >
          <span className="shrink-0 text-[10px] text-zinc-500">
            {isExpanded ? '▾' : '▸'}
          </span>
          <span className="shrink-0 text-xs">{getFileIcon(entry.name, true)}</span>
          <span className="truncate">{entry.name}/</span>
        </button>
        {isExpanded && entry.children && (
          <div>
            {entry.children.map((child) => (
              <FileNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
                onFileClick={onFileClick}
              />
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <button
      onClick={() => onFileClick(entry)}
      className="no-drag flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:text-zinc-200"
      style={{ paddingLeft: `${indent + 18}px` }}
    >
      <span className="shrink-0 text-xs">{getFileIcon(entry.name, false)}</span>
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

export function FileTree(): React.ReactElement {
  const { activeSlug } = useBookStore();
  const { navigate } = useViewStore();
  const revision = useFileChangeStore((s) => s.revision);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  const loadTree = useCallback(async (preserveExpanded = false) => {
    if (!activeSlug) {
      setEntries([]);
      return;
    }

    setLoading(true);
    try {
      const tree = await window.novelEngine.files.listDir(activeSlug);
      setEntries(tree);

      if (!preserveExpanded) {
        // Set default expanded/collapsed paths on initial load
        const defaultExpanded = new Set<string>();
        for (const entry of tree) {
          if (entry.isDirectory && DEFAULT_EXPANDED.has(entry.name)) {
            defaultExpanded.add(entry.path);
          }
          // dist/ and assets/ are not added — collapsed by default
        }
        setExpandedPaths(defaultExpanded);
      }
    } catch (error) {
      console.error('Failed to load file tree:', error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [activeSlug]);

  // Initial load when activeSlug changes
  useEffect(() => {
    setHasInitialized(false);
    loadTree(false).then(() => setHasInitialized(true));
  }, [loadTree]);

  // Re-fetch (preserving expanded state) when files change on disk
  useEffect(() => {
    if (hasInitialized && revision > 0) {
      loadTree(true);
    }
  }, [revision, hasInitialized, loadTree]);

  const handleToggle = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleFileClick = (entry: FileEntry) => {
    if (isInDist(entry.path)) {
      // For dist files, open externally
      window.novelEngine.shell.openPath(entry.path).catch((err) => {
        console.error('Failed to open file:', err);
      });
      return;
    }

    if (entry.isDirectory) {
      // Open browser mode at this directory
      navigate('files', { fileBrowserPath: entry.path, fileViewMode: 'browser' });
      return;
    }

    // Files open in reader mode
    if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) {
      navigate('files', { filePath: entry.path, fileViewMode: 'reader' });
    }
  };

  if (!activeSlug) {
    return <div />;
  }

  return (
    <div className="px-3 py-2">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Files</div>
        <button
          onClick={() => loadTree(false)}
          disabled={loading}
          className="no-drag rounded p-0.5 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-300"
          title="Refresh file tree"
        >
          🔄
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-zinc-500">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="text-xs text-zinc-500">No files</div>
      ) : (
        <div>
          {entries.map((entry) => (
            <FileNode
              key={entry.path}
              entry={entry}
              depth={0}
              expandedPaths={expandedPaths}
              onToggle={handleToggle}
              onFileClick={handleFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
