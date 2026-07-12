import type { QueryStatus, QuerySubmissionMethod, QueryTargetType } from '@domain/types';

type MethodFilter = 'all' | QuerySubmissionMethod;
type StatusFilter = 'all' | QueryStatus;
type TypeFilter = 'all' | QueryTargetType;

const METHOD_OPTIONS: { value: MethodFilter; label: string }[] = [
  { value: 'all', label: 'All Methods' },
  { value: 'email', label: 'Email Only' },
  { value: 'form', label: 'Website Only' },
  { value: 'query-manager', label: 'Query Manager Only' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'drafting', label: 'Drafting' },
  { value: 'queried', label: 'Queried' },
  { value: 'partial-request', label: 'Partial Request' },
  { value: 'full-request', label: 'Full Request' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'agent', label: 'Agents' },
  { value: 'publisher', label: 'Publishers' },
  { value: 'platform', label: 'Platforms' },
];

export function FilterBar({
  methodFilter,
  statusFilter,
  typeFilter,
  onMethodChange,
  onStatusChange,
  onTypeChange,
  activeFilterCount,
  onClearFilters,
}: {
  methodFilter: MethodFilter;
  statusFilter: StatusFilter;
  typeFilter: TypeFilter;
  onMethodChange: (value: MethodFilter) => void;
  onStatusChange: (value: StatusFilter) => void;
  onTypeChange: (value: TypeFilter) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}): React.ReactElement {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-ne-line bg-ne-bg1 px-3 py-2">
      <span className="text-xs text-ne-ink-faint">Filter:</span>

      <select
        value={methodFilter}
        onChange={(e) => onMethodChange(e.target.value as MethodFilter)}
        className="rounded-md border border-ne-line bg-ne-bg0 px-2 py-1 text-xs text-ne-ink-dim focus:outline-none focus:border-ne-brass"
      >
        {METHOD_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
        className="rounded-md border border-ne-line bg-ne-bg0 px-2 py-1 text-xs text-ne-ink-dim focus:outline-none focus:border-ne-brass"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={typeFilter}
        onChange={(e) => onTypeChange(e.target.value as TypeFilter)}
        className="rounded-md border border-ne-line bg-ne-bg0 px-2 py-1 text-xs text-ne-ink-dim focus:outline-none focus:border-ne-brass"
      >
        {TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {activeFilterCount > 0 && (
        <button
          onClick={onClearFilters}
          className="ml-auto text-xs text-ne-brass hover:underline"
        >
          Clear ({activeFilterCount})
        </button>
      )}
    </div>
  );
}