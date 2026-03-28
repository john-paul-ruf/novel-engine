import { create } from 'zustand';
import type {
  SeriesImportPreview,
  SeriesImportResult,
  SeriesImportVolume,
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
