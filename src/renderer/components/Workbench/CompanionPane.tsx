import { useEffect, useState } from 'react';
import type { CompanionTab } from '../../stores/workspaceStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { MotifLedgerView } from '../MotifLedger/MotifLedgerView';
import { ChapterTab } from './companion/ChapterTab';
import { ExplorerTab } from './companion/ExplorerTab';
import { ReportsTab } from './companion/ReportsTab';
import { SourcesTab } from './companion/SourcesTab';

const TABS: { id: CompanionTab; label: string }[] = [
  { id: 'chapter', label: 'Chapter' },
  { id: 'sources', label: 'Sources' },
  { id: 'reports', label: 'Reports' },
  { id: 'motifs', label: 'Motifs' },
  { id: 'explorer', label: 'Explorer' },
];

// ── Document routing (phase-header artifact chips) ───────────────────────────

export type CompanionDocRequest = {
  tab: 'sources' | 'reports';
  path: string;
  nonce: number;
};

const SOURCE_DOC_PATHS = new Set([
  'source/pitch.md',
  'source/scene-outline.md',
  'source/story-bible.md',
  'source/voice-profile.md',
]);

let requestNonce = 0;
let deliver: ((request: CompanionDocRequest) => void) | null = null;

/**
 * Open a document in the companion pane — source docs land in the Sources
 * tab, everything else in Reports. No-op while the workbench split isn't
 * mounted (locked phase / no book).
 */
export function openCompanionDoc(path: string): void {
  const tab = SOURCE_DOC_PATHS.has(path) ? 'sources' : 'reports';
  useWorkspaceStore.getState().setCompanionTab(tab);
  requestNonce += 1;
  deliver?.({ tab, path, nonce: requestNonce });
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Companion pane: tab bar bound to workspaceStore.companionTab. Tabs mount on
 * first visit and stay mounted (hidden) so reading position, doc selection,
 * and the Motif Ledger's state survive tab switches.
 */
export function CompanionPane(): React.ReactElement {
  const companionTab = useWorkspaceStore((s) => s.companionTab);
  const setCompanionTab = useWorkspaceStore((s) => s.setCompanionTab);
  const [docRequest, setDocRequest] = useState<CompanionDocRequest | null>(null);
  const [visited, setVisited] = useState<CompanionTab[]>(['chapter']);

  useEffect(() => {
    deliver = setDocRequest;
    return () => {
      deliver = null;
    };
  }, []);

  useEffect(() => {
    setVisited((prev) => (prev.includes(companionTab) ? prev : [...prev, companionTab]));
  }, [companionTab]);

  const paneClass = (tab: CompanionTab): string =>
    tab === companionTab ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'hidden';

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

      {visited.includes('chapter') && (
        <div className={paneClass('chapter')}>
          <ChapterTab />
        </div>
      )}
      {visited.includes('sources') && (
        <div className={paneClass('sources')}>
          <SourcesTab request={docRequest} />
        </div>
      )}
      {visited.includes('reports') && (
        <div className={paneClass('reports')}>
          <ReportsTab request={docRequest} />
        </div>
      )}
      {visited.includes('motifs') && (
        <div className={`${paneClass('motifs')} overflow-auto`}>
          <MotifLedgerView />
        </div>
      )}
      {visited.includes('explorer') && (
        <div className={paneClass('explorer')}>
          <ExplorerTab />
        </div>
      )}
    </div>
  );
}
