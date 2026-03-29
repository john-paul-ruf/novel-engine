import { useEffect, useState } from 'react';
import { useSeriesStore } from '../../stores/seriesStore';
import { useBookStore } from '../../stores/bookStore';
import { SeriesForm } from './SeriesForm';
import { VolumeList } from './VolumeList';
import { SeriesBibleEditor } from './SeriesBibleEditor';

export function SeriesModal(): React.ReactElement {
  const {
    seriesList,
    activeSeries,
    bibleContent,
    bibleDirty,
    modalMode,
    error,
    loadSeries,
    createSeries,
    updateSeries,
    deleteSeries,
    selectSeries,
    clearSelection,
    addVolume,
    removeVolume,
    reorderVolumes,
    setBibleContent,
    saveBible,
    closeModal,
  } = useSeriesStore();

  const { books, archiveBook, loadBooks, loadArchivedBooks } = useBookStore();
  const [editTab, setEditTab] = useState<'volumes' | 'bible'>('volumes');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showRename, setShowRename] = useState(false);
  const [confirmingArchiveSeries, setConfirmingArchiveSeries] = useState(false);
  const [archivingSeriesError, setArchivingSeriesError] = useState<string | null>(null);

  const setMode = (mode: 'list' | 'create' | 'edit' | 'bible') => {
    useSeriesStore.setState({ modalMode: mode });
  };

  useEffect(() => {
    loadSeries();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeModal]);

  const handleCreate = async (name: string, description: string) => {
    try {
      const created = await createSeries(name, description);
      await selectSeries(created.slug);
      setMode('edit');
    } catch {
      // error shown via store
    }
  };

  const handleDelete = async (slug: string) => {
    await deleteSeries(slug);
    setConfirmDelete(null);
  };

  const handleArchiveSeries = async () => {
    if (!activeSeries) return;
    setArchivingSeriesError(null);
    try {
      for (const vol of activeSeries.volumes) {
        await archiveBook(vol.bookSlug);
      }
      await loadArchivedBooks();
      await loadBooks();
      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to archive series';
      setArchivingSeriesError(msg);
      setConfirmingArchiveSeries(false);
    }
  };

  const title = modalMode === 'list' ? 'Manage Series'
    : modalMode === 'create' ? 'Create Series'
    : modalMode === 'bible' ? `Series Bible — ${activeSeries?.name ?? ''}`
    : `Edit Series — ${activeSeries?.name ?? ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 shadow-xl">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-5 py-3">
          <div className="flex items-center gap-2">
            {(modalMode === 'edit' || modalMode === 'create' || modalMode === 'bible') && (
              <button
                onClick={() => {
                  clearSelection();
                  setMode('list');
                  setShowRename(false);
                }}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                ← Back
              </button>
            )}
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          </div>
          <button
            onClick={closeModal}
            className="rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-5 mt-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {modalMode === 'list' && (
            <div>
              {seriesList.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-500">
                  No series yet. Create one to group your books.
                </div>
              ) : (
                <div className="space-y-2 mb-4">
                  {seriesList.map((series) => (
                    <div
                      key={series.slug}
                      className="flex items-center gap-3 rounded-md bg-zinc-100 dark:bg-zinc-800 px-4 py-3 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 transition-colors"
                    >
                      <button
                        onClick={async () => {
                          await selectSeries(series.slug);
                          setMode('edit');
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{series.name}</div>
                        {series.description && (
                          <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{series.description}</div>
                        )}
                        <div className="mt-1 text-xs text-zinc-500">
                          {series.volumeCount} volume{series.volumeCount !== 1 ? 's' : ''}
                        </div>
                      </button>

                      {confirmDelete === series.slug ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(series.slug)}
                            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="rounded px-2 py-1 text-xs text-zinc-500"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(series.slug)}
                          title="Delete series"
                          className="shrink-0 rounded p-1 text-zinc-400 hover:text-red-500"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 1 .7.8l-.5 5.5a.75.75 0 0 1-1.496-.136l.5-5.501a.75.75 0 0 1 .796-.664Zm2.84 0a.75.75 0 0 1 .796.664l.5 5.501a.75.75 0 1 1-1.496.136l-.5-5.5a.75.75 0 0 1 .7-.801Z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setMode('create')}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                <span>+</span>
                <span>Create New Series</span>
              </button>
            </div>
          )}

          {modalMode === 'create' && (
            <SeriesForm
              mode="create"
              onSubmit={handleCreate}
              onCancel={() => setMode('list')}
            />
          )}

          {modalMode === 'edit' && activeSeries && (
            <div>
              {/* Inline rename */}
              {showRename ? (
                <div className="mb-4">
                  <SeriesForm
                    mode="edit"
                    initialName={activeSeries.name}
                    initialDescription={activeSeries.description}
                    onSubmit={async (name, description) => {
                      await updateSeries(activeSeries.slug, { name, description });
                      setShowRename(false);
                    }}
                    onCancel={() => setShowRename(false)}
                  />
                </div>
              ) : (
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex-1">
                    <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{activeSeries.name}</div>
                    {activeSeries.description && (
                      <div className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{activeSeries.description}</div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowRename(true)}
                    className="rounded-md px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Rename
                  </button>
                </div>
              )}

              {/* Tabs */}
              <div className="mb-4 flex border-b border-zinc-200 dark:border-zinc-800">
                <button
                  onClick={() => setEditTab('volumes')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    editTab === 'volumes'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  Volumes
                </button>
                <button
                  onClick={() => setEditTab('bible')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    editTab === 'bible'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  Series Bible
                  {bibleDirty && <span className="ml-1 text-amber-500">*</span>}
                </button>
              </div>

              {editTab === 'volumes' && (
                <VolumeList
                  volumes={activeSeries.volumes}
                  books={books}
                  onReorder={reorderVolumes}
                  onRemove={removeVolume}
                  onAdd={addVolume}
                />
              )}

              {editTab === 'bible' && (
                <SeriesBibleEditor
                  content={bibleContent}
                  dirty={bibleDirty}
                  onChange={setBibleContent}
                  onSave={saveBible}
                />
              )}

              {/* Archive Series — visible only when there are volumes to archive */}
              {activeSeries.volumes.length > 0 && (
                <div className="mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                  {archivingSeriesError && (
                    <p className="mb-2 text-xs text-red-600 dark:text-red-400">{archivingSeriesError}</p>
                  )}
                  {confirmingArchiveSeries ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Archive all {activeSeries.volumes.length} book{activeSeries.volumes.length !== 1 ? 's' : ''} in this series? Books can be restored from the archive.
                      </span>
                      <button
                        onClick={handleArchiveSeries}
                        className="shrink-0 rounded-md bg-zinc-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-500 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmingArchiveSeries(false)}
                        className="shrink-0 rounded-md px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingArchiveSeries(true)}
                      className="flex items-center gap-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                    >
                      <span>📦</span>
                      <span>Archive Series</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {modalMode === 'bible' && activeSeries && (
            <SeriesBibleEditor
              content={bibleContent}
              dirty={bibleDirty}
              onChange={setBibleContent}
              onSave={saveBible}
            />
          )}
        </div>
      </div>
    </div>
  );
}
