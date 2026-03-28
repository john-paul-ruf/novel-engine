import { useEffect, useState } from 'react';
import { useSeriesImportStore } from '../../stores/seriesImportStore';
import { useBookStore } from '../../stores/bookStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { VolumePreviewList } from './VolumePreviewList';

export function ImportSeriesWizard() {
  const step = useSeriesImportStore((s) => s.step);
  const result = useSeriesImportStore((s) => s.result);
  const error = useSeriesImportStore((s) => s.error);
  const seriesName = useSeriesImportStore((s) => s.seriesName);
  const author = useSeriesImportStore((s) => s.author);
  const volumes = useSeriesImportStore((s) => s.volumes);
  const existingSeriesSlug = useSeriesImportStore((s) => s.existingSeriesSlug);
  const updateSeriesName = useSeriesImportStore((s) => s.updateSeriesName);
  const updateAuthor = useSeriesImportStore((s) => s.updateAuthor);
  const updateVolumeTitle = useSeriesImportStore((s) => s.updateVolumeTitle);
  const toggleVolumeSkip = useSeriesImportStore((s) => s.toggleVolumeSkip);
  const moveVolumeUp = useSeriesImportStore((s) => s.moveVolumeUp);
  const moveVolumeDown = useSeriesImportStore((s) => s.moveVolumeDown);
  const selectExistingSeries = useSeriesImportStore((s) => s.selectExistingSeries);
  const commitImport = useSeriesImportStore((s) => s.commitImport);
  const startImport = useSeriesImportStore((s) => s.startImport);
  const reset = useSeriesImportStore((s) => s.reset);

  const { seriesList, loadSeries } = useSeriesStore();
  const [useExisting, setUseExisting] = useState(false);

  useEffect(() => {
    loadSeries();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (step === 'idle') return null;

  const handleOpenBook = async () => {
    if (!result || result.volumeResults.length === 0) return;
    await useBookStore.getState().setActiveBook(result.volumeResults[0].bookSlug);
    reset();
  };

  const activeVolumes = volumes.filter((v) => !v.skipped);
  const canCommit =
    (useExisting ? existingSeriesSlug : seriesName.trim().length > 0)
    && activeVolumes.length > 0
    && activeVolumes.every((v) => v.preview.detectedTitle.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[700px] max-h-[85vh] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Import Series
          </h2>
          {step === 'preview' && (
            <p className="text-xs text-zinc-500 mt-1">
              {activeVolumes.length} volume{activeVolumes.length !== 1 ? 's' : ''}
              {' '}&middot;{' '}
              {activeVolumes.reduce((s, v) => s + v.preview.totalWordCount, 0).toLocaleString()} words total
            </p>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="mt-4 text-sm text-zinc-500">Analyzing manuscripts...</p>
            </div>
          )}

          {step === 'preview' && (
            <div className="flex flex-col">
              {/* Series info */}
              <div className="px-5 py-4 space-y-3">
                {/* New vs. Existing series toggle */}
                {seriesList.length > 0 && (
                  <div className="flex items-center gap-4 mb-2">
                    <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                      <input
                        type="radio"
                        checked={!useExisting}
                        onChange={() => { setUseExisting(false); selectExistingSeries(null); }}
                        className="text-blue-500"
                      />
                      New Series
                    </label>
                    <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                      <input
                        type="radio"
                        checked={useExisting}
                        onChange={() => setUseExisting(true)}
                        className="text-blue-500"
                      />
                      Add to Existing
                    </label>
                  </div>
                )}

                {!useExisting ? (
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                      Series Name
                    </label>
                    <input
                      type="text"
                      value={seriesName}
                      onChange={(e) => updateSeriesName(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500"
                      placeholder="e.g. The Stormlight Archive"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                      Select Series
                    </label>
                    <select
                      value={existingSeriesSlug ?? ''}
                      onChange={(e) => selectExistingSeries(e.target.value || null)}
                      className="w-full px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500"
                    >
                      <option value="">Choose a series...</option>
                      {seriesList.map((s) => (
                        <option key={s.slug} value={s.slug}>
                          {s.name} ({s.volumeCount} volume{s.volumeCount !== 1 ? 's' : ''})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    Author (applied to all volumes)
                  </label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => updateAuthor(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Volume list */}
              <div className="border-t border-zinc-200 dark:border-zinc-800">
                <div className="px-5 py-2">
                  <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Volumes
                  </h3>
                </div>
                <VolumePreviewList
                  volumes={volumes}
                  onUpdateTitle={updateVolumeTitle}
                  onToggleSkip={toggleVolumeSkip}
                  onMoveUp={moveVolumeUp}
                  onMoveDown={moveVolumeDown}
                />
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="mt-4 text-sm text-zinc-500">Creating books and linking to series...</p>
            </div>
          )}

          {step === 'success' && result && (
            <div className="flex flex-col items-center justify-center py-12 px-5">
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Series Import Complete
              </h3>
              <p className="mt-2 text-sm text-zinc-500 text-center">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{result.seriesName}</span>
                {' '}&mdash; {result.totalBooks} book{result.totalBooks !== 1 ? 's' : ''},
                {' '}{result.totalChapters} chapter{result.totalChapters !== 1 ? 's' : ''},
                {' '}{result.totalWordCount.toLocaleString()} words
              </p>
              <div className="mt-4 space-y-1">
                {result.volumeResults.map((vr, i) => (
                  <div key={vr.bookSlug} className="text-xs text-zinc-500">
                    Vol {i + 1}: {vr.title} &mdash; {vr.chapterCount} ch., {vr.totalWordCount.toLocaleString()} words
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center justify-center py-12 px-5">
              <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Import Failed
              </h3>
              <p className="mt-2 text-sm text-red-600 dark:text-red-400 text-center max-w-md">
                {error}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
          {step === 'preview' && (
            <>
              <button
                onClick={reset}
                className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={commitImport}
                disabled={!canCommit}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Import {activeVolumes.length} Volume{activeVolumes.length !== 1 ? 's' : ''}
              </button>
            </>
          )}

          {step === 'success' && (
            <button
              onClick={handleOpenBook}
              className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Open First Book
            </button>
          )}

          {step === 'error' && (
            <>
              <button
                onClick={() => { reset(); startImport(); }}
                className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Try Again
              </button>
              <button
                onClick={reset}
                className="px-3 py-1.5 text-sm rounded bg-zinc-600 text-white hover:bg-zinc-700"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
