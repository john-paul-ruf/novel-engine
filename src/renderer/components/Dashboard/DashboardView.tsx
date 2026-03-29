import { useEffect } from 'react';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useBookStore } from '../../stores/bookStore';
import { useViewStore } from '../../stores/viewStore';
import type { BookDashboardData, RevisionTaskItem, RecentFile } from '@domain/types';
import { AGENT_REGISTRY, PIPELINE_PHASES } from '@domain/constants';
import type { AgentName } from '@domain/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function statusBadgeColor(status: string): string {
  switch (status) {
    case 'scaffolded':
    case 'outlining':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    case 'first-draft':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'revision-1':
    case 'revision-2':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
    case 'copy-edit':
      return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
    case 'final':
    case 'published':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    default:
      return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300';
  }
}

/** Format a phase status into a visual indicator class. */
function phaseIndicator(phase: { id: string; status: string }, currentPhaseId: string | null): string {
  if (phase.id === currentPhaseId) {
    return 'bg-blue-500 ring-2 ring-blue-400 animate-pulse';
  }
  switch (phase.status) {
    case 'complete':
      return 'bg-green-500';
    case 'pending-completion':
      return 'bg-amber-500';
    default:
      return 'bg-zinc-600 dark:bg-zinc-700';
  }
}

// ---------------------------------------------------------------------------
// Card Components
// ---------------------------------------------------------------------------

const cardClass = 'rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4';

function PipelineCard({ pipeline }: { pipeline: BookDashboardData['pipeline'] }): React.ReactElement {
  const currentPhaseId = pipeline.currentPhase?.id ?? null;

  // Build phase status lookup from PIPELINE_PHASES constant
  const phaseStatuses = PIPELINE_PHASES.map((p) => {
    const idx = PIPELINE_PHASES.findIndex((pp) => pp.id === p.id);
    const currentIdx = pipeline.currentPhase
      ? PIPELINE_PHASES.findIndex((pp) => pp.id === pipeline.currentPhase!.id)
      : -1;

    let status: string;
    if (idx < currentIdx) {
      status = 'complete';
    } else if (idx === currentIdx) {
      status = pipeline.currentPhase?.status ?? 'active';
    } else {
      status = 'locked';
    }

    return { id: p.id, label: p.label, status };
  });

  // Find the next phase after the current one
  const currentIdx = pipeline.currentPhase
    ? PIPELINE_PHASES.findIndex((p) => p.id === pipeline.currentPhase!.id)
    : -1;
  const nextPhase = currentIdx >= 0 && currentIdx < PIPELINE_PHASES.length - 1
    ? PIPELINE_PHASES[currentIdx + 1]
    : null;

  return (
    <div className={`${cardClass} col-span-2`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Pipeline Progress</h3>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {pipeline.completedCount} / {pipeline.totalCount} phases
        </span>
      </div>

      {pipeline.currentPhase && (
        <div className="mb-3 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Current: </span>
          <span className="font-medium text-blue-600 dark:text-blue-400">
            {pipeline.currentPhase.label}
          </span>
          {nextPhase && (
            <span className="ml-3 text-zinc-400 dark:text-zinc-500">
              Next: {nextPhase.label}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {phaseStatuses.map((phase) => (
          <div key={phase.id} className="group relative">
            <div
              className={`h-3 w-3 rounded-full ${phaseIndicator(phase, currentPhaseId)}`}
              title={phase.label}
            />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
              <div className="rounded bg-zinc-800 dark:bg-zinc-700 px-2 py-1 text-xs text-white whitespace-nowrap">
                {phase.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WordCountCard({ wordCount }: { wordCount: BookDashboardData['wordCount'] }): React.ReactElement {
  const maxChapterWords = wordCount.perChapter.length > 0
    ? Math.max(...wordCount.perChapter.map((ch) => ch.wordCount))
    : 0;

  return (
    <div className={cardClass}>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Word Count</h3>
      <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">
        {wordCount.current.toLocaleString()}
      </div>
      {wordCount.target !== null && (
        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
          Target: {wordCount.target.toLocaleString()} ({Math.round((wordCount.current / wordCount.target) * 100)}%)
        </div>
      )}
      {wordCount.perChapter.length > 0 && (
        <div className="space-y-1.5 mt-3">
          {wordCount.perChapter.map((ch) => (
            <div key={ch.slug} className="flex items-center gap-2">
              <span className="w-16 truncate text-xs text-zinc-500 dark:text-zinc-400" title={ch.slug}>
                {ch.slug}
              </span>
              <div className="flex-1 h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: maxChapterWords > 0 ? `${(ch.wordCount / maxChapterWords) * 100}%` : '0%' }}
                />
              </div>
              <span className="w-12 text-right text-xs text-zinc-500 dark:text-zinc-400">
                {ch.wordCount.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LastInteractionCard({ interaction }: { interaction: BookDashboardData['lastInteraction'] }): React.ReactElement {
  const navigate = useViewStore((s) => s.navigate);

  if (!interaction) {
    return (
      <div className={cardClass}>
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Last Interaction</h3>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">No conversations yet</p>
      </div>
    );
  }

  const agentColor = AGENT_REGISTRY[interaction.agentName as AgentName]?.color ?? '#71717A';

  return (
    <div className={cardClass}>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Last Interaction</h3>
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: agentColor }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {interaction.agentName}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate" title={interaction.conversationTitle}>
            {interaction.conversationTitle}
          </div>
          <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            {relativeTime(interaction.timestamp)}
          </div>
        </div>
      </div>
      <button
        onClick={() => navigate('chat')}
        className="mt-3 w-full rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 transition-colors"
      >
        Resume Chat
      </button>
    </div>
  );
}

function RevisionTasksCard({ tasks }: { tasks: BookDashboardData['revisionTasks'] }): React.ReactElement {
  const progress = tasks.total > 0 ? (tasks.completed / tasks.total) * 100 : 0;
  const pendingItems = tasks.items.filter((t: RevisionTaskItem) => !t.isCompleted).slice(0, 5);

  return (
    <div className={cardClass}>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Revision Tasks</h3>

      {tasks.total === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">No revision tasks yet</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">
              {tasks.completed} / {tasks.total}
            </span>
          </div>

          {pendingItems.length > 0 && (
            <ul className="space-y-1 mt-3">
              {pendingItems.map((task: RevisionTaskItem) => (
                <li key={task.taskNumber} className="flex items-start gap-2 text-xs">
                  <span className="text-zinc-400 dark:text-zinc-500 mt-px shrink-0">
                    {task.taskNumber}.
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400 line-clamp-2">
                    {task.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function RecentFilesCard({ files }: { files: RecentFile[] }): React.ReactElement {
  const navigate = useViewStore((s) => s.navigate);

  return (
    <div className={`${cardClass} col-span-2`}>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Recent Files</h3>
      {files.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">No recent files</p>
      ) : (
        <ul className="space-y-1">
          {files.map((file: RecentFile) => (
            <li key={file.path}>
              <button
                onClick={() => navigate('files', { filePath: file.path })}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group"
              >
                <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate group-hover:text-zinc-900 dark:group-hover:text-zinc-200">
                  {file.path}
                </span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0 ml-2">
                  {relativeTime(file.modifiedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DashboardView(): React.ReactElement {
  const { data, loading, error, load } = useDashboardStore();
  const activeSlug = useBookStore((s) => s.activeSlug);

  useEffect(() => {
    if (activeSlug) {
      load(activeSlug);
    }
  }, [activeSlug, load]);

  // Empty state — no book selected
  if (!activeSlug) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">&#x1F4DA;</div>
          <h2 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
            No Book Selected
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Create or select a book to see your project dashboard.
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading dashboard...</div>
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-2">&#x26A0;&#xFE0F;</div>
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          <button
            onClick={() => load(activeSlug)}
            className="mt-3 rounded-md bg-blue-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return <div />;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 truncate">
            {data.bookTitle}
          </h1>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeColor(data.bookStatus)}`}>
            {data.bookStatus}
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
            {data.daysInProgress} {data.daysInProgress === 1 ? 'day' : 'days'} in progress
          </span>
          {loading && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">Refreshing...</span>
          )}
        </div>

        {/* Card Grid */}
        <div className="grid grid-cols-2 gap-4">
          <PipelineCard pipeline={data.pipeline} />
          <WordCountCard wordCount={data.wordCount} />
          <LastInteractionCard interaction={data.lastInteraction} />
          <RevisionTasksCard tasks={data.revisionTasks} />
          <RecentFilesCard files={data.recentFiles} />
        </div>
      </div>
    </div>
  );
}
