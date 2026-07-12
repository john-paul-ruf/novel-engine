import { useQueryStore } from '../../stores/queryStore';
import type { QueryTarget, QueryStatus, QueryLetter } from '@domain/types';

const STATUS_COLORS: Record<QueryStatus, string> = {
  'drafting': 'bg-zinc-500/15 text-zinc-400',
  'queried': 'bg-blue-500/15 text-blue-400',
  'partial-request': 'bg-amber-500/15 text-amber-400',
  'full-request': 'bg-purple-500/15 text-purple-400',
  'offer': 'bg-green-500/15 text-green-400',
  'rejected': 'bg-red-500/15 text-red-400',
  'withdrawn': 'bg-zinc-500/10 text-zinc-500',
};

const STATUS_LABELS: Record<QueryStatus, string> = {
  'drafting': 'Drafting',
  'queried': 'Queried',
  'partial-request': 'Partial Request',
  'full-request': 'Full Request',
  'offer': 'Offer',
  'rejected': 'Rejected',
  'withdrawn': 'Withdrawn',
};

const ALL_STATUSES: QueryStatus[] = ['drafting', 'queried', 'partial-request', 'full-request', 'offer', 'rejected', 'withdrawn'];

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function TargetCard({
  target,
  bookSlug,
  letter,
  onPreviewLetter,
}: {
  target: QueryTarget;
  bookSlug: string;
  letter: QueryLetter | null;
  onPreviewLetter: (slug: string) => void;
}): React.ReactElement {
  const updateTargetStatus = useQueryStore((s) => s.updateTargetStatus);
  const removeTarget = useQueryStore((s) => s.removeTarget);
  const generateLetter = useQueryStore((s) => s.generateLetter);
  const generatingFor = useQueryStore((s) => s.generatingFor);

  const targetSlug = slugify(target.name);
  const isGenerating = generatingFor === target.id;

  return (
    <div className="rounded-[13px] border border-ne-line bg-ne-bg1 p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-ne-serif text-base text-ne-ink">{target.name}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[target.status]}`}>
              {STATUS_LABELS[target.status]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ne-ink-dim">
            <span>{target.type}</span>
            {target.contact && <span>{target.contact}</span>}
            {target.submittedDate && <span>Sent: {target.submittedDate.split('T')[0]}</span>}
            {target.responseDate && <span>Response: {target.responseDate.split('T')[0]}</span>}
          </div>
          {target.personalizationNotes && (
            <p className="mt-1.5 text-xs text-ne-ink-faint">{target.personalizationNotes}</p>
          )}
          {target.notes && (
            <p className="mt-1 text-xs text-ne-ink-faint italic">{target.notes}</p>
          )}
        </div>
        <div className="ml-4 flex shrink-0 gap-1.5">
          {letter && (
            <button
              onClick={() => onPreviewLetter(targetSlug)}
              className="rounded-lg border border-ne-line px-3 py-1.5 text-xs text-ne-ink-dim transition-colors hover:bg-ne-bg2"
            >
              View Letter
            </button>
          )}
          <button
            onClick={() => generateLetter(bookSlug, target.id)}
            disabled={isGenerating}
            className="rounded-lg border border-ne-line px-3 py-1.5 text-xs text-ne-ink-dim transition-colors hover:bg-ne-bg2 disabled:opacity-50"
          >
            {isGenerating ? 'Generating…' : letter ? 'Regenerate' : 'Generate Letter'}
          </button>
          <button
            onClick={() => removeTarget(bookSlug, target.id)}
            className="rounded-lg border border-ne-line px-3 py-1.5 text-xs text-red-400/70 transition-colors hover:bg-red-500/10"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-ne-ink-faint">Status:</span>
        <select
          value={target.status}
          onChange={(e) => updateTargetStatus(bookSlug, target.id, e.target.value as QueryStatus)}
          className="rounded-md border border-ne-line bg-ne-bg0 px-2 py-1 text-xs text-ne-ink-dim focus:outline-none focus:border-ne-brass"
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {target.link && (
          <a
            href={target.link}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs text-blue-400 hover:underline"
          >
            Profile →
          </a>
        )}
      </div>
    </div>
  );
}