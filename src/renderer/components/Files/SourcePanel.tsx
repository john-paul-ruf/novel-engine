import { useState, useEffect } from 'react';
import { useFileChangeStore } from '../../stores/fileChangeStore';

const SOURCE_FILES = [
  { path: 'source/voice-profile.md', label: 'Voice Profile', icon: '🎤', description: 'Your writing voice DNA' },
  { path: 'source/scene-outline.md', label: 'Scene Outline', icon: '📋', description: 'Scene-by-scene story structure' },
  { path: 'source/story-bible.md',   label: 'Story Bible',   icon: '📖', description: 'Characters, world, and lore' },
  { path: 'source/pitch.md',         label: 'Pitch',         icon: '💡', description: 'The core story concept' },
] as const;

type FileStatus = {
  exists: boolean;
  wordCount: number;
};

type SourcePanelProps = {
  activeSlug: string;
  onFileSelect: (path: string) => void;
};

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export function SourcePanel({
  activeSlug,
  onFileSelect,
}: SourcePanelProps): React.ReactElement {
  const revision = useFileChangeStore((s) => s.revision);
  const [statuses, setStatuses] = useState<Record<string, FileStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const loadStatuses = async () => {
      const result: Record<string, FileStatus> = {};

      await Promise.all(
        SOURCE_FILES.map(async (file) => {
          try {
            const exists = await window.novelEngine.files.exists(activeSlug, file.path);
            let wordCount = 0;
            if (exists) {
              try {
                const content = await window.novelEngine.files.read(activeSlug, file.path);
                wordCount = countWords(content);
              } catch {
                // File exists but unreadable — treat as 0 words
              }
            }
            result[file.path] = { exists, wordCount };
          } catch {
            // Check failed — treat as non-existent
            result[file.path] = { exists: false, wordCount: 0 };
          }
        }),
      );

      if (!cancelled) {
        setStatuses(result);
        setLoading(false);
      }
    };

    loadStatuses();

    return () => {
      cancelled = true;
    };
  }, [activeSlug, revision]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SOURCE_FILES.map((file) => (
          <div
            key={file.path}
            className="h-[120px] animate-pulse rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-200/50 dark:bg-zinc-800/50"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {SOURCE_FILES.map((file) => {
        const status = statuses[file.path];
        const fileExists = status?.exists ?? false;
        const wordCount = status?.wordCount ?? 0;

        return (
          <div
            key={file.path}
            onClick={() => onFileSelect(file.path)}
            className="group relative cursor-pointer rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 transition-colors hover:border-zinc-400 dark:hover:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
          >
            <div className="mb-2 text-2xl">{file.icon}</div>
            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{file.label}</div>
            <div className="mt-0.5 text-xs text-zinc-500">{file.description}</div>

            {/* Status line */}
            <div className="mt-3 flex items-center gap-2 text-xs">
              {fileExists ? (
                <>
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  <span className="text-zinc-500 dark:text-zinc-400">{wordCount.toLocaleString()} words</span>
                </>
              ) : (
                <>
                  <span className="text-zinc-400 dark:text-zinc-600">○</span>
                  <span className="text-zinc-400 dark:text-zinc-600">Not created yet</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
