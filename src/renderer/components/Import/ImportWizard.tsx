import { useImportStore } from '../../stores/importStore';
import { useBookStore } from '../../stores/bookStore';
import { ChapterPreviewList } from './ChapterPreviewList';

export function ImportWizard() {
  const step = useImportStore((s) => s.step);
  const preview = useImportStore((s) => s.preview);
  const result = useImportStore((s) => s.result);
  const error = useImportStore((s) => s.error);
  const title = useImportStore((s) => s.title);
  const author = useImportStore((s) => s.author);
  const chapters = useImportStore((s) => s.chapters);
  const generationSteps = useImportStore((s) => s.generationSteps);
  const updateTitle = useImportStore((s) => s.updateTitle);
  const updateAuthor = useImportStore((s) => s.updateAuthor);
  const commitImport = useImportStore((s) => s.commitImport);
  const startImport = useImportStore((s) => s.startImport);
  const startGeneration = useImportStore((s) => s.startGeneration);
  const reset = useImportStore((s) => s.reset);

  if (step === 'idle') return null;

  const handleOpenBook = async () => {
    if (!result) return;
    await useBookStore.getState().setActiveBook(result.bookSlug);
    reset();
  };

  const handleGenerateSources = () => {
    startGeneration();
  };

  const canCommit = title.trim().length > 0 && chapters.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[640px] max-h-[80vh] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Import Manuscript
          </h2>
          {step === 'preview' && preview && (
            <p className="text-xs text-zinc-500 mt-1">
              Source: {preview.sourceFile.split('/').pop() ?? preview.sourceFile}
              {' '}({preview.sourceFormat.toUpperCase()})
            </p>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="mt-4 text-sm text-zinc-500">Analyzing manuscript...</p>
            </div>
          )}

          {step === 'preview' && (
            <div className="flex flex-col">
              {/* Ambiguity warning */}
              {preview?.ambiguous && (
                <div className="mx-5 mt-4 px-3 py-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                  Chapter detection was uncertain. Please review the splits below and adjust as needed.
                </div>
              )}

              {/* Book details */}
              <div className="px-5 py-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => updateTitle(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    Author
                  </label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => updateAuthor(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Chapter list */}
              <div className="border-t border-zinc-200 dark:border-zinc-800">
                <div className="px-5 py-2">
                  <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Chapters
                  </h3>
                </div>
                <ChapterPreviewList />
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="mt-4 text-sm text-zinc-500">Creating book...</p>
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
                Import Complete
              </h3>
              <p className="mt-2 text-sm text-zinc-500 text-center">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{result.title}</span>
                {' '} — {result.chapterCount} chapter{result.chapterCount !== 1 ? 's' : ''}, {result.totalWordCount.toLocaleString()} words
              </p>
            </div>
          )}

          {step === 'generating' && (
            <div className="p-6">
              <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Generating Source Documents
              </h3>
              <div className="space-y-3">
                {generationSteps.map((gs) => (
                  <div key={gs.index} className="flex items-center gap-3">
                    <div className="w-5 shrink-0 text-center">
                      {gs.status === 'done' && <span className="text-green-500">&#10003;</span>}
                      {gs.status === 'running' && (
                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                      )}
                      {gs.status === 'pending' && <span className="text-zinc-400">&#9675;</span>}
                      {gs.status === 'error' && <span className="text-red-500">&#10007;</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm ${gs.status === 'running' ? 'font-medium text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'}`}>
                        {gs.label}
                      </span>
                      <span className="ml-2 text-xs text-zinc-400">({gs.agentName})</span>
                      {gs.error && <p className="mt-0.5 text-xs text-red-500">{gs.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-zinc-500">
                Each step reads the full manuscript. This may take several minutes.
              </p>
            </div>
          )}

          {step === 'generated' && (
            <div className="p-6 text-center">
              <div className="h-12 w-12 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Source Documents Generated
              </h3>
              <p className="mb-4 text-xs text-zinc-500">
                {generationSteps.filter((s) => s.status === 'done').length} of {generationSteps.length} steps completed successfully.
              </p>
              {generationSteps.some((s) => s.status === 'error') && (
                <p className="mb-4 text-xs text-amber-500">
                  Some steps had errors. You can generate missing documents manually using the agents.
                </p>
              )}
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
                Import
              </button>
            </>
          )}

          {step === 'success' && (
            <>
              <button
                onClick={handleGenerateSources}
                className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Generate Source Documents
              </button>
              <button
                onClick={handleOpenBook}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Open Book
              </button>
            </>
          )}

          {step === 'generated' && (
            <button
              onClick={handleOpenBook}
              className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Open Book
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
