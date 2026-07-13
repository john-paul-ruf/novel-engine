import { useEffect, useState } from 'react';
import { useBookStore } from '../../stores/bookStore';
import { useQueryStore } from '../../stores/queryStore';
import { TargetCard } from './TargetCard';
import { AddTargetForm } from './AddTargetForm';
import { LetterPreview } from './LetterPreview';
import { FilterBar } from './FilterBar';
import { ResearchPanel } from './ResearchPanel';
import type { QueryTarget, QueryStatus, QuerySubmissionMethod, QueryTargetType } from '@domain/types';

type MethodFilter = 'all' | QuerySubmissionMethod;
type StatusFilter = 'all' | QueryStatus;
type TypeFilter = 'all' | QueryTargetType;

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function QueryManagerView(): React.ReactElement {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const tracker = useQueryStore((s) => s.tracker);
  const letters = useQueryStore((s) => s.letters);
  const loading = useQueryStore((s) => s.loading);
  const error = useQueryStore((s) => s.error);
  const load = useQueryStore((s) => s.load);
  const clear = useQueryStore((s) => s.clear);
  const initStreamListener = useQueryStore((s) => s.initStreamListener);
  const researchTargets = useQueryStore((s) => s.researchTargets);
  const isResearching = useQueryStore((s) => s.isResearching);
  const lastResearchResult = useQueryStore((s) => s.lastResearchResult);

  const [showAddForm, setShowAddForm] = useState(false);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);

  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  useEffect(() => {
    initStreamListener();
  }, [initStreamListener]);

  useEffect(() => {
    if (activeSlug) {
      void load(activeSlug);
    } else {
      clear();
    }
  }, [activeSlug, load, clear]);

  if (!activeSlug) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ne-ink-faint">
        Select a book in the Library to manage queries
      </div>
    );
  }

  if (loading && !tracker) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ne-ink-faint">
        Loading query tracker…
      </div>
    );
  }

  const allTargets: QueryTarget[] = tracker?.targets ?? [];

  const statusCounts = allTargets.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  const filteredTargets = allTargets.filter((t) => {
    if (methodFilter !== 'all' && t.method !== methodFilter) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    return true;
  });

  const activeFilters = (methodFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0);

  return (
    <div className="h-full overflow-y-auto bg-ne-bg0 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-ne-serif text-xl text-ne-ink">Query Manager</h1>
            <p className="mt-1 text-xs text-ne-ink-dim">
              {allTargets.length} target{allTargets.length !== 1 ? 's' : ''} ·
              {' '}{statusCounts['queried'] ?? 0} queried ·
              {' '}{statusCounts['full-request'] ?? 0} full ·
              {' '}{statusCounts['offer'] ?? 0} offers ·
              {' '}{statusCounts['rejected'] ?? 0} rejected
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="rounded-lg bg-ne-brass px-4 py-2 text-sm font-medium text-ne-bg0 transition-colors hover:bg-ne-brass-hi"
          >
            + Add Target
          </button>
          <button
            onClick={() => researchTargets()}
            disabled={isResearching}
            className="rounded-lg border border-ne-brass/50 px-4 py-2 text-sm font-medium text-ne-brass transition-colors hover:bg-ne-brass/10 disabled:opacity-50"
          >
            {isResearching ? 'Researching…' : 'Research Targets'}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {lastResearchResult && !isResearching && (
          <div className="mb-4 rounded-lg border border-ne-brass/30 bg-ne-brass/10 p-3 text-sm text-ne-ink">
            Research complete — added {lastResearchResult.addedTargets} target
            {lastResearchResult.addedTargets !== 1 ? 's' : ''}
            {lastResearchResult.targetNames.length > 0 && (
              <>: {lastResearchResult.targetNames.join(', ')}</>
            )}
          </div>
        )}

        <ResearchPanel />

        {showAddForm && (
          <AddTargetForm
            bookSlug={activeSlug}
            onDone={() => setShowAddForm(false)}
          />
        )}

        {allTargets.length > 0 && (
          <FilterBar
            methodFilter={methodFilter}
            statusFilter={statusFilter}
            typeFilter={typeFilter}
            onMethodChange={setMethodFilter}
            onStatusChange={setStatusFilter}
            onTypeChange={setTypeFilter}
            activeFilterCount={activeFilters}
            onClearFilters={() => {
              setMethodFilter('all');
              setStatusFilter('all');
              setTypeFilter('all');
            }}
          />
        )}

        {filteredTargets.length === 0 && !showAddForm ? (
          <div className="rounded-[13px] border border-ne-line bg-ne-bg1 p-8 text-center">
            {allTargets.length === 0 ? (
              <p className="text-sm text-ne-ink-dim">
                No submission targets yet. Click "Add Target" to start tracking your queries.
              </p>
            ) : (
              <p className="text-sm text-ne-ink-dim">
                No targets match your current filters.{' '}
                <button
                  onClick={() => {
                    setMethodFilter('all');
                    setStatusFilter('all');
                    setTypeFilter('all');
                  }}
                  className="text-ne-brass hover:underline"
                >
                  Clear filters
                </button>
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTargets.map((target) => (
              <TargetCard
                key={target.id}
                target={target}
                bookSlug={activeSlug}
                letter={letters.find((l) => l.targetSlug === slugify(target.name)) ?? null}
                onPreviewLetter={(slug) => setPreviewSlug(slug)}
              />
            ))}
          </div>
        )}

        {previewSlug && (
          <LetterPreview
            bookSlug={activeSlug}
            targetSlug={previewSlug}
            onClose={() => setPreviewSlug(null)}
          />
        )}
      </div>
    </div>
  );
}