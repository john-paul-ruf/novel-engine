import { PIPELINE_PHASES } from '@domain/constants';
import type { AgentName, PipelinePhaseId } from '@domain/types';

/**
 * The 14 canonical pipeline phases (from PIPELINE_PHASES) grouped into the
 * 5 spine stages of the Streamlined Workspace design.
 */
export const STAGES: { label: string; phaseIds: PipelinePhaseId[] }[] = [
  { label: 'CONCEIVE', phaseIds: ['pitch', 'scaffold'] },
  { label: 'DRAFT', phaseIds: ['first-draft'] },
  { label: 'ASSESS', phaseIds: ['first-read', 'first-assessment'] },
  {
    label: 'REVISE',
    phaseIds: [
      'revision-plan-1',
      'revision',
      'second-read',
      'second-assessment',
      'copy-edit',
      'revision-plan-2',
      'mechanical-fixes',
    ],
  },
  { label: 'SHIP', phaseIds: ['build', 'publish'] },
];

/** Agent for a phase — the canonical phase→agent mapping from PIPELINE_PHASES. */
export function agentForPhase(phaseId: string): AgentName | null {
  return PIPELINE_PHASES.find((p) => p.id === phaseId)?.agent ?? null;
}
