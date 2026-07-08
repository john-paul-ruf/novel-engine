import { useEffect, useState } from 'react';
import { AGENT_REGISTRY, PHASE_OUTPUT_FILES } from '@domain/constants';
import type { AgentName, PipelinePhaseId } from '@domain/types';
import { useBookStore } from '../../../stores/bookStore';
import { useFileChangeStore } from '../../../stores/fileChangeStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { agentColor } from '../../common/agentColors';
import { Icon } from '../../common/Icon';
import { agentForPhase } from '../../PipelineSpine/stages';
import { ProseViewer, useBookFile } from '../../common/ProseViewer';
import { VersionHistoryModal } from '../../common/VersionHistoryModal';
import type { CompanionDocRequest } from '../CompanionPane';

type ReportFile = { path: string; label: string; description: string };

/**
 * Same report inventory AgentOutputPanel exposes — duplicated deliberately so
 * SESSION-14 can delete the Files components wholesale.
 */
const AGENT_REPORTS: { agent: AgentName; files: ReportFile[] }[] = [
  {
    agent: 'Ghostlight',
    files: [
      { path: 'source/reader-report.md', label: 'Reader Report', description: 'First cold-read impressions' },
      { path: 'source/reader-report-v1.md', label: 'Reader Report v2', description: 'Post-revision read' },
    ],
  },
  {
    agent: 'Lumen',
    files: [
      { path: 'source/dev-report.md', label: 'Dev Report', description: 'Structural analysis & recommendations' },
      { path: 'source/dev-report-v1.md', label: 'Dev Report v2', description: 'Post-revision assessment' },
    ],
  },
  {
    agent: 'Sable',
    files: [
      { path: 'source/audit-report.md', label: 'Audit Report', description: 'Copy-level issues & fixes' },
      { path: 'source/style-sheet.md', label: 'Style Sheet', description: 'Consistency rules for the manuscript' },
    ],
  },
  {
    agent: 'Forge',
    files: [
      { path: 'source/project-tasks.md', label: 'Project Tasks', description: 'Revision task breakdown' },
      { path: 'source/revision-prompts.md', label: 'Revision Prompts', description: 'Per-chapter fix instructions' },
      { path: 'source/project-tasks-v1.md', label: 'Project Tasks v2', description: 'Post-revision task breakdown' },
      { path: 'source/revision-prompts-v1.md', label: 'Revision Prompts v2', description: 'Post-revision fix instructions' },
    ],
  },
];

const ALL_REPORTS: (ReportFile & { agent: AgentName })[] = AGENT_REPORTS.flatMap((group) =>
  group.files.map((file) => ({ ...file, agent: group.agent })),
);

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/** The report a phase most plausibly wants open: its output, else its agent's first report. */
function reportForPhase(phaseId: string): string | null {
  const output = (PHASE_OUTPUT_FILES[phaseId as PipelinePhaseId] ?? []).find((path) =>
    ALL_REPORTS.some((report) => report.path === path),
  );
  if (output) return output;
  const agent = agentForPhase(phaseId);
  return AGENT_REPORTS.find((group) => group.agent === agent)?.files[0]?.path ?? null;
}

type DocStatus = { exists: boolean; wordCount: number };

/**
 * Agent reports, phase-aware: selecting an Assess/Revise phase preselects that
 * agent's report. Grouped list → typeset viewer with back navigation.
 */
export function ReportsTab({ request }: { request: CompanionDocRequest | null }): React.ReactElement {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const revision = useFileChangeStore((s) => s.revision);
  const selectedPhaseId = useWorkspaceStore((s) => s.selectedPhaseId);
  const [statuses, setStatuses] = useState<Record<string, DocStatus>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [historyPath, setHistoryPath] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSlug) return;
    let cancelled = false;

    Promise.all(
      ALL_REPORTS.map(async (report) => {
        try {
          const exists = await window.novelEngine.files.exists(activeSlug, report.path);
          let wordCount = 0;
          if (exists) {
            try {
              wordCount = countWords(await window.novelEngine.files.read(activeSlug, report.path));
            } catch {
              // Exists but unreadable — treat as 0 words
            }
          }
          return [report.path, { exists, wordCount }] as const;
        } catch {
          return [report.path, { exists: false, wordCount: 0 }] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setStatuses(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [activeSlug, revision]);

  useEffect(() => {
    setSelected(null);
    setHistoryPath(null);
  }, [activeSlug]);

  // Phase-aware preselect — re-applies when the workspace phase changes.
  useEffect(() => {
    if (!selectedPhaseId) return;
    const report = reportForPhase(selectedPhaseId);
    if (report) setSelected(report);
  }, [selectedPhaseId]);

  // Phase-header artifact chips route here.
  useEffect(() => {
    if (request?.tab === 'reports') setSelected(request.path);
  }, [request]);

  const selectedReport = ALL_REPORTS.find((report) => report.path === selected) ?? null;
  const selectedStatus = selected ? statuses[selected] : undefined;
  const { content, loading, error } = useBookFile(
    activeSlug,
    selectedStatus?.exists ? selected : null,
  );

  // ── Viewer ────────────────────────────────────────────────────────────────
  if (selected) {
    const label = selectedReport?.label ?? selected.split('/').pop() ?? selected;
    const agent = selectedReport?.agent ?? null;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-ne-line-soft px-3 py-2">
          <button
            onClick={() => setSelected(null)}
            title="All reports"
            className="flex items-center gap-1 rounded-md border border-ne-line bg-ne-bg2 px-2 py-1 text-[11px] text-ne-ink-dim transition-colors hover:border-ne-brass/50 hover:text-ne-ink"
          >
            <Icon name="chevronRight" size={10} strokeWidth={2} className="rotate-180" />
            Reports
          </button>
          {agent && (
            <span
              className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: agentColor(agent) }}
            />
          )}
          <span className="min-w-0 truncate text-[11.5px] font-medium text-ne-ink">{label}</span>
          {selectedStatus?.exists && selectedStatus.wordCount > 0 && (
            <span className="shrink-0 text-[10px] tabular-nums text-ne-ink-faint">
              {selectedStatus.wordCount.toLocaleString()}w
            </span>
          )}
          {selectedStatus?.exists && (
            <button
              onClick={() => setHistoryPath(selected)}
              title="Version history"
              className="ml-auto flex shrink-0 items-center gap-1 rounded-md border border-ne-line bg-ne-bg2 px-2 py-1 text-[11px] text-ne-ink-dim transition-colors hover:border-ne-brass/50 hover:text-ne-ink"
            >
              <Icon name="history" size={10} strokeWidth={2} />
              History
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6 pb-14">
          {selectedStatus && !selectedStatus.exists ? (
            <div className="pt-8 text-center text-sm text-ne-ink-faint">
              {label} — not yet generated.
            </div>
          ) : error ? (
            <div className="pt-8 text-center text-sm text-ne-ink-faint">{error}</div>
          ) : loading ? (
            <div className="pt-8 text-center text-sm text-ne-ink-faint">Loading…</div>
          ) : (
            <ProseViewer content={content} />
          )}
        </div>

        {historyPath && activeSlug && (
          <VersionHistoryModal
            bookSlug={activeSlug}
            filePath={historyPath}
            onClose={() => setHistoryPath(null)}
          />
        )}
      </div>
    );
  }

  // ── Grouped list ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
      {AGENT_REPORTS.map((group) => (
        <div key={group.agent}>
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className="inline-block h-[7px] w-[7px] rounded-full"
              style={{ background: agentColor(group.agent) }}
            />
            <span className="text-[11px] font-medium text-ne-ink-dim">{group.agent}</span>
            <span className="text-[11px] text-ne-ink-faint">
              — {AGENT_REGISTRY[group.agent].role}
            </span>
          </div>
          <div className="space-y-1">
            {group.files.map((file) => {
              const status = statuses[file.path];
              if (!status?.exists) {
                return (
                  <div
                    key={file.path}
                    className="rounded-md border border-ne-line-soft px-2.5 py-1.5 opacity-60"
                  >
                    <div className="text-[11.5px] text-ne-ink-faint">{file.label}</div>
                    <div className="text-[10px] text-ne-ink-faint">Not yet generated</div>
                  </div>
                );
              }
              return (
                <button
                  key={file.path}
                  onClick={() => setSelected(file.path)}
                  className="block w-full rounded-md border border-ne-line bg-ne-bg1 px-2.5 py-1.5 text-left transition-colors hover:border-ne-brass/50 hover:bg-ne-bg2"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-ne-ink">
                      {file.label}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-ne-ink-faint">
                      {status.wordCount.toLocaleString()}w
                    </span>
                  </div>
                  <div className="text-[10px] text-ne-ink-dim">{file.description}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
