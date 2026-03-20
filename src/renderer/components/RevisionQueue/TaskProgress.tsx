import type { RevisionPlan } from '@domain/types';

type Props = {
  plan: RevisionPlan;
};

export function TaskProgress({ plan }: Props) {
  const completed = plan.completedTaskNumbers.length;
  const total = plan.totalTasks;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const sessionsApproved = plan.sessions.filter(s => s.status === 'approved').length;
  const totalSessions = plan.sessions.length;

  return (
    <div className="mt-1">
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span>{sessionsApproved}/{totalSessions} sessions</span>
        <span className="text-zinc-600">|</span>
        <span>{completed}/{total} tasks</span>
        <span className="text-zinc-600">|</span>
        <span>{percent}% complete</span>
      </div>
      <div className="mt-1.5 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
