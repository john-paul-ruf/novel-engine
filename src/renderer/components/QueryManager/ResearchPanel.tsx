import { useQueryStore } from '../../stores/queryStore';

export function ResearchPanel(): React.ReactElement {
  const isResearching = useQueryStore((s) => s.isResearching);
  const researchBuffer = useQueryStore((s) => s.researchBuffer);
  const researchTargets = useQueryStore((s) => s.researchTargets);

  if (!isResearching && researchBuffer === '') return <></>;

  return (
    <div className="mb-4 rounded-[13px] border border-ne-brass/30 bg-ne-bg1 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium text-ne-ink">
          {isResearching ? 'Researching targets…' : 'Research complete'}
        </span>
        {isResearching && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-ne-brass" />
        )}
      </div>
      {researchBuffer && (
        <div className="max-h-48 overflow-y-auto rounded-md bg-ne-bg0 p-3 text-xs text-ne-ink-dim whitespace-pre-wrap font-mono">
          {researchBuffer}
        </div>
      )}
      {!isResearching && researchBuffer && (
        <button
          onClick={() => researchTargets()}
          className="mt-2 text-xs text-ne-brass hover:underline"
        >
          Research again
        </button>
      )}
    </div>
  );
}