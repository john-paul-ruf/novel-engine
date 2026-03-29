import { useState } from 'react';
import type { BookStatus, BookSummary } from '@domain/types';

const STATUS_COLORS: Record<BookStatus, { bg: string; text: string }> = {
  scaffolded:     { bg: 'bg-zinc-300 dark:bg-zinc-600',    text: 'text-zinc-800 dark:text-zinc-200' },
  outlining:      { bg: 'bg-blue-600',    text: 'text-blue-100' },
  'first-draft':  { bg: 'bg-blue-600',    text: 'text-blue-100' },
  'revision-1':   { bg: 'bg-amber-600',   text: 'text-amber-100' },
  'revision-2':   { bg: 'bg-amber-600',   text: 'text-amber-100' },
  'copy-edit':    { bg: 'bg-purple-600',  text: 'text-purple-100' },
  final:          { bg: 'bg-green-600',   text: 'text-green-100' },
  published:      { bg: 'bg-emerald-600', text: 'text-emerald-100' },
};

const FALLBACK_COLORS = { bg: 'bg-zinc-300 dark:bg-zinc-600', text: 'text-zinc-800 dark:text-zinc-200' };

type SeriesGroupProps = {
  seriesName: string;
  seriesSlug: string;
  volumes: Array<{
    volumeNumber: number;
    book: BookSummary;
  }>;
  activeSlug: string;
  onSelectBook: (slug: string) => void;
  onManageSeries: (slug: string) => void;
};

export function SeriesGroup({
  seriesName,
  seriesSlug,
  volumes,
  activeSlug,
  onSelectBook,
  onManageSeries,
}: SeriesGroupProps): React.ReactElement {
  const hasActiveBook = volumes.some((v) => v.book.slug === activeSlug);
  const [isExpanded, setIsExpanded] = useState(hasActiveBook);

  return (
    <div className={`${hasActiveBook ? 'border-l-2 border-orange-500' : 'border-l-2 border-transparent'}`}>
      {/* Series header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        className="no-drag flex w-full cursor-pointer items-center gap-2 px-3 py-2 bg-zinc-100/50 dark:bg-zinc-800/50 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition-colors"
      >
        {/* Chevron */}
        <span className={`text-[10px] text-zinc-500 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}>
          ▶
        </span>

        {/* Book stack icon */}
        <span className="text-xs">📚</span>

        {/* Series name */}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-600 dark:text-zinc-300">
          {seriesName}
        </span>

        {/* Volume count badge */}
        <span className="shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
          {volumes.length} vol{volumes.length !== 1 ? 's' : ''}
        </span>

        {/* Gear icon */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onManageSeries(seriesSlug);
          }}
          title="Manage series"
          className="shrink-0 rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
            <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Volume list */}
      {isExpanded && (
        <div>
          {volumes.map((vol) => {
            const isActive = vol.book.slug === activeSlug;
            const colors = STATUS_COLORS[vol.book.status] ?? FALLBACK_COLORS;
            return (
              <button
                key={vol.book.slug}
                onClick={() => onSelectBook(vol.book.slug)}
                className={`no-drag flex w-full items-center gap-2 pl-8 pr-3 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  isActive ? 'bg-orange-50 dark:bg-orange-950/20' : ''
                }`}
              >
                <span className="shrink-0 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                  Vol. {vol.volumeNumber}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-900 dark:text-zinc-100">
                  {vol.book.title}
                </span>
                <span className={`inline-block shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text}`}>
                  {vol.book.status}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
