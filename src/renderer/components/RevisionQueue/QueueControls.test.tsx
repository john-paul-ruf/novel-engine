import { describe, it, expect } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { RevisionPlan } from '@domain/types';
import { QueueControls } from './QueueControls';
import { useRevisionQueueStore } from '../../stores/revisionQueueStore';
import { useBookStore } from '../../stores/bookStore';
import { renderApp } from '../../../test/renderWithState';
import { resetStoresBeforeEach } from '../../../test/resetStores';
import { makeRevisionPlan, makeRevisionSession } from '../../../test/novelEngineMock';

resetStoresBeforeEach(useRevisionQueueStore, useBookStore);

function renderControls(plan: RevisionPlan | null, extra: Record<string, unknown> = {}) {
  return renderApp(<QueueControls />, {
    stores: [
      [useRevisionQueueStore, { plan, planId: plan?.id ?? null, ...extra }],
      [useBookStore, { activeSlug: 'test-book' }],
    ],
  });
}

describe('QueueControls', () => {
  it('renders nothing without a plan', () => {
    const { container } = renderControls(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('runs the next pending session', async () => {
    const { bridge } = renderControls(
      makeRevisionPlan({ sessions: [makeRevisionSession({ id: 's1' })] }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Run Next/ }));

    await waitFor(() => expect(bridge.revision.runSession).toHaveBeenCalledWith('plan-1', 's1'));
  });

  it('Run All delegates the whole queue to the backend (no explicit ids outside selective mode)', async () => {
    const { bridge } = renderControls(
      makeRevisionPlan({
        sessions: [
          makeRevisionSession({ id: 's1', status: 'approved' }),
          makeRevisionSession({ id: 's2', index: 2 }),
        ],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Run All/ }));

    await waitFor(() => expect(bridge.revision.runAll).toHaveBeenCalledWith('plan-1', undefined));
  });

  it('Run All passes only the selected ids in selective mode', async () => {
    const { bridge } = renderControls(
      makeRevisionPlan({
        mode: 'selective',
        sessions: [
          makeRevisionSession({ id: 's1' }),
          makeRevisionSession({ id: 's2', index: 2 }),
        ],
      }),
      { selectedSessionIds: new Set(['s2']) },
    );

    fireEvent.click(screen.getByRole('button', { name: /Run All/ }));

    await waitFor(() => expect(bridge.revision.runAll).toHaveBeenCalledWith('plan-1', ['s2']));
  });

  it('disables run buttons when nothing is pending', () => {
    renderControls(
      makeRevisionPlan({ sessions: [makeRevisionSession({ status: 'rejected' })] }),
    );

    expect(screen.getByRole('button', { name: /Run Next/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Run All/ })).toBeDisabled();
  });

  it('shows Pause instead of the run buttons while running', async () => {
    const { bridge } = renderControls(makeRevisionPlan(), { isRunning: true });

    expect(screen.queryByRole('button', { name: /Run Next/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Pause/ }));

    await waitFor(() => expect(bridge.revision.pause).toHaveBeenCalledWith('plan-1'));
    expect(screen.getByRole('button', { name: /Pausing/ })).toBeInTheDocument();
  });

  it('changes the queue mode', async () => {
    const { bridge } = renderControls(makeRevisionPlan());

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'auto-approve' } });

    await waitFor(() =>
      expect(bridge.revision.setMode).toHaveBeenCalledWith('plan-1', 'auto-approve'),
    );
  });

  it('offers Verify only when every session is settled', async () => {
    const { bridge } = renderControls(
      makeRevisionPlan({
        sessions: [
          makeRevisionSession({ id: 's1', status: 'approved' }),
          makeRevisionSession({ id: 's2', index: 2, status: 'skipped' }),
        ],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(bridge.revision.startVerification).toHaveBeenCalledWith('plan-1'));
  });

  it('clears the cache for the active book', async () => {
    const { bridge } = renderControls(makeRevisionPlan());
    // clearCache reloads the plan afterwards
    bridge.revision.loadPlan.mockResolvedValue(makeRevisionPlan());

    fireEvent.click(screen.getByRole('button', { name: /Clear Cache/ }));

    await waitFor(() => expect(bridge.revision.clearCache).toHaveBeenCalledWith('test-book'));
  });
});
