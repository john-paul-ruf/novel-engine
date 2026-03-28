import type { SeriesImportVolume } from '@domain/types';

type Props = {
  volumes: SeriesImportVolume[];
  onUpdateTitle: (index: number, title: string) => void;
  onToggleSkip: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
};

export function VolumePreviewList({
  volumes,
  onUpdateTitle,
  onToggleSkip,
  onMoveUp,
  onMoveDown,
}: Props) {
  return (
    <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {volumes.map((vol, pos) => (
        <div
          key={vol.index}
          className={`flex items-start gap-3 px-5 py-3 ${vol.skipped ? 'opacity-50' : ''}`}
        >
          {/* Volume number / skip badge */}
          <div className="mt-0.5 flex flex-col items-center gap-1 shrink-0 w-8">
            {!vol.skipped ? (
              <span className="text-xs font-bold text-blue-500">
                Vol {vol.volumeNumber}
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                Skip
              </span>
            )}
          </div>

          {/* Volume details */}
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={vol.preview.detectedTitle || ''}
              onChange={(e) => onUpdateTitle(vol.index, e.target.value)}
              disabled={vol.skipped}
              className="w-full bg-transparent text-sm font-medium text-zinc-900 dark:text-zinc-100 border-b border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 focus:border-blue-500 outline-none py-0.5 disabled:opacity-50"
              placeholder="Volume title"
            />
            <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
              <span>{vol.preview.chapters.length} ch.</span>
              <span>{vol.preview.totalWordCount.toLocaleString()} words</span>
              <span className="truncate text-zinc-400">
                {vol.preview.sourceFile.split('/').pop()}
              </span>
            </div>
            {vol.preview.ambiguous && (
              <div className="mt-1 text-[10px] text-amber-500">
                Chapter detection uncertain
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onMoveUp(vol.index)}
              disabled={pos === 0}
              className="rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move up"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M9.47 6.47a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 1 1-1.06 1.06L10 8.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06l4.25-4.25Z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={() => onMoveDown(vol.index)}
              disabled={pos === volumes.length - 1}
              className="rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move down"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0l-4.25-4.25a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={() => onToggleSkip(vol.index)}
              className={`rounded p-1 ${vol.skipped ? 'text-amber-500 hover:text-amber-400' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
              title={vol.skipped ? 'Include this volume' : 'Skip this volume'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                {vol.skipped ? (
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
                ) : (
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                )}
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
