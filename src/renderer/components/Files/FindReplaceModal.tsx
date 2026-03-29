import { useState, useCallback } from 'react';
import { useBookStore } from '../../stores/bookStore';
import type {
  FindReplaceApplyResult,
  FindReplaceMatchLocation,
  FindReplaceOptions,
  FindReplacePreviewItem,
  FindReplacePreviewResult,
} from '@domain/types';

type FindReplaceModalProps = {
  onClose: () => void;
};

type Phase = 'input' | 'preview' | 'result';

// ─── Sub-components ────────────────────────────────────────────────

function ToggleButton({ label, title, active, onClick, disabled }: {
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
  disabled: boolean;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded px-2.5 py-1 text-xs font-mono font-semibold transition-colors disabled:opacity-50 ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  );
}

function InputSection({ searchTerm, replacement, caseSensitive, useRegex, disabled, onSearchChange, onReplacementChange, onCaseSensitiveChange, onUseRegexChange }: {
  searchTerm: string;
  replacement: string;
  caseSensitive: boolean;
  useRegex: boolean;
  disabled: boolean;
  onSearchChange: (v: string) => void;
  onReplacementChange: (v: string) => void;
  onCaseSensitiveChange: (v: boolean) => void;
  onUseRegexChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div className="space-y-3">
      {/* Search */}
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Search</label>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          disabled={disabled}
          placeholder="Find…"
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-blue-500 dark:focus:border-blue-400 disabled:opacity-50"
          autoFocus
        />
      </div>

      {/* Replacement */}
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Replace with
          <span className="ml-1 text-zinc-400 font-normal">(leave empty to delete matches)</span>
        </label>
        <input
          type="text"
          value={replacement}
          onChange={(e) => onReplacementChange(e.target.value)}
          disabled={disabled}
          placeholder="Replace with…"
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-blue-500 dark:focus:border-blue-400 disabled:opacity-50"
        />
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-3">
        <ToggleButton
          label="Aa"
          title="Case sensitive"
          active={caseSensitive}
          onClick={() => onCaseSensitiveChange(!caseSensitive)}
          disabled={disabled}
        />
        <ToggleButton
          label=".*"
          title="Regular expression"
          active={useRegex}
          onClick={() => onUseRegexChange(!useRegex)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function MatchLine({ location }: { location: FindReplaceMatchLocation }): React.ReactElement {
  const { lineNumber, lineText, matchStart, matchEnd } = location;
  const before = lineText.slice(0, matchStart);
  const match = lineText.slice(matchStart, matchEnd);
  const after = lineText.slice(matchEnd);

  // Truncate very long lines so the UI stays clean
  const truncatedBefore = before.length > 60 ? '\u2026' + before.slice(-57) : before;
  const truncatedAfter = after.length > 57 ? after.slice(0, 57) + '\u2026' : after;

  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="shrink-0 w-10 text-right font-mono text-zinc-400">{lineNumber}</span>
      <span className="font-mono text-zinc-600 dark:text-zinc-400 whitespace-pre">
        {truncatedBefore}
        <mark className="bg-yellow-200 dark:bg-yellow-800/60 text-yellow-900 dark:text-yellow-200 rounded-sm px-0.5 not-italic font-bold">
          {match}
        </mark>
        {truncatedAfter}
      </span>
    </div>
  );
}

function ChapterMatchRow({ item, checked, expanded, onToggle, onToggleExpand }: {
  item: FindReplacePreviewItem;
  checked: boolean;
  expanded: boolean;
  onToggle: () => void;
  onToggleExpand: () => void;
}): React.ReactElement {
  // Extract the chapter slug from "chapters/01-foo/draft.md"
  const parts = item.filePath.split('/');
  const chapterSlug = parts.length >= 2 ? parts[1] : item.filePath;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      {/* Row header */}
      <div className="flex items-center gap-3 px-3 py-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-4 w-4 rounded border-zinc-400 accent-blue-600"
        />
        <span className="flex-1 font-mono text-sm text-zinc-700 dark:text-zinc-300">{chapterSlug}</span>
        <span className="rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
          {item.matchCount}
        </span>
        <button
          onClick={onToggleExpand}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors text-xs"
          title={expanded ? 'Collapse' : 'Expand matches'}
        >
          {expanded ? '\u25b2' : '\u25bc'}
        </button>
      </div>

      {/* Expanded match locations */}
      {expanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 space-y-1">
          {item.matches.map((loc, idx) => (
            <MatchLine key={idx} location={loc} />
          ))}
          {item.matchCount > item.matches.length && (
            <p className="text-xs text-zinc-400 pt-1">
              \u2026and {item.matchCount - item.matches.length} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewSection({ preview, selectedPaths, expandedPaths, onTogglePath, onToggleExpand, onSelectAll, onDeselectAll }: {
  preview: FindReplacePreviewResult;
  selectedPaths: Set<string>;
  expandedPaths: Set<string>;
  onTogglePath: (filePath: string) => void;
  onToggleExpand: (filePath: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}): React.ReactElement {
  return (
    <div className="mt-4">
      {/* Summary bar */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{preview.totalMatchCount.toLocaleString()}</span>
          {' '}match{preview.totalMatchCount === 1 ? '' : 'es'} in{' '}
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{preview.items.length}</span>
          {' '}chapter{preview.items.length === 1 ? '' : 's'}
        </p>
        <div className="flex gap-2 text-xs">
          <button onClick={onSelectAll} className="text-blue-600 dark:text-blue-400 hover:underline">All</button>
          <span className="text-zinc-300 dark:text-zinc-600">|</span>
          <button onClick={onDeselectAll} className="text-blue-600 dark:text-blue-400 hover:underline">None</button>
        </div>
      </div>

      {preview.items.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-4">No matches found</p>
      )}

      {/* Chapter rows */}
      <div className="space-y-1">
        {preview.items.map((item) => (
          <ChapterMatchRow
            key={item.filePath}
            item={item}
            checked={selectedPaths.has(item.filePath)}
            expanded={expandedPaths.has(item.filePath)}
            onToggle={() => onTogglePath(item.filePath)}
            onToggleExpand={() => onToggleExpand(item.filePath)}
          />
        ))}
      </div>
    </div>
  );
}

function ResultSection({ result }: { result: FindReplaceApplyResult }): React.ReactElement {
  return (
    <div className="mt-4">
      <div className="mb-4 rounded-lg border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950 px-4 py-3">
        <p className="text-sm font-semibold text-green-800 dark:text-green-200">
          \u2713 Replaced {result.totalReplacements.toLocaleString()} occurrence{result.totalReplacements === 1 ? '' : 's'} in {result.filesChanged} chapter{result.filesChanged === 1 ? '' : 's'}
        </p>
        <p className="mt-1 text-xs text-green-700 dark:text-green-400">
          A version snapshot was created for each modified chapter. Use the History panel to revert if needed.
        </p>
      </div>

      {/* Per-file breakdown */}
      <div className="space-y-1">
        {result.details.map((d) => {
          const parts = d.filePath.split('/');
          const chapterSlug = parts.length >= 2 ? parts[1] : d.filePath;
          return (
            <div key={d.filePath} className="flex justify-between px-2 py-1 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-mono">{chapterSlug}</span>
              <span>{d.replacements} replacement{d.replacements === 1 ? '' : 's'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Modal Component ───────────────────────────────────────────

export function FindReplaceModal({ onClose }: FindReplaceModalProps): React.ReactElement {
  const { activeSlug } = useBookStore();

  // Input phase state
  const [searchTerm, setSearchTerm] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  // Async state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('input');

  // Preview state
  const [preview, setPreview] = useState<FindReplacePreviewResult | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Result state
  const [applyResult, setApplyResult] = useState<FindReplaceApplyResult | null>(null);

  const handlePreview = useCallback(async () => {
    if (!searchTerm.trim() || !activeSlug) return;

    setIsLoading(true);
    setError(null);

    try {
      const options: FindReplaceOptions = { caseSensitive, useRegex };
      const result = await window.novelEngine.findReplace.preview(
        activeSlug,
        searchTerm,
        options,
      );
      setPreview(result);
      // Pre-select all files that have matches
      setSelectedPaths(new Set(result.items.map((item) => item.filePath)));
      setPhase('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, caseSensitive, useRegex, activeSlug]);

  const handleApply = useCallback(async () => {
    if (!preview || !activeSlug || selectedPaths.size === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const options: FindReplaceOptions = { caseSensitive, useRegex };
      const result = await window.novelEngine.findReplace.apply({
        bookSlug: activeSlug,
        searchTerm,
        replacement,
        filePaths: Array.from(selectedPaths),
        options,
      });
      setApplyResult(result);
      setPhase('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replace failed');
    } finally {
      setIsLoading(false);
    }
  }, [preview, activeSlug, selectedPaths, searchTerm, replacement, caseSensitive, useRegex]);

  const handleSelectAll = () => {
    if (preview) setSelectedPaths(new Set(preview.items.map((i) => i.filePath)));
  };

  const handleDeselectAll = () => setSelectedPaths(new Set());

  const togglePath = (filePath: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const toggleExpand = (filePath: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Find &amp; Replace
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          >
            \u2715
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* Always-visible input fields */}
          <InputSection
            searchTerm={searchTerm}
            replacement={replacement}
            caseSensitive={caseSensitive}
            useRegex={useRegex}
            disabled={isLoading}
            onSearchChange={setSearchTerm}
            onReplacementChange={setReplacement}
            onCaseSensitiveChange={setCaseSensitive}
            onUseRegexChange={setUseRegex}
          />

          {/* Error banner */}
          {error && (
            <div className="mt-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Preview phase: results table */}
          {phase === 'preview' && preview && (
            <PreviewSection
              preview={preview}
              selectedPaths={selectedPaths}
              expandedPaths={expandedPaths}
              onTogglePath={togglePath}
              onToggleExpand={toggleExpand}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
            />
          )}

          {/* Result phase: summary */}
          {phase === 'result' && applyResult && (
            <ResultSection result={applyResult} />
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded px-4 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            {phase === 'result' ? 'Close' : 'Cancel'}
          </button>

          <div className="flex items-center gap-2">
            {phase === 'input' && (
              <button
                onClick={handlePreview}
                disabled={!searchTerm.trim() || isLoading}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Searching\u2026' : 'Preview'}
              </button>
            )}

            {phase === 'preview' && (
              <>
                <button
                  onClick={() => { setPhase('input'); setPreview(null); setError(null); }}
                  className="rounded px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                  \u2190 Back
                </button>
                <button
                  onClick={handleApply}
                  disabled={selectedPaths.size === 0 || isLoading}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? 'Replacing\u2026' : `Replace in ${selectedPaths.size} chapter${selectedPaths.size === 1 ? '' : 's'}`}
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
