import { useState, useEffect, useRef, useCallback } from 'react';
import { useBookStore } from '../../stores/bookStore';
import type { BuildFormat, BuildResult } from '@domain/types';

const FORMAT_LABELS: Record<BuildFormat, string> = {
  md: 'Markdown',
  docx: 'Word Document',
  epub: 'EPUB',
  pdf: 'PDF',
};

const FORMAT_ICONS: Record<BuildFormat, string> = {
  md: '📄',
  docx: '📝',
  epub: '📚',
  pdf: '📕',
};

/** Formats produced by BuildService, in display order. */
const KNOWN_OUTPUT_FILES: { filename: string; format: BuildFormat }[] = [
  { filename: 'output.md',   format: 'md'   },
  { filename: 'output.docx', format: 'docx' },
  { filename: 'output.epub', format: 'epub' },
  { filename: 'output.pdf',  format: 'pdf'  },
];

function ProgressLog({
  logs,
  isBuilding,
}: {
  logs: string[];
  isBuilding: boolean;
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  if (logs.length === 0 && !isBuilding) {
    return (
      <div className="rounded-lg bg-white dark:bg-zinc-950 p-4 text-sm text-zinc-400 dark:text-zinc-600 font-mono">
        Build output will appear here...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="max-h-80 overflow-y-auto rounded-lg bg-white dark:bg-zinc-950 p-4 font-mono text-sm"
    >
      {logs.map((line, i) => {
        let colorClass = 'text-green-600 dark:text-green-400';
        if (line.startsWith('ERROR') || line.includes('failed:')) {
          colorClass = 'text-red-600 dark:text-red-400';
        } else if (line.includes('...') && !line.includes('✓')) {
          colorClass = 'text-zinc-500 dark:text-zinc-400';
        }

        return (
          <div key={i} className={colorClass}>
            {line}
          </div>
        );
      })}
      {isBuilding && (
        <span className="inline-block animate-pulse text-green-600 dark:text-green-400">▊</span>
      )}
    </div>
  );
}

function OutputFiles({
  buildResult,
  activeSlug,
}: {
  buildResult: BuildResult;
  activeSlug: string;
}): React.ReactElement {
  const successFormats = buildResult.formats.filter((f) => !f.error);

  if (successFormats.length === 0) return <></>;

  const handleOpenFile = async (format: BuildFormat) => {
    try {
      const absPath = await window.novelEngine.books.getAbsolutePath(
        activeSlug,
        `dist/output.${format}`,
      );
      await window.novelEngine.shell.openPath(absPath);
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  const handleOpenFolder = async () => {
    try {
      const absPath = await window.novelEngine.books.getAbsolutePath(activeSlug, 'dist');
      await window.novelEngine.shell.openPath(absPath);
    } catch (error) {
      console.error('Failed to open dist folder:', error);
    }
  };

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Output Files</h3>
        <button
          onClick={handleOpenFolder}
          className="rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100"
          title="Open the dist folder in your file manager"
        >
          Open Folder
        </button>
      </div>
      <div className="space-y-2">
        {buildResult.formats.map((entry) => (
          <div
            key={entry.format}
            className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{FORMAT_ICONS[entry.format]}</span>
              <div>
                <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  output.{entry.format}
                </div>
                <div className="text-xs text-zinc-500">
                  {FORMAT_LABELS[entry.format]}
                </div>
              </div>
            </div>
            {entry.error ? (
              <span className="text-xs text-red-600 dark:text-red-400">{entry.error}</span>
            ) : (
              <button
                onClick={() => handleOpenFile(entry.format)}
                className="rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              >
                Open
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BuildView(): React.ReactElement {
  const { activeSlug, totalWordCount, books } = useBookStore();
  const activeBook = books.find((b) => b.slug === activeSlug);

  const [logs, setLogs] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const [pandocAvailable, setPandocAvailable] = useState(true);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  /**
   * Scan the dist/ directory for previously-built output files and populate
   * buildResult from disk so the Output Files panel is visible immediately
   * on any visit to this view — not just after running a fresh build.
   */
  const loadExistingOutputs = useCallback(async (slug: string) => {
    try {
      const entries = await window.novelEngine.files.listDir(slug, 'dist');
      const formats: BuildResult['formats'] = [];

      for (const { filename, format } of KNOWN_OUTPUT_FILES) {
        const found = entries.find((e) => !e.isDirectory && e.name === filename);
        if (found) {
          formats.push({ format, path: found.path });
        }
      }

      if (formats.length > 0) {
        setBuildResult({ success: true, formats, wordCount: 0 });
      }
    } catch {
      // dist/ does not exist yet — normal for new books, ignore
    }
  }, []);

  // Check Pandoc availability once on mount
  useEffect(() => {
    window.novelEngine.build.isPandocAvailable().then(setPandocAvailable).catch(() => {
      setPandocAvailable(false);
    });
  }, []);

  // Whenever the active book changes, scan for existing build artifacts
  useEffect(() => {
    if (!activeSlug) return;
    // Only pre-populate if we don't already have a fresh in-session build result
    setBuildResult(null);
    setLogs([]);
    void loadExistingOutputs(activeSlug);
  }, [activeSlug, loadExistingOutputs]);

  useEffect(() => {
    const cleanup = window.novelEngine.build.onProgress((msg: string) => {
      setLogs((prev) => [...prev, msg]);
    });
    return () => { cleanup(); };
  }, []);

  const handleBuild = async () => {
    if (!activeSlug) return;
    setLogs([]);
    setBuildResult(null);
    setIsBuilding(true);
    setExportMessage(null);

    try {
      const result = await window.novelEngine.build.run(activeSlug);
      setBuildResult(result);
    } catch (error) {
      setLogs((prev) => [
        ...prev,
        `ERROR: ${error instanceof Error ? error.message : 'Build failed'}`,
      ]);
    } finally {
      setIsBuilding(false);
    }
  };

  const handleExportZip = async () => {
    if (!activeSlug) return;
    setIsExporting(true);
    setExportMessage(null);

    try {
      const savedPath = await window.novelEngine.build.exportZip(activeSlug);
      if (savedPath) {
        setExportMessage(`Saved to ${savedPath}`);
        setTimeout(() => setExportMessage(null), 5000);
      }
    } catch (error) {
      console.error('Failed to export zip:', error);
      setExportMessage('Export failed');
      setTimeout(() => setExportMessage(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenPandocSite = () => {
    window.novelEngine.shell.openExternal('https://pandoc.org');
  };

  const hasSuccessfulFormats =
    buildResult && buildResult.formats.some((f) => !f.error);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Build Manuscript</h1>
          {activeBook && (
            <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {activeBook.title} — {totalWordCount.toLocaleString()} words
            </div>
          )}
        </div>

        {/* Pandoc Warning */}
        {!pandocAvailable && (
          <div className="mb-4 rounded-lg border border-amber-800 bg-amber-950 px-4 py-3">
            <div className="text-sm font-medium text-amber-300">
              Pandoc not found
            </div>
            <div className="mt-1 text-sm text-amber-600 dark:text-amber-400/80">
              Install Pandoc to generate output files.{' '}
              <button
                onClick={handleOpenPandocSite}
                className="underline hover:text-amber-300"
              >
                pandoc.org
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={handleBuild}
            disabled={isBuilding || !pandocAvailable || !activeSlug}
            className="rounded-lg bg-green-700 px-4 py-2 font-medium text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBuilding ? 'Building...' : 'Build All Formats'}
          </button>

          {hasSuccessfulFormats && (
            <button
              onClick={handleExportZip}
              disabled={isExporting}
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExporting ? 'Exporting...' : 'Download All'}
            </button>
          )}
        </div>

        {/* Export success message */}
        {exportMessage && (
          <div
            className={`mb-4 text-sm ${
              exportMessage.startsWith('Saved') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {exportMessage}
          </div>
        )}

        {/* Progress Log */}
        <ProgressLog logs={logs} isBuilding={isBuilding} />

        {/* Output Files */}
        {buildResult && (
          <OutputFiles buildResult={buildResult} activeSlug={activeSlug} />
        )}
      </div>
    </div>
  );
}
