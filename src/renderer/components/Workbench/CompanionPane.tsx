import type { CompanionTab } from '../../stores/workspaceStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const TABS: { id: CompanionTab; label: string }[] = [
  { id: 'chapter', label: 'Chapter' },
  { id: 'sources', label: 'Sources' },
  { id: 'reports', label: 'Reports' },
  { id: 'motifs', label: 'Motifs' },
  { id: 'explorer', label: 'Explorer' },
];

/**
 * Companion pane shell: tab bar bound to workspaceStore.companionTab.
 * Tab content arrives in SESSION-10.
 */
export function CompanionPane(): React.ReactElement {
  const companionTab = useWorkspaceStore((s) => s.companionTab);
  const setCompanionTab = useWorkspaceStore((s) => s.setCompanionTab);

  const activeLabel = TABS.find((t) => t.id === companionTab)?.label ?? '';

  return (
    <div className="flex h-full min-h-0 flex-col bg-ne-bg0">
      <div className="flex shrink-0 items-center gap-1 border-b border-ne-line-soft px-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setCompanionTab(tab.id)}
            className={`border-b-2 px-2.5 py-2 text-[11.5px] font-medium transition-colors ${
              tab.id === companionTab
                ? 'border-ne-brass text-ne-ink'
                : 'border-transparent text-ne-ink-faint hover:text-ne-ink-dim'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-ne-ink-faint">
        {activeLabel} — arrives in SESSION-10
      </div>
    </div>
  );
}
