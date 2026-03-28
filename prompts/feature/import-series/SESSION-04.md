# SESSION-04 — Renderer Store and UI Components

> **Feature:** import-series
> **Layer(s):** Renderer
> **Depends on:** SESSION-03
> **Estimated effort:** 30 min

---

## Context

Sessions 01-03 built the domain types, application service, and IPC wiring for series import. This session adds the renderer-side store and UI components. The user flow is:

1. User clicks "Import Series" button in the BookSelector dropdown
2. OS file picker opens with multi-select enabled
3. Each file is previewed — the wizard shows all volumes with detected titles, chapter counts, word counts
4. User can edit the series name, edit individual volume titles, reorder volumes, toggle skip on individual volumes
5. User can select an existing series instead of creating a new one
6. User commits — all books are created and linked to the series
7. Success screen shows results with option to open the first book

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/seriesImportStore.ts` | Create | Zustand store managing the series import wizard state |
| `src/renderer/components/Import/ImportSeriesWizard.tsx` | Create | Main wizard modal component |
| `src/renderer/components/Import/VolumePreviewList.tsx` | Create | List of volumes with edit/skip/reorder controls |
| `src/renderer/components/Sidebar/BookSelector.tsx` | Modify | Add "Import Series" button and render wizard modal |

---

## Implementation

### 1. Create `src/renderer/stores/seriesImportStore.ts`

This store mirrors the pattern of `importStore.ts` but manages multi-volume state.

```typescript
import { create } from 'zustand';
import type {
  SeriesImportPreview,
  SeriesImportResult,
  SeriesImportVolume,
  SeriesSummary,
} from '@domain/types';

type SeriesImportStep =
  | 'idle'
  | 'loading'       // Previewing files
  | 'preview'       // Showing all volumes for review
  | 'importing'     // Committing all volumes
  | 'success'       // All done
  | 'error';

type SeriesImportState = {
  step: SeriesImportStep;
  preview: SeriesImportPreview | null;
  result: SeriesImportResult | null;
  error: string;

  // Editable fields
  seriesName: string;
  author: string;
  volumes: SeriesImportVolume[];
  existingSeriesSlug: string | null;

  // Actions
  startImport: () => Promise<void>;
  updateSeriesName: (name: string) => void;
  updateAuthor: (author: string) => void;
  updateVolumeTitle: (index: number, title: string) => void;
  toggleVolumeSkip: (index: number) => void;
  moveVolumeUp: (index: number) => void;
  moveVolumeDown: (index: number) => void;
  selectExistingSeries: (slug: string | null) => void;
  commitImport: () => Promise<void>;
  reset: () => void;
};

const initialState = {
  step: 'idle' as SeriesImportStep,
  preview: null as SeriesImportPreview | null,
  result: null as SeriesImportResult | null,
  error: '',
  seriesName: '',
  author: '',
  volumes: [] as SeriesImportVolume[],
  existingSeriesSlug: null as string | null,
};

export const useSeriesImportStore = create<SeriesImportState>((set, get) => ({
  ...initialState,

  startImport: async () => {
    try {
      const filePaths = await window.novelEngine.seriesImport.selectFiles();
      if (!filePaths || filePaths.length === 0) return;

      set({ step: 'loading', error: '' });

      const preview = await window.novelEngine.seriesImport.preview(filePaths);

      // Fall back to settings author name
      const settingsAuthor = (await window.novelEngine.settings.load()).authorName;

      // Use first volume's detected author, or settings author
      const detectedAuthor =
        preview.volumes.find((v) => v.preview.detectedAuthor)?.preview.detectedAuthor ?? '';

      set({
        step: 'preview',
        preview,
        seriesName: preview.seriesName,
        author: detectedAuthor || settingsAuthor || '',
        volumes: [...preview.volumes],
        existingSeriesSlug: null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ step: 'error', error: message });
    }
  },

  updateSeriesName: (seriesName) => set({ seriesName }),
  updateAuthor: (author) => set({ author }),

  updateVolumeTitle: (index, title) => {
    const volumes = [...get().volumes];
    const vol = volumes.find((v) => v.index === index);
    if (!vol) return;

    // Update the detected title in the preview (used for display and commit)
    vol.preview = {
      ...vol.preview,
      detectedTitle: title,
    };
    set({ volumes });
  },

  toggleVolumeSkip: (index) => {
    const volumes = [...get().volumes];
    const vol = volumes.find((v) => v.index === index);
    if (!vol) return;
    vol.skipped = !vol.skipped;

    // Renumber non-skipped volumes
    let volumeNumber = 1;
    for (const v of volumes) {
      if (!v.skipped) {
        v.volumeNumber = volumeNumber++;
      }
    }
    set({ volumes });
  },

  moveVolumeUp: (index) => {
    const volumes = [...get().volumes];
    const pos = volumes.findIndex((v) => v.index === index);
    if (pos <= 0) return;

    [volumes[pos - 1], volumes[pos]] = [volumes[pos], volumes[pos - 1]];

    // Renumber non-skipped volumes
    let volumeNumber = 1;
    for (const v of volumes) {
      if (!v.skipped) {
        v.volumeNumber = volumeNumber++;
      }
    }
    set({ volumes });
  },

  moveVolumeDown: (index) => {
    const volumes = [...get().volumes];
    const pos = volumes.findIndex((v) => v.index === index);
    if (pos < 0 || pos >= volumes.length - 1) return;

    [volumes[pos], volumes[pos + 1]] = [volumes[pos + 1], volumes[pos]];

    // Renumber non-skipped volumes
    let volumeNumber = 1;
    for (const v of volumes) {
      if (!v.skipped) {
        v.volumeNumber = volumeNumber++;
      }
    }
    set({ volumes });
  },

  selectExistingSeries: (slug) => {
    set({ existingSeriesSlug: slug });
  },

  commitImport: async () => {
    const { seriesName, author, volumes, existingSeriesSlug } = get();
    const activeVolumes = volumes.filter((v) => !v.skipped);

    if (activeVolumes.length === 0) return;

    set({ step: 'importing', error: '' });

    try {
      const result = await window.novelEngine.seriesImport.commit({
        seriesName,
        existingSeriesSlug,
        author,
        volumes: activeVolumes.map((v) => ({
          volumeNumber: v.volumeNumber,
          title: v.preview.detectedTitle || `Volume ${v.volumeNumber}`,
          chapters: v.preview.chapters,
        })),
      });

      set({ step: 'success', result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ step: 'error', error: message });
    }
  },

  reset: () => set({ ...initialState }),
}));
```

### 2. Create `src/renderer/components/Import/VolumePreviewList.tsx`

This component renders the list of volumes with controls for editing titles, skipping, and reordering.

```tsx
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
```

### 3. Create `src/renderer/components/Import/ImportSeriesWizard.tsx`

The main wizard modal. Pattern follows `ImportWizard.tsx` closely.

```tsx
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
```

### 4. Update `src/renderer/components/Sidebar/BookSelector.tsx`

Read the file. Add the import and store hook near the other import-related imports:

```typescript
import { ImportSeriesWizard } from '../Import/ImportSeriesWizard';
import { useSeriesImportStore } from '../../stores/seriesImportStore';
```

Inside the component, add the store selectors alongside the existing import store selectors:

```typescript
const seriesImportStep = useSeriesImportStore((s) => s.step);
const startSeriesImport = useSeriesImportStore((s) => s.startImport);
```

Find the "Import" button (the one that calls `startImport()`). Add a new "Import Series" button next to it in the same button group:

```tsx
<button
  onClick={() => { startSeriesImport(); }}
  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
>
  <span>Import Series</span>
</button>
```

At the bottom of the component return (where `ImportWizard` is rendered), add the `ImportSeriesWizard`:

```tsx
{seriesImportStep !== 'idle' && <ImportSeriesWizard />}
```

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages
- [x] Application imports only from domain interfaces (not concrete classes)
- [x] IPC handlers are one-liner delegations
- [x] Renderer accesses backend only through `window.novelEngine`
- [x] All new IPC channels are namespaced (`import:selectFiles`, `import:seriesPreview`, `import:seriesCommit`)
- [x] All async operations have error handling
- [x] No `any` types
- [x] Store uses `import type` for domain types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. The "Import Series" button appears in the BookSelector dropdown
3. Clicking it opens the OS file picker with multi-select enabled
4. Selecting multiple files shows the series import wizard with previews
5. User can edit series name, author, volume titles, reorder, and skip volumes
6. User can select an existing series instead of creating a new one
7. Committing creates all books and links them to the series
8. Success screen shows total results with per-volume breakdown

---

## State Update

After completing this session, update `prompts/feature/import-series/STATE.md`:
- Set SESSION-04 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
