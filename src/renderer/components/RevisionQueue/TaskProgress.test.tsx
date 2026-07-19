import { describe, it, expect } from 'vitest';
import { screen, render } from '@testing-library/react';
import { TaskProgress } from './TaskProgress';
import { makeRevisionPlan, makeRevisionSession } from '../../../test/novelEngineMock';

describe('TaskProgress', () => {
  it('summarises approved sessions, completed tasks, and percent', () => {
    render(
      <TaskProgress
        plan={makeRevisionPlan({
          sessions: [
            makeRevisionSession({ id: 's1', status: 'approved' }),
            makeRevisionSession({ id: 's2', index: 2, status: 'pending' }),
          ],
          totalTasks: 4,
          completedTaskNumbers: [1],
        })}
      />,
    );

    expect(screen.getByText('1/2 sessions')).toBeInTheDocument();
    expect(screen.getByText('1/4 tasks')).toBeInTheDocument();
    expect(screen.getByText('25% complete')).toBeInTheDocument();
  });

  it('shows 0% when the plan has no tasks', () => {
    render(
      <TaskProgress
        plan={makeRevisionPlan({ sessions: [], totalTasks: 0, completedTaskNumbers: [] })}
      />,
    );

    expect(screen.getByText('0% complete')).toBeInTheDocument();
  });
});
