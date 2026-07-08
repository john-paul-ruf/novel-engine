import { useEffect, useState } from 'react';
import type { BookStatus, BookSummary } from '@domain/types';
import { usePipelineStore } from '../../stores/pipelineStore';
import { Icon } from '../common/Icon';

function chipClass(status: BookStatus): string {
  if (status === 'published' || status === 'final') {
    return 'bg-ne-lumen/10 text-ne-lumen border-ne-lumen/30';
  }
  return 'bg-ne-brass-dim text-ne-brass-hi border-ne-brass/30';
}

type BookCardProps = {
  book: BookSummary;
  volumeNumber?: number;
  /** Cache-busting timestamp for the cover image (bumped after cover upload). */
  coverTimestamp: number;
  onSelect: () => void;
  onChangeCover: () => void;
  onInfo: () => void;
  onArchive: () => void;
};

export function BookCard({
  book,
  volumeNumber,
  coverTimestamp,
  onSelect,
  onChangeCover,
  onInfo,
  onArchive,
}: BookCardProps): React.ReactElement {
  const cacheEntry = usePipelineStore((s) => s.cache[book.slug]);
  const [coverError, setCoverError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setCoverError(false);
  }, [book.slug, coverTimestamp]);

  // Same current-phase derivation as PipelineTracker/Dashboard: the phase
  // reported by pipeline.getActive() positions the book; completed count
  // drives the progress bar.
  const phases = cacheEntry?.phases ?? [];
  const activePhase = cacheEntry?.activePhase ?? null;
  const total = phases.length;
  const completed = phases.filter((p) => p.status === 'complete').length;
  const isComplete = total > 0 && completed === total;
  const activeIdx = activePhase ? phases.findIndex((p) => p.id === activePhase.id) : -1;
  const phaseNumber = activeIdx >= 0 ? activeIdx + 1 : isComplete ? total : completed + 1;
  const progressPct = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className="group relative cursor-pointer rounded-[13px] border border-ne-line bg-ne-bg1 p-4 transition-all duration-150 hover:-translate-y-[3px] hover:border-ne-brass/50 hover:shadow-xl"
    >
      {/* Overflow menu */}
      <div className="absolute right-2.5 top-2.5 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          title="Book actions"
          className={`rounded-md bg-ne-bg0/80 px-1.5 text-sm leading-5 text-ne-ink-dim backdrop-blur transition-opacity hover:text-ne-ink ${
            menuOpen ? '' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          ⋯
        </button>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
              }}
            />
            <div className="absolute right-0 top-7 z-20 w-36 rounded-lg border border-ne-line bg-ne-bg1 py-1 shadow-xl">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onInfo();
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-ne-ink-dim hover:bg-ne-bg2 hover:text-ne-ink"
              >
                Book info
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onArchive();
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-ne-ink-dim hover:bg-ne-bg2 hover:text-ne-ink"
              >
                Archive
              </button>
            </div>
          </>
        )}
      </div>

      {/* Cover — click to change, same behavior as BookPanel's handleCoverClick */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onChangeCover();
        }}
        title="Change cover"
        className="group/cover relative block w-full rounded-[7px] focus:outline-none focus:ring-2 focus:ring-ne-brass/50"
      >
        {coverError ? (
          <div className="flex aspect-[2/3] w-full items-center justify-center rounded-[7px] border border-ne-line bg-ne-bg2 text-ne-ink-faint">
            <Icon name="manuscript" size={28} />
          </div>
        ) : (
          <img
            src={`novel-asset://cover/${book.slug}?t=${coverTimestamp}`}
            alt=""
            className="aspect-[2/3] w-full rounded-[7px] border border-ne-line object-cover shadow-lg"
            onError={() => setCoverError(true)}
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center rounded-[7px] bg-black/50 text-white opacity-0 transition-opacity group-hover/cover:opacity-100">
          <Icon name="pencil" size={18} />
        </div>
      </button>

      {/* Title */}
      <div className="mt-3 font-ne-serif text-[16.5px] font-medium text-ne-ink">{book.title}</div>

      {/* Status + phase */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ne-ink-dim">
        <span
          className={`rounded-full border px-2 py-px text-[10px] font-semibold uppercase tracking-wide ${chipClass(book.status)}`}
        >
          {book.status}
        </span>
        {volumeNumber !== undefined && <span className="text-ne-ink-faint">Vol. {volumeNumber}</span>}
        {total > 0 && (
          <span>
            Phase {phaseNumber} of {total}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-ne-bg3">
        <div
          className="h-full rounded-full"
          style={{
            width: `${progressPct}%`,
            background: isComplete
              ? 'var(--ne-lumen)'
              : 'linear-gradient(90deg, var(--ne-brass), var(--ne-brass-hi))',
          }}
        />
      </div>

      {/* Word count + hover resume */}
      <div className="mt-2 flex justify-between text-[11px] tabular-nums text-ne-ink-faint">
        <span>{book.wordCount.toLocaleString()} words</span>
        <span className="font-semibold text-ne-brass-hi opacity-0 transition-opacity group-hover:opacity-100">
          {isComplete ? 'Open →' : 'Resume →'}
        </span>
      </div>
    </div>
  );
}
