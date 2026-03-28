import type { DiffHunk, DiffLine, FileDiff } from '@domain/types';

type DiffViewerProps = {
  diff: FileDiff;
  className?: string;
};

function HunkHeader({ hunk }: { hunk: DiffHunk }): React.ReactElement {
  return (
    <div className="bg-zinc-800 text-zinc-400 px-3 py-1 text-xs font-mono border-y border-zinc-700">
      @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
    </div>
  );
}

function DiffLineRow({ line }: { line: DiffLine }): React.ReactElement {
  const bgClass =
    line.type === 'add'
      ? 'bg-green-950/40'
      : line.type === 'remove'
        ? 'bg-red-950/40'
        : '';

  const textClass =
    line.type === 'add'
      ? 'text-green-300'
      : line.type === 'remove'
        ? 'text-red-300'
        : 'text-zinc-400';

  const prefix =
    line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';

  return (
    <div className={`flex font-mono text-xs leading-5 ${bgClass}`}>
      {/* Old line number */}
      <span className="w-12 text-right pr-2 text-zinc-600 select-none shrink-0 border-r border-zinc-800">
        {line.oldLineNumber ?? ''}
      </span>
      {/* New line number */}
      <span className="w-12 text-right pr-2 text-zinc-600 select-none shrink-0 border-r border-zinc-800">
        {line.newLineNumber ?? ''}
      </span>
      {/* Prefix */}
      <span className={`w-5 text-center select-none shrink-0 ${textClass}`}>
        {prefix}
      </span>
      {/* Content */}
      <span className={`flex-1 px-2 whitespace-pre-wrap break-all ${textClass}`}>
        {line.content}
      </span>
    </div>
  );
}

function DiffSummary({ diff }: { diff: FileDiff }): React.ReactElement {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-zinc-900 border-b border-zinc-700 text-xs">
      {diff.totalAdditions > 0 && (
        <span className="text-green-400 font-medium">
          +{diff.totalAdditions} addition{diff.totalAdditions !== 1 ? 's' : ''}
        </span>
      )}
      {diff.totalDeletions > 0 && (
        <span className="text-red-400 font-medium">
          -{diff.totalDeletions} deletion{diff.totalDeletions !== 1 ? 's' : ''}
        </span>
      )}
      {diff.totalAdditions === 0 && diff.totalDeletions === 0 && (
        <span className="text-zinc-500">No changes</span>
      )}
    </div>
  );
}

export function DiffViewer({ diff, className = '' }: DiffViewerProps): React.ReactElement {
  if (diff.hunks.length === 0) {
    return (
      <div className={`flex items-center justify-center py-8 text-zinc-500 text-sm ${className}`}>
        No differences found
      </div>
    );
  }

  return (
    <div className={`border border-zinc-700 rounded-lg overflow-hidden ${className}`}>
      <DiffSummary diff={diff} />
      <div className="overflow-auto max-h-[600px]">
        {diff.hunks.map((hunk, hunkIdx) => (
          <div key={hunkIdx}>
            <HunkHeader hunk={hunk} />
            {hunk.lines.map((line, lineIdx) => (
              <DiffLineRow key={`${hunkIdx}-${lineIdx}`} line={line} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
