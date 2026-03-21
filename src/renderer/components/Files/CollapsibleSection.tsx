import { useState } from 'react';

type CollapsibleSectionProps = {
  title: string;
  badge?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
};

export function CollapsibleSection({
  title,
  badge,
  defaultExpanded = true,
  children,
}: CollapsibleSectionProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div>
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 py-2 text-left"
      >
        <span className="text-xs text-zinc-500">{expanded ? '▾' : '▸'}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {title}
        </span>
        {badge && (
          <span className="text-xs text-zinc-400 dark:text-zinc-600">{badge}</span>
        )}
      </button>
      {expanded && <div className="pb-6">{children}</div>}
    </div>
  );
}
