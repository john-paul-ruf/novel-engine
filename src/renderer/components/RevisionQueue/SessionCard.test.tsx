import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { RevisionSession, QueueMode } from '@domain/types';
import { SessionCard } from './SessionCard';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeRevisionSession } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useRevisionQueueStore);

function renderCard(
  session: RevisionSession,
  opts: Partial<{ isActive: boolean; isViewing: boolean; isSelected: boolean; mode: QueueMode; compact: boolean }> = {},
) {
  return renderApp(
    <SessionCard
      session={session}
      isActive={opts.isActive ?? false}
      isViewing={opts.isViewing ?? false}
      isSelected={opts.isSelected ?? false}
      mode={opts.mode ?? 'manual'}
      compact={opts.compact ?? false}
    />,
  );
}

describe('SessionCard', () => {
  it('renders index, title, model, and task metadata', () => {
    renderCard(
      makeRevisionSession({ index: 3, title: 'Tighten act two', chapters: ['05-x', '06-y'] }),
    );

    expect(screen.getByText(/Session 3: Tighten act two/)).toBeInTheDocument();
    expect(screen.getByText('Opus')).toBeInTheDocument();
    expect(screen.getByText('Tasks: 1, 2')).toBeInTheDocument();
    expect(screen.getByText('Chapters: 05-x, 06-y')).toBeInTheDocument();
  });

  it('compact mode abbreviates and hides metadata', () => {
    renderCard(makeRevisionSession({ index: 3, title: 'Tighten act two' }), { compact: true });

    expect(screen.getByText(/S3: Tighten act two/)).toBeInTheDocument();
    expect(screen.queryByText('Opus')).not.toBeInTheDocument();
    expect(screen.queryByText(/Tasks:/)).not.toBeInTheDocument();
  });

  it('clicking toggles the viewed session', () => {
    renderCard(makeRevisionSession({ id: 'sess-9' }));

    fireEvent.click(screen.getByRole('button'));
    expect(useRevisionQueueStore.getState().viewingSessionId).toBe('sess-9');
  });

  it('clicking an already-viewed card closes the panel', () => {
    renderCard(makeRevisionSession({ id: 'sess-9' }), { isViewing: true });

    fireEvent.click(screen.getByRole('button'));
    expect(useRevisionQueueStore.getState().viewingSessionId).toBeNull();
  });

  it('an active session auto-opens its panel and shows the Running badge', () => {
    renderCard(makeRevisionSession({ id: 'sess-9' }), { isActive: true });

    expect(useRevisionQueueStore.getState().viewingSessionId).toBe('sess-9');
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('selective mode shows a checkbox for pending sessions that toggles selection', () => {
    renderCard(makeRevisionSession({ id: 'sess-9' }), { mode: 'selective' });

    fireEvent.click(screen.getByRole('checkbox'));
    expect(useRevisionQueueStore.getState().selectedSessionIds.has('sess-9')).toBe(true);
    // Card click did not fire alongside the checkbox
    expect(useRevisionQueueStore.getState().viewingSessionId).toBeNull();
  });

  it('non-pending sessions never show the selective checkbox', () => {
    renderCard(makeRevisionSession({ status: 'approved' }), { mode: 'selective' });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('awaiting-approval shows the Review badge when not active', () => {
    renderCard(makeRevisionSession({ status: 'awaiting-approval' }));
    expect(screen.getByText('Review')).toBeInTheDocument();
  });
});
