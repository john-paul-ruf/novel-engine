import { useState, useEffect } from 'react';
import { AGENT_REGISTRY } from '@domain/constants';
import type { AgentName } from '@domain/types';
import { useFileChangeStore } from '../../stores/fileChangeStore';

type AgentOutputFile = {
  path: string;
  label: string;
  description: string;
};

type AgentOutputGroup = {
  agent: AgentName;
  files: AgentOutputFile[];
};

const AGENT_OUTPUTS: AgentOutputGroup[] = [
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
    ],
  },
];

type FileStatus = {
  exists: boolean;
  wordCount: number;
};

type AgentOutputPanelProps = {
  activeSlug: string;
  onFileSelect: (path: string) => void;
};

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function AgentOutputCard({
  file,
  exists,
  wordCount,
  agentColor,
  onSelect,
}: {
  file: { path: string; label: string; description: string };
  exists: boolean;
  wordCount: number;
  agentColor: string;
  onSelect: () => void;
}): React.ReactElement {
  if (!exists) {
    return (
      <div
        className="rounded-lg border border-zinc-200 dark:border-zinc-800 border-l-2 bg-zinc-50 dark:bg-zinc-900 p-3 opacity-50"
        style={{ borderLeftColor: agentColor }}
      >
        <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{file.label}</div>
        <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-600">Not yet generated</div>
      </div>
    );
  }

  return (
    <div
      onClick={onSelect}
      className="group relative cursor-pointer rounded-lg border border-zinc-200 dark:border-zinc-800 border-l-2 bg-zinc-50 dark:bg-zinc-900 p-3 transition-colors hover:border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-100 dark:bg-zinc-800/80"
      style={{ borderLeftColor: agentColor }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{file.label}</span>
        <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
          {wordCount.toLocaleString()}w
        </span>
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">{file.description}</div>
    </div>
  );
}

export function AgentOutputPanel({
  activeSlug,
  onFileSelect,
}: AgentOutputPanelProps): React.ReactElement {
  const revision = useFileChangeStore((s) => s.revision);
  const [fileStatuses, setFileStatuses] = useState<Record<string, FileStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const allFiles = AGENT_OUTPUTS.flatMap((group) => group.files);

    const loadStatuses = async () => {
      const result: Record<string, FileStatus> = {};

      await Promise.all(
        allFiles.map(async (file) => {
          try {
            const exists = await window.novelEngine.files.exists(activeSlug, file.path);
            let wordCount = 0;
            if (exists) {
              try {
                const content = await window.novelEngine.files.read(activeSlug, file.path);
                wordCount = countWords(content);
              } catch {
                // File exists but unreadable
              }
            }
            result[file.path] = { exists, wordCount };
          } catch {
            result[file.path] = { exists: false, wordCount: 0 };
          }
        }),
      );

      if (!cancelled) {
        setFileStatuses(result);
        setLoading(false);
      }
    };

    loadStatuses();

    return () => {
      cancelled = true;
    };
  }, [activeSlug, revision]);

  if (loading) {
    return (
      <div className="space-y-4">
        {AGENT_OUTPUTS.map((group) => (
          <div key={group.agent}>
            <div className="mb-2 h-4 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="grid grid-cols-2 gap-3">
              {group.files.map((file) => (
                <div
                  key={file.path}
                  className="h-[72px] animate-pulse rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-200/50 dark:bg-zinc-800/50"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {AGENT_OUTPUTS.map((group) => {
        const agentMeta = AGENT_REGISTRY[group.agent];
        return (
          <div key={group.agent}>
            {/* Agent header */}
            <div className="mb-2 flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: agentMeta.color }}
              />
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{group.agent}</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-600">— {agentMeta.role}</span>
            </div>

            {/* File cards */}
            <div className="grid grid-cols-2 gap-3">
              {group.files.map((file) => (
                <AgentOutputCard
                  key={file.path}
                  file={file}
                  exists={fileStatuses[file.path]?.exists ?? false}
                  wordCount={fileStatuses[file.path]?.wordCount ?? 0}
                  agentColor={agentMeta.color}
                  onSelect={() => onFileSelect(file.path)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
