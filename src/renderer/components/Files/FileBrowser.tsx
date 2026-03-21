import { useEffect, useState } from 'react';
import type { FileEntry } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { useFileChangeStore } from '../../stores/fileChangeStore';

type FileBrowserProps = {
  currentPath: string;
  onNavigate: (path: string) => void;
  onFileSelect: (path: string) => void;
};

type BrowserLayout = 'grid' | 'list';

type FileMetadata = {
  wordCount: number | null;
  preview: string;
};

function getFileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) return '📁';
  if (name.endsWith('.md')) return '📄';
  if (name.endsWith('.json')) return '⚙️';
  return '📎';
}

function getFileType(name: string, isDirectory: boolean): string {
  if (isDirectory) return 'Folder';
  if (name.endsWith('.md')) return 'Markdown';
  if (name.endsWith('.json')) return 'JSON';
  const ext = name.split('.').pop()?.toUpperCase();
  return ext ? `${ext} File` : 'File';
}

function countWordsInText(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function parseChapterName(folderName: string): { number: number; title: string } | null {
  const match = folderName.match(/^(\d+)-(.+)$/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const title = match[2]
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return { number: num, title };
}

function sortEntries(entries: FileEntry[], isChaptersDir: boolean): FileEntry[] {
  const dirs = entries.filter((e) => e.isDirectory);
  const files = entries.filter((e) => !e.isDirectory);

  const sortFn = isChaptersDir
    ? (a: FileEntry, b: FileEntry) => {
        const aNum = parseInt(a.name.match(/^(\d+)/)?.[1] ?? '999', 10);
        const bNum = parseInt(b.name.match(/^(\d+)/)?.[1] ?? '999', 10);
        return aNum - bNum;
      }
    : (a: FileEntry, b: FileEntry) => a.name.localeCompare(b.name);

  dirs.sort(sortFn);
  files.sort((a, b) => a.name.localeCompare(b.name));

  return [...dirs, ...files];
}

function FileCardGrid({
  entries,
  metadata,
  isChaptersDir,
  onNavigate,
  onFileSelect,
}: {
  entries: FileEntry[];
  metadata: Map<string, FileMetadata>;
  isChaptersDir: boolean;
  onNavigate: (path: string) => void;
  onFileSelect: (path: string) => void;
}): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
      {entries.map((entry) => (
        <FileCard
          key={entry.path}
          entry={entry}
          metadata={metadata.get(entry.path) ?? null}
          isChaptersDir={isChaptersDir}
          onClick={() =>
            entry.isDirectory ? onNavigate(entry.path) : onFileSelect(entry.path)
          }
          onFileSelect={onFileSelect}
        />
      ))}
    </div>
  );
}

function FileCard({
  entry,
  metadata,
  isChaptersDir,
  onClick,
  onFileSelect,
}: {
  entry: FileEntry;
  metadata: FileMetadata | null;
  isChaptersDir: boolean;
  onClick: () => void;
  onFileSelect: (path: string) => void;
}): React.ReactElement {
  const icon = getFileIcon(entry.name, entry.isDirectory);
  const chapterInfo = isChaptersDir && entry.isDirectory ? parseChapterName(entry.name) : null;
  const isDist = entry.path.startsWith('dist/') || entry.path === 'dist';

  const handleOpenExternal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const absPath = await window.novelEngine.books.getAbsolutePath(
        useBookStore.getState().activeSlug,
        entry.path,
      );
      await window.novelEngine.shell.openPath(absPath);
    } catch (err) {
      console.error('Failed to open externally:', err);
    }
  };

  return (
    <div
      onClick={onClick}
      className="group relative rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 hover:border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-100 dark:bg-zinc-800/80 cursor-pointer transition-colors"
    >
      {/* Quick actions (hover) */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isDist && !entry.isDirectory && (
          <button
            onClick={handleOpenExternal}
            className="rounded bg-zinc-200 dark:bg-zinc-700 p-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:bg-zinc-600"
            title="Open externally"
          >
            ↗
          </button>
        )}
      </div>

      {/* Icon and name */}
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          {chapterInfo ? (
            <>
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                Chapter {chapterInfo.number}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{chapterInfo.title}</div>
            </>
          ) : (
            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
              {entry.isDirectory ? entry.name : entry.name.replace(/\.md$/, '')}
            </div>
          )}

          {/* Metadata line */}
          {entry.isDirectory ? (
            <div className="mt-1 text-xs text-zinc-500">
              {entry.children?.length ?? 0} item{(entry.children?.length ?? 0) !== 1 ? 's' : ''}
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              {metadata?.wordCount !== null && metadata?.wordCount !== undefined && (
                <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                  {metadata.wordCount.toLocaleString()} words
                </span>
              )}
            </div>
          )}

          {/* Preview for markdown files */}
          {!entry.isDirectory && metadata?.preview && (
            <div className="mt-2 text-xs text-zinc-500 line-clamp-2 leading-relaxed">
              {metadata.preview}
            </div>
          )}

          {/* Chapter quick-access links */}
          {chapterInfo && entry.isDirectory && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFileSelect(`${entry.path}/draft.md`);
                }}
                className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-200 dark:bg-zinc-700 hover:text-zinc-800 dark:text-zinc-200 transition-colors"
              >
                Draft
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFileSelect(`${entry.path}/notes.md`);
                }}
                className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-200 dark:bg-zinc-700 hover:text-zinc-800 dark:text-zinc-200 transition-colors"
              >
                Notes
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FileListView({
  entries,
  metadata,
  isChaptersDir,
  onNavigate,
  onFileSelect,
}: {
  entries: FileEntry[];
  metadata: Map<string, FileMetadata>;
  isChaptersDir: boolean;
  onNavigate: (path: string) => void;
  onFileSelect: (path: string) => void;
}): React.ReactElement {
  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
        <div className="w-8" />
        <div className="flex-1">Name</div>
        <div className="w-24 text-right">Type</div>
        <div className="w-24 text-right">Words</div>
      </div>

      {/* Rows */}
      {entries.map((entry) => {
        const icon = getFileIcon(entry.name, entry.isDirectory);
        const fileType = getFileType(entry.name, entry.isDirectory);
        const meta = metadata.get(entry.path);
        const chapterInfo = isChaptersDir && entry.isDirectory ? parseChapterName(entry.name) : null;

        return (
          <div
            key={entry.path}
            onClick={() =>
              entry.isDirectory ? onNavigate(entry.path) : onFileSelect(entry.path)
            }
            className="group flex items-center gap-4 border-b border-zinc-200 dark:border-zinc-800/50 px-4 py-2 cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-200/50 dark:bg-zinc-800/50 transition-colors"
          >
            <div className="w-8 text-center shrink-0">{icon}</div>
            <div className="flex-1 min-w-0">
              <span className="text-sm text-zinc-800 dark:text-zinc-200 truncate block">
                {chapterInfo
                  ? `Chapter ${chapterInfo.number}: ${chapterInfo.title}`
                  : entry.name}
              </span>
            </div>
            <div className="w-24 text-right text-xs text-zinc-500 shrink-0">{fileType}</div>
            <div className="w-24 text-right text-xs text-zinc-500 shrink-0">
              {meta?.wordCount !== null && meta?.wordCount !== undefined
                ? meta.wordCount.toLocaleString()
                : entry.isDirectory
                  ? `${entry.children?.length ?? 0} items`
                  : '—'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FileBrowser({
  currentPath,
  onNavigate,
  onFileSelect,
}: FileBrowserProps): React.ReactElement {
  const { activeSlug } = useBookStore();
  const revision = useFileChangeStore((s) => s.revision);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<BrowserLayout>('grid');
  const [metadata, setMetadata] = useState<Map<string, FileMetadata>>(new Map());

  const isChaptersDir = currentPath === 'chapters' || currentPath.endsWith('/chapters');

  // Load directory listing (re-runs when files change on disk)
  useEffect(() => {
    if (!activeSlug) {
      setEntries([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setMetadata(new Map());

    const loadDir = async () => {
      try {
        const fullTree = await window.novelEngine.files.listDir(activeSlug, currentPath || undefined);
        if (cancelled) return;

        // If we requested a subdirectory, `listDir` may return the full tree.
        // We need to find the entries at the current path level.
        let dirEntries: FileEntry[];

        if (!currentPath) {
          // Root level
          dirEntries = fullTree;
        } else {
          // Navigate into the tree to find the right level
          const targetEntries = findEntriesAtPath(fullTree, currentPath);
          dirEntries = targetEntries ?? [];
        }

        const sorted = sortEntries(dirEntries, isChaptersDir);
        if (!cancelled) {
          setEntries(sorted);
          setLoading(false);
        }

        // Lazy-load metadata for markdown files
        loadFileMetadata(activeSlug, sorted, cancelled).then((meta) => {
          if (!cancelled) {
            setMetadata(meta);
          }
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load directory');
          setEntries([]);
          setLoading(false);
        }
      }
    };

    loadDir();

    return () => {
      cancelled = true;
    };
  }, [activeSlug, currentPath, isChaptersDir, revision]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-zinc-500">Loading directory...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <div className="text-red-600 dark:text-red-400">Failed to load directory</div>
        <div className="text-sm text-zinc-500">{error}</div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-zinc-500">This directory is empty.</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Layout toggle */}
      <div className="shrink-0 flex items-center justify-end px-6 py-2">
        <div className="flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5">
          <button
            onClick={() => setLayout('grid')}
            className={`rounded px-2 py-1 text-xs transition-colors ${
              layout === 'grid'
                ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:text-zinc-200'
            }`}
            title="Grid view"
          >
            ⊞
          </button>
          <button
            onClick={() => setLayout('list')}
            className={`rounded px-2 py-1 text-xs transition-colors ${
              layout === 'list'
                ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:text-zinc-200'
            }`}
            title="List view"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {layout === 'grid' ? (
          <FileCardGrid
            entries={entries}
            metadata={metadata}
            isChaptersDir={isChaptersDir}
            onNavigate={onNavigate}
            onFileSelect={onFileSelect}
          />
        ) : (
          <FileListView
            entries={entries}
            metadata={metadata}
            isChaptersDir={isChaptersDir}
            onNavigate={onNavigate}
            onFileSelect={onFileSelect}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Walk the file tree to find entries at a specific path.
 * The tree from `listDir` gives us the full recursive tree from the requested root.
 * If `listDir(slug, 'source')` returns entries directly under source/, they're already correct.
 * If `listDir(slug)` returns the full tree, we need to traverse.
 */
function findEntriesAtPath(tree: FileEntry[], targetPath: string): FileEntry[] | null {
  // First check if the tree entries' paths suggest they're already at the target level
  if (tree.length > 0) {
    const firstPath = tree[0].path;
    // If first entry's path starts with targetPath + '/', entries are direct children
    if (firstPath.startsWith(targetPath + '/')) {
      const expectedDepth = targetPath.split('/').length + 1;
      const firstDepth = firstPath.split('/').length;
      if (firstDepth === expectedDepth) {
        return tree;
      }
    }
  }

  // Otherwise, traverse the tree to find the target directory
  const parts = targetPath.split('/').filter(Boolean);
  let current = tree;

  for (const part of parts) {
    const dir = current.find((e) => e.isDirectory && e.name === part);
    if (!dir || !dir.children) return null;
    current = dir.children;
  }

  return current;
}

/**
 * Load word counts and previews for markdown files in the current directory.
 * For chapter directories, also loads word count from draft.md inside each chapter subfolder.
 */
async function loadFileMetadata(
  bookSlug: string,
  entries: FileEntry[],
  cancelled: boolean,
): Promise<Map<string, FileMetadata>> {
  const meta = new Map<string, FileMetadata>();
  const promises: Promise<void>[] = [];

  for (const entry of entries) {
    if (cancelled) break;

    if (!entry.isDirectory && entry.name.endsWith('.md')) {
      promises.push(
        window.novelEngine.files
          .read(bookSlug, entry.path)
          .then((content) => {
            if (!cancelled) {
              const words = countWordsInText(content);
              const firstLine = content.split('\n').find((line) => {
                const trimmed = line.trim();
                return trimmed.length > 0 && !trimmed.startsWith('#');
              }) ?? '';
              meta.set(entry.path, {
                wordCount: words,
                preview: firstLine.slice(0, 120),
              });
            }
          })
          .catch(() => {
            // Silently skip files that can't be read
          }),
      );
    } else if (entry.isDirectory && entry.children) {
      // For chapter directories, try to get draft.md word count
      const draftChild = entry.children.find((c) => c.name === 'draft.md');
      if (draftChild) {
        promises.push(
          window.novelEngine.files
            .read(bookSlug, draftChild.path)
            .then((content) => {
              if (!cancelled) {
                meta.set(entry.path, {
                  wordCount: countWordsInText(content),
                  preview: '',
                });
              }
            })
            .catch(() => {
              // Silently skip
            }),
        );
      }
    }
  }

  await Promise.allSettled(promises);
  return meta;
}
