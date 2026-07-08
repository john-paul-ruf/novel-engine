import { useEffect, useState } from 'react';
import type { BuildFormat } from '@domain/types';
import { useBookStore } from '../../stores/bookStore';
import { usePaletteStore } from '../../stores/paletteStore';
import { useViewStore } from '../../stores/viewStore';
import {
  FORMAT_LABELS,
  KNOWN_FORMATS,
  OutputFiles,
  ProgressLog,
  useManuscriptBuild,
} from '../Build/BuildView';

// ── Palette registrations (S04 registry) ─────────────────────────────────────

let preselectFormatFromPalette: ((format: BuildFormat) => void) | null = null;

const hasActiveBook = (): boolean => useBookStore.getState().activeSlug !== '';

usePaletteStore.getState().registerItems([
  ...(['docx', 'epub', 'md'] as BuildFormat[]).map((format) => ({
    id: `action-export-${format}`,
    group: 'Actions' as const,
    label: `Export as ${FORMAT_LABELS[format]}`,
    icon: 'download' as const,
    keywords: ['export', 'build', format],
    enabled: hasActiveBook,
    run: () => {
      useViewStore.getState().navigate('exports');
      preselectFormatFromPalette?.(format);
    },
  })),
  {
    id: 'action-open-settings',
    group: 'Actions',
    label: 'Open Settings',
    icon: 'settings',
    keywords: ['preferences', 'providers', 'appearance'],
    run: () => useViewStore.getState().navigate('settings'),
  },
  {
    id: 'action-open-statistics',
    group: 'Actions',
    label: 'Open Statistics',
    icon: 'statistics',
    keywords: ['charts', 'usage', 'words'],
    run: () => useViewStore.getState().navigate('statistics'),
  },
]);

// ── View ──────────────────────────────────────────────────────────────────────

/**
 * Exports screen — BuildView's capability under the new chrome. The build
 * always produces every format (single backend operation); the format chips
 * mark the export you're after, e.g. when arriving via a palette action.
 */
export function ExportsView(): React.ReactElement {
  const { activeSlug, totalWordCount, books } = useBookStore();
  const { navigate } = useViewStore();
  const activeBook = books.find((b) => b.slug === activeSlug);

  const [selectedFormat, setSelectedFormat] = useState<BuildFormat>('epub');

  const {
    logs,
    isBuilding,
    isExporting,
    buildResult,
    pandocAvailable,
    exportMessage,
    hasSuccessfulFormats,
    handleBuild,
    handleExportZip,
  } = useManuscriptBuild(activeSlug);

  // Palette "Export as …" actions land here while the view is mounted.
  useEffect(() => {
    preselectFormatFromPalette = setSelectedFormat;
    return () => {
      preselectFormatFromPalette = null;
    };
  }, []);

  if (!activeSlug) {
    return (
      <div className="flex h-full items-center justify-center bg-ne-bg0 text-sm text-ne-ink-faint">
        Select a book from the Library
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-ne-bg0">
      <div className="mx-auto w-full max-w-3xl px-8 py-8">
        {/* Header */}
        <h1 className="font-ne-serif text-[26px] font-medium text-ne-ink">Exports</h1>
        {activeBook && (
          <div className="mt-1 text-sm text-ne-ink-dim">
            {activeBook.title} — {totalWordCount.toLocaleString()} words
          </div>
        )}

        {/* Pandoc warning */}
        {!pandocAvailable && (
          <div className="mt-6 rounded-lg border border-ne-spark/30 bg-ne-spark/10 px-4 py-3">
            <div className="text-sm font-medium text-ne-ink">Pandoc not found</div>
            <div className="mt-1 text-sm text-ne-ink-dim">
              Install Pandoc to generate output files.{' '}
              <button
                onClick={() => window.novelEngine.shell.openExternal('https://pandoc.org')}
                className="underline hover:text-ne-ink"
              >
                pandoc.org
              </button>
            </div>
          </div>
        )}

        {/* Build card */}
        <div className="mt-6 rounded-[13px] border border-ne-line bg-ne-bg1 p-5">
          <div className="flex flex-wrap items-center gap-1.5">
            {KNOWN_FORMATS.map((format) => (
              <button
                key={format}
                onClick={() => setSelectedFormat(format)}
                className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
                  format === selectedFormat
                    ? 'border-ne-brass/60 bg-ne-brass-dim text-ne-ink'
                    : 'border-ne-line bg-ne-bg2 text-ne-ink-dim hover:border-ne-brass/50 hover:text-ne-ink'
                }`}
              >
                {FORMAT_LABELS[format]}
              </button>
            ))}
            <span className="ml-2 text-[11px] text-ne-ink-faint">
              All formats are generated together
            </span>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => void handleBuild()}
              disabled={isBuilding || !pandocAvailable}
              className="rounded-[7px] bg-gradient-to-b from-ne-brass-hi to-ne-brass px-4 py-2 text-xs font-semibold text-ne-bg0 transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBuilding ? 'Building…' : 'Build manuscript'}
            </button>
            {hasSuccessfulFormats && (
              <button
                onClick={() => void handleExportZip()}
                disabled={isExporting}
                className="rounded-[7px] border border-ne-line px-4 py-2 text-xs font-medium text-ne-ink-dim transition-colors hover:border-ne-brass/50 hover:text-ne-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isExporting ? 'Exporting…' : 'Download All'}
              </button>
            )}
            {exportMessage && (
              <span
                className={`text-xs ${
                  exportMessage.startsWith('Saved') ? 'text-ne-lumen' : 'text-ne-sable'
                }`}
              >
                {exportMessage}
              </span>
            )}
            <button
              onClick={() => navigate('manuscript')}
              className="ml-auto text-[11px] text-ne-ink-dim transition-colors hover:text-ne-brass-hi"
            >
              Read it in Manuscript →
            </button>
          </div>

          {/* Streaming progress log (mono, reused) */}
          <div className="mt-4">
            <ProgressLog logs={logs} isBuilding={isBuilding} />
          </div>
        </div>

        {/* Output files (reused) */}
        {buildResult && <OutputFiles buildResult={buildResult} activeSlug={activeSlug} />}
      </div>
    </div>
  );
}
