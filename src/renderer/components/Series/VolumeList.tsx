import { useState, useMemo } from 'react';
import type { BookSummary, SeriesVolume } from '@domain/types';
import { useSeriesStore } from '../../stores/seriesStore';

type VolumeListProps = {
  volumes: SeriesVolume[];
  books: BookSummary[];
  onReorder: (orderedSlugs: string[]) => void;
  onRemove: (bookSlug: string) => void;
  onAdd: (bookSlug: string) => void;
};

export function VolumeList({
  volumes,
  books,
  onReorder,
  onRemove,
  onAdd,
}: VolumeListProps): React.ReactElement {
  const [showPicker, setShowPicker] = useState(false);
  const { seriesList } = useSeriesStore();

  // Books already in any series
  const booksInSeries = useMemo(() => {
    const set = new Set<string>();
    for (const series of seriesList) {
      for (const vol of series.volumes) {
        set.add(vol.bookSlug);
      }
    }
    return set;
  }, [seriesList]);

  // Available books: not in any series
  const availableBooks = useMemo(() => {
    return books.filter((b) => !booksInSeries.has(b.slug));
  }, [books, booksInSeries]);

  const bookMap = useMemo(() => {
    const map = new Map<string, BookSummary>();
    for (const b of books) map.set(b.slug, b);
    return map;
  }, [books]);

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const slugs = volumes.map((v) => v.bookSlug);
    [slugs[index - 1], slugs[index]] = [slugs[index], slugs[index - 1]];
    onReorder(slugs);
  };

  const moveDown = (index: number) => {
    if (index >= volumes.length - 1) return;
    const slugs = volumes.map((v) => v.bookSlug);
    [slugs[index], slugs[index + 1]] = [slugs[index + 1], slugs[index]];
    onReorder(slugs);
  };

  return (
    <div>
      {volumes.length === 0 ? (
        <div className="py-6 text-center text-sm text-zinc-500">
          No books in this series yet. Add one below.
        </div>
      ) : (
        <div className="space-y-1">
          {volumes.map((vol, index) => {
            const book = bookMap.get(vol.bookSlug);
            return (
              <div
                key={vol.bookSlug}
                className="flex items-center gap-2 rounded-md bg-zinc-100 dark:bg-zinc-800 px-3 py-2"
              >
                <span className="shrink-0 text-xs font-medium text-zinc-500 dark:text-zinc-400 w-8">
                  #{vol.volumeNumber}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-900 dark:text-zinc-100">
                  {book?.title ?? vol.bookSlug}
                </span>

                {/* Move up */}
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  title="Move up"
                  className="rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                    <path fillRule="evenodd" d="M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0 1 10 17Z" clipRule="evenodd" />
                  </svg>
                </button>

                {/* Move down */}
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === volumes.length - 1}
                  title="Move down"
                  className="rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                    <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 0 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
                  </svg>
                </button>

                {/* Remove */}
                <button
                  onClick={() => onRemove(vol.bookSlug)}
                  title="Remove from series"
                  className="rounded p-1 text-zinc-400 hover:text-red-500"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add book */}
      <div className="mt-3">
        {showPicker ? (
          <div className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-2">
            <div className="text-xs font-medium text-zinc-400 mb-2">Select a book to add:</div>
            {availableBooks.length === 0 ? (
              <div className="text-xs text-zinc-500 py-2">All books are already in a series.</div>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1">
                {availableBooks.map((book) => (
                  <button
                    key={book.slug}
                    onClick={() => {
                      onAdd(book.slug);
                      setShowPicker(false);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <span className="min-w-0 flex-1 truncate">{book.title}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowPicker(false)}
              className="mt-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowPicker(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400 hover:border-blue-500 hover:text-blue-500"
          >
            <span>+</span>
            <span>Add Book</span>
          </button>
        )}
      </div>
    </div>
  );
}
