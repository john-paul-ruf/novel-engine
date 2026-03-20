import type { IFileSystemService, IPipelineService } from '@domain/interfaces';
import type { AgentName, BookStatus, PipelinePhase, PipelinePhaseId } from '@domain/types';
import { PIPELINE_PHASES } from '@domain/constants';

/**
 * PipelineService — Detects which pipeline phase a book is in.
 *
 * Checks for the existence of key output files to determine which phases
 * are complete, which is active (first incomplete), and which are locked.
 * The pipeline is strictly linear — phases cannot be skipped.
 */
export class PipelineService implements IPipelineService {
  /** Book statuses that qualify as "copy-edit or later" for mechanical-fixes detection. */
  private static readonly COPY_EDIT_OR_LATER: ReadonlySet<BookStatus> = new Set([
    'copy-edit',
    'final',
    'published',
  ]);

  constructor(private fs: IFileSystemService) {}

  /**
   * Detect the status of all pipeline phases for a book.
   *
   * Runs all file-existence checks concurrently, then determines
   * the first incomplete phase (active) and marks everything after it as locked.
   */
  async detectPhases(bookSlug: string): Promise<PipelinePhase[]> {
    // Run all phase completeness checks concurrently
    const completionResults = await Promise.all(
      PIPELINE_PHASES.map((phase) => this.isPhaseComplete(bookSlug, phase.id)),
    );

    // Find the index of the first incomplete phase — that's the active one
    const firstIncompleteIndex = completionResults.indexOf(false);

    return PIPELINE_PHASES.map((phase, index) => {
      let status: PipelinePhase['status'];

      if (firstIncompleteIndex === -1) {
        // All phases complete
        status = 'complete';
      } else if (index < firstIncompleteIndex) {
        status = 'complete';
      } else if (index === firstIncompleteIndex) {
        status = 'active';
      } else {
        status = 'locked';
      }

      return {
        id: phase.id,
        label: phase.label,
        agent: phase.agent,
        status,
        description: phase.description,
      };
    });
  }

  /**
   * Get the currently active phase, or null if all phases are complete.
   */
  async getActivePhase(bookSlug: string): Promise<PipelinePhase | null> {
    const phases = await this.detectPhases(bookSlug);
    return phases.find((p) => p.status === 'active') ?? null;
  }

  /**
   * Look up the agent responsible for a pipeline phase.
   * Returns null for the 'build' phase (no agent — it's a system operation).
   */
  getAgentForPhase(phaseId: PipelinePhaseId): AgentName | null {
    const phase = PIPELINE_PHASES.find((p) => p.id === phaseId);
    return phase?.agent ?? null;
  }

  /**
   * Check whether a specific pipeline phase is complete.
   *
   * Each phase has a unique detection rule based on the existence
   * of key output files in the book's directory structure.
   */
  private async isPhaseComplete(bookSlug: string, phaseId: PipelinePhaseId): Promise<boolean> {
    switch (phaseId) {
      case 'pitch':
        return this.fs.fileExists(bookSlug, 'source/pitch.md');

      case 'scaffold':
        return this.fs.fileExists(bookSlug, 'source/scene-outline.md');

      case 'first-draft': {
        const chapters = await this.fs.countWordsPerChapter(bookSlug);
        if (chapters.length === 0) return false;
        const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
        return totalWords > 1000;
      }

      case 'first-read':
        return this.fs.fileExists(bookSlug, 'source/reader-report.md');

      case 'first-assessment':
        return this.fs.fileExists(bookSlug, 'source/dev-report.md');

      case 'revision-plan-1':
        return this.fs.fileExists(bookSlug, 'source/project-tasks.md');

      case 'revision':
        return this.fs.fileExists(bookSlug, 'source/reader-report-v1.md');

      case 'second-read': {
        const [hasReport, hasArchived] = await Promise.all([
          this.fs.fileExists(bookSlug, 'source/reader-report.md'),
          this.fs.fileExists(bookSlug, 'source/reader-report-v1.md'),
        ]);
        return hasReport && hasArchived;
      }

      case 'second-assessment':
        return this.fs.fileExists(bookSlug, 'source/dev-report-v1.md');

      case 'copy-edit':
        return this.fs.fileExists(bookSlug, 'source/audit-report.md');

      case 'revision-plan-2': {
        const [hasPrompts, hasAudit] = await Promise.all([
          this.fs.fileExists(bookSlug, 'source/revision-prompts.md'),
          this.fs.fileExists(bookSlug, 'source/audit-report.md'),
        ]);
        return hasPrompts && hasAudit;
      }

      case 'mechanical-fixes': {
        const hasAudit = await this.fs.fileExists(bookSlug, 'source/audit-report.md');
        if (!hasAudit) return false;
        const meta = await this.fs.getBookMeta(bookSlug);
        return PipelineService.COPY_EDIT_OR_LATER.has(meta.status);
      }

      case 'build':
        return this.fs.fileExists(bookSlug, 'dist/output.md');

      case 'publish':
        return this.fs.fileExists(bookSlug, 'source/metadata.md');

      default:
        return false;
    }
  }
}
