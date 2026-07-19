import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, render } from '@testing-library/react';
import type { PipelinePhase, PipelinePhaseId, PhaseStatus } from '@domain/types';
import { PhaseNode } from './PhaseNode';

function phase(id: string, status: PhaseStatus, overrides: Partial<PipelinePhase> = {}): PipelinePhase {
  return {
    id: id as PipelinePhaseId,
    label: `Label ${id}`,
    agent: null,
    status,
    description: `Describes ${id}`,
    ...overrides,
  };
}

function renderNode(p: PipelinePhase, isSelected = false) {
  const onSelect = vi.fn();
  const utils = render(<PhaseNode phase={p} isSelected={isSelected} onSelect={onSelect} />);
  return { ...utils, onSelect };
}

describe('PhaseNode', () => {
  it('renders the phase label with its description as the tooltip', () => {
    renderNode(phase('pitch', 'active'));

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title', 'Describes pitch');
    expect(screen.getByText('Label pitch')).toBeInTheDocument();
  });

  it('locked phases explain the lock in their tooltip but stay selectable', () => {
    const { onSelect } = renderNode(phase('build', 'locked'));

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute(
      'title',
      'Label build — locked. Complete the previous phase first.',
    );
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('pending-completion phases prompt for confirmation in the tooltip', () => {
    renderNode(phase('first-draft', 'pending-completion'));

    expect(screen.getByRole('button')).toHaveAttribute(
      'title',
      "Label first-draft — agent finished. Confirm & advance when you're ready.",
    );
  });

  it('shows the agent chip when the phase has an agent', () => {
    renderNode(phase('pitch', 'complete', { agent: 'Spark' }));
    expect(screen.getByText('Spark')).toBeInTheDocument();
  });
});
