import type { DiffHunk, DiffLine, FileDiff } from '@domain/types';

type DiffViewerProps = {
  diff: FileDiff;
  className?: string;
};

function HunkHeader({ hunk }: { hunk: DiffHunk }): React.ReactElement {
  return (
    <div className="bg-ne-bg2 text-ne-ink-faint px-3 py-1 text-xs font-ne-mono border-y border-ne-line-soft">
      @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
    </div>
  );
}

function DiffLineRow({ line }: { line: DiffLine }): React.ReactElement {
  const bgClass =
    line.type === 'add'
      ? 'bg-ne-lumen/10'
      : line.type === 'remove'
        ? 'bg-ne-sable/10'
        : '';

  const textClass =
    line.type === 'add'
      ? 'text-ne-lumen'
      : line.type === 'remove'
        ? 'text-ne-sable'
        : 'text-ne-ink-dim';

  const prefix =
    line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';

  return (
    <div className={`flex font-ne-mono text-xs leading-5 ${bgClass}`}>
      {/* Old line number */}
      <span className="w-12 text-right pr-2 text-ne-ink-faint select-none shrink-0 border-r border-ne-line-soft">
        {line.oldLineNumber ?? ''}
      </span>
      {/* New line number */}
      <span className="w-12 text-right pr-2 text-ne-ink-faint select-none shrink-0 border-r border-ne-line-soft">
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
    <div className="flex items-center gap-3 px-3 py-2 bg-ne-bg1 border-b border-ne-line text-xs">
      {diff.totalAdditions > 0 && (
        <span className="text-ne-lumen font-medium">
          +{diff.totalAdditions} addition{diff.totalAdditions !== 1 ? 's' : ''}
        </span>
      )}
      {diff.totalDeletions > 0 && (
        <span className="text-ne-sable font-medium">
          -{diff.totalDeletions} deletion{diff.totalDeletions !== 1 ? 's' : ''}
        </span>
      )}
      {diff.totalAdditions === 0 && diff.totalDeletions === 0 && (
        <span className="text-ne-ink-faint">No changes</span>
      )}
    </div>
  );
}

export function DiffViewer({ diff, className = '' }: DiffViewerProps): React.ReactElement {
  if (diff.hunks.length === 0) {
    return (
      <div className={`flex items-center justify-center py-8 text-ne-ink-faint text-sm ${className}`}>
        No differences found
      </div>
    );
  }

  return (
    <div className={`border border-ne-line rounded-lg overflow-hidden ${className}`}>
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
