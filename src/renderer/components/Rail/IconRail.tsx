import { useViewStore } from '../../stores/viewStore';
import { useBookStore } from '../../stores/bookStore';
import { Tooltip } from '../common/Tooltip';
import { Icon, type IconName } from '../common/Icon';

type RailView = 'library' | 'workspace' | 'manuscript' | 'exports' | 'statistics' | 'settings';

type RailItem = {
  view: RailView;
  icon: IconName;
  label: string;
  /** Requires an active book — dimmed with a hint tooltip otherwise. */
  needsBook?: boolean;
};

const TOP_ITEMS: RailItem[] = [
  { view: 'library', icon: 'library', label: 'Library — your bookshelf' },
  { view: 'workspace', icon: 'workspace', label: 'Workspace — pipeline & agent chat', needsBook: true },
  { view: 'manuscript', icon: 'manuscript', label: 'Manuscript — read & edit', needsBook: true },
  { view: 'exports', icon: 'exports', label: 'Exports — DOCX, EPUB, PDF', needsBook: true },
];

const BOTTOM_ITEMS: RailItem[] = [
  { view: 'statistics', icon: 'statistics', label: 'Statistics — usage & word counts' },
  { view: 'settings', icon: 'settings', label: 'Settings' },
];

function RailButton({ item, hasBook }: { item: RailItem; hasBook: boolean }): React.ReactElement {
  const currentView = useViewStore((s) => s.currentView);
  const navigate = useViewStore((s) => s.navigate);
  const isActive = currentView === item.view;
  const isDisabled = Boolean(item.needsBook) && !hasBook;

  return (
    <Tooltip content={isDisabled ? 'Select a book first' : item.label} placement="right">
      <button
        onClick={() => !isDisabled && navigate(item.view)}
        aria-label={item.label}
        aria-disabled={isDisabled}
        className={`no-drag relative grid h-[38px] w-[38px] place-items-center rounded-[9px] transition-colors ${
          isActive
            ? 'bg-ne-brass-dim text-ne-brass-hi'
            : isDisabled
              ? 'cursor-default text-ne-ink-faint opacity-40'
              : 'text-ne-ink-faint hover:bg-ne-bg2 hover:text-ne-ink-dim'
        }`}
      >
        {isActive && (
          <span className="absolute -left-[9px] top-[9px] bottom-[9px] w-0.5 rounded-sm bg-ne-brass" />
        )}
        <Icon name={item.icon} size={19} strokeWidth={1.6} />
      </button>
    </Tooltip>
  );
}

/**
 * 56px icon-only navigation rail — the Streamlined Workspace's primary nav.
 * Replaces the legacy sidebar bottom-nav list.
 */
export function IconRail(): React.ReactElement {
  const hasBook = useBookStore((s) => s.activeSlug !== '');

  return (
    <nav
      data-tour="rail"
      className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-ne-line bg-ne-bg1 py-2.5"
    >
      <div
        className="mb-2.5 grid h-8 w-8 place-items-center rounded-lg border border-[#4b3c22] text-[#e8c988]"
        style={{ background: 'linear-gradient(140deg,#3a2f1e,#241d12)' }}
      >
        <Icon name="logo" size={17} strokeWidth={1.7} />
      </div>
      {TOP_ITEMS.map((item) => (
        <RailButton key={item.view} item={item} hasBook={hasBook} />
      ))}
      <div className="flex-1" />
      {BOTTOM_ITEMS.map((item) => (
        <RailButton key={item.view} item={item} hasBook={hasBook} />
      ))}
    </nav>
  );
}
