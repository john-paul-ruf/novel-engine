import type { IFileSystemService, IPipelineService } from '@domain/interfaces';
import type { AgentName, BookStatus, PipelinePhase, PipelinePhaseId } from '@domain/types';
import { PIPELINE_PHASES } from '@domain/constants';

/**
 * Minimum word count for a file to be considered "substantive" content
 * rather than a placeholder stub left over from old scaffolding.
 */
const MIN_SUBSTANTIVE_WORDS = 50;

/**
 * Higher threshold for the scene outline specifically.
 *
 * Spark's Build Mode may create a seeded scene-outline.md template (~30-60
 * words). A real scene outline populated by Verity during the scaffold phase
 * will be significantly longer (multiple chapter entries with beats, POV,
 * timeline). This threshold prevents Spark's template from falsely marking
 * the scaffold phase as complete.
 */
const MIN_SCAFFOLD_WORDS = 200;

/**
 * Maps pipeline phase IDs to the book status they should advance TO
 * when the user explicitly marks a phase complete.
 *
 * Only phases that depend on book status need entries here.
 * File-existence phases advance automatically when the agent creates
 * the expected output file.
 */
const PHASE_STATUS_ADVANCEMENT: Partial<Record<PipelinePhaseId, BookStatus>> = {
  'first-draft': 'revision-1',
  'mechanical-fixes': 'final',
};

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

  /**
   * Book statuses that indicate the first draft is still in progress.
   * The first-draft phase is only considered complete when the book's
   * status has advanced beyond these initial statuses.
   */
  private static readonly FIRST_DRAFT_IN_PROGRESS: ReadonlySet<BookStatus> = new Set([
    'scaffolded',
    'outlining',
    'first-draft',
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
   * Manually mark a pipeline phase as complete by advancing the book status.
   *
   * This is needed for phases whose completion depends on the book's status
   * field (like `first-draft` and `mechanical-fixes`), since nothing
   * auto-advances the status. The user explicitly signals "I'm done with
   * this phase" and the status is updated accordingly.
   *
   * Throws if the phase doesn't support manual completion (i.e., it's
   * purely file-existence based and will complete automatically).
   */
  async markPhaseComplete(bookSlug: string, phaseId: PipelinePhaseId): Promise<void> {
    const targetStatus = PHASE_STATUS_ADVANCEMENT[phaseId];
    if (!targetStatus) {
      throw new Error(
        `Phase "${phaseId}" does not support manual completion — ` +
        `it completes automatically when the expected output file is created.`,
      );
    }

    await this.fs.updateBookMeta(bookSlug, { status: targetStatus });
  }

  /**
   * Archive the revision reports to signal the revision phase is complete.
   *
   * Copies reader-report.md → reader-report-v1.md so the pipeline detects
   * the revision phase as done and unlocks second-read. Also copies
   * dev-report.md → dev-report-v1.md (if present) to pre-satisfy
   * the second-assessment gate.
   */
  async completeRevision(bookSlug: string): Promise<void> {
    const readerReport = await this.fs.readFile(bookSlug, 'source/reader-report.md');
    await this.fs.writeFile(bookSlug, 'source/reader-report-v1.md', readerReport);

    const devReportExists = await this.fs.fileExists(bookSlug, 'source/dev-report.md');
    if (devReportExists) {
      const devReport = await this.fs.readFile(bookSlug, 'source/dev-report.md');
      await this.fs.writeFile(bookSlug, 'source/dev-report-v1.md', devReport);
    }
  }

  /**
   * Check that a file exists AND contains meaningful content (>= MIN_SUBSTANTIVE_WORDS).
   *
   * Old versions of `createBook()` pre-created some pipeline-gating files with
   * placeholder content (~10 words).  Using this instead of bare `fileExists()`
   * prevents those stubs from falsely marking a phase as complete.
   */
  private async hasSubstantiveFile(bookSlug: string, relativePath: string, minWords = MIN_SUBSTANTIVE_WORDS): Promise<boolean> {
    try {
      const content = await this.fs.readFile(bookSlug, relativePath);
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      return wordCount >= minWords;
    } catch {
      return false;
    }
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
        return this.hasSubstantiveFile(bookSlug, 'source/pitch.md');

      case 'scaffold':
        return this.hasSubstantiveFile(bookSlug, 'source/scene-outline.md', MIN_SCAFFOLD_WORDS);

      case 'first-draft': {
        // The first draft is complete when chapters exist with meaningful content
        // AND the book's status has explicitly advanced beyond 'first-draft'.
        // Without the status check, the pipeline jumps ahead as soon as a single
        // chapter exceeds 1,000 words — far too early.
        const chapters = await this.fs.countWordsPerChapter(bookSlug);
        if (chapters.length === 0) return false;
        const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
        if (totalWords <= 1000) return false;

        const meta = await this.fs.getBookMeta(bookSlug);
        return !PipelineService.FIRST_DRAFT_IN_PROGRESS.has(meta.status);
      }

      case 'first-read':
        return this.hasSubstantiveFile(bookSlug, 'source/reader-report.md');

      case 'first-assessment':
        return this.hasSubstantiveFile(bookSlug, 'source/dev-report.md');

      case 'revision-plan-1': {
        // Complete when a project tasks file exists — either the live one (Forge ran, queue not
        // yet started) or the archived v1 copy (queue was completed and files were archived).
        const [hasTasks, hasArchivedTasks] = await Promise.all([
          this.hasSubstantiveFile(bookSlug, 'source/project-tasks.md'),
          this.fs.fileExists(bookSlug, 'source/project-tasks-v1.md'),
        ]);
        return hasTasks || hasArchivedTasks;
      }

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
        return this.hasSubstantiveFile(bookSlug, 'source/audit-report.md');

      case 'revision-plan-2': {
        // Requires:
        //   1. A NEW revision-prompts.md — generated by Forge for mechanical fixes
        //   2. audit-report.md — signals Sable ran (copy-edit phase complete)
        //   3. project-tasks-v1.md — confirms the first revision queue was archived,
        //      preventing a false-positive from the old revision-prompts.md before
        //      the first queue is even complete.
        const [hasPrompts, hasAudit, hasArchivedTasks] = await Promise.all([
          this.hasSubstantiveFile(bookSlug, 'source/revision-prompts.md'),
          this.fs.fileExists(bookSlug, 'source/audit-report.md'),
          this.fs.fileExists(bookSlug, 'source/project-tasks-v1.md'),
        ]);
        return hasPrompts && hasAudit && hasArchivedTasks;
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
        return this.hasSubstantiveFile(bookSlug, 'source/metadata.md');

      default:
        return false;
    }
  }
}
