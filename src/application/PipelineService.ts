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
 * Persisted confirmation state for a single book.
 *
 * Stored in `books/{slug}/pipeline-state.json` — a lightweight JSON file
 * that records which pipeline phases the user has explicitly confirmed.
 * A phase's completion files may exist (the agent finished) but the phase
 * is not promoted to 'complete' until it appears in this list.
 */
type PipelineState = {
  confirmedPhases: PipelinePhaseId[];
};

/**
 * PipelineService — Detects which pipeline phase a book is in.
 *
 * Checks for the existence of key output files AND a user confirmation to
 * determine which phases are truly complete. The pipeline is strictly linear
 * — phases cannot be skipped, and the next phase only unlocks after the user
 * explicitly confirms they are ready (via `confirmPhaseAdvancement`).
 *
 * ## Phase statuses
 * - `complete`           — files exist AND user confirmed advancement
 * - `pending-completion` — files exist but user has NOT yet confirmed
 * - `active`             — current work phase (files do not yet exist)
 * - `locked`             — future phase, not yet reachable
 *
 * ## Backward compatibility
 * When `pipeline-state.json` is absent (existing books, first run after
 * upgrade), every phase whose detection files already exist is auto-confirmed.
 * This prevents upgrading users from being asked to re-confirm work they
 * already finished.
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

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Detect the status of all pipeline phases for a book.
   *
   * Runs all file-existence checks and loads the stored confirmation state
   * concurrently. A phase is only 'complete' when BOTH conditions hold:
   *   1. Its detection files exist (or its status condition is met)
   *   2. The user has confirmed advancement past it (stored in pipeline-state.json)
   *
   * If no pipeline-state.json exists (first run / legacy book), all currently
   * file-complete phases are auto-confirmed and the state file is created.
   */
  async detectPhases(bookSlug: string): Promise<PipelinePhase[]> {
    // Run all completeness checks and load stored confirmations concurrently
    const [completionResults, storedState] = await Promise.all([
      Promise.all(PIPELINE_PHASES.map((phase) => this.isPhaseComplete(bookSlug, phase.id))),
      this.loadPipelineState(bookSlug),
    ]);

    let confirmedPhases: Set<PipelinePhaseId>;

    if (storedState === null) {
      // First run for this book — auto-confirm all currently file-complete phases
      // so existing books don't get blocked by the new confirmation requirement.
      confirmedPhases = new Set(
        PIPELINE_PHASES.filter((_, i) => completionResults[i]).map((p) => p.id),
      );
      // Persist so future runs use the stored state
      await this.savePipelineState(bookSlug, { confirmedPhases: [...confirmedPhases] });
    } else {
      confirmedPhases = new Set(storedState.confirmedPhases);
    }

    // A phase is "fully complete" only when BOTH file-complete AND confirmed
    const fullyComplete = completionResults.map(
      (fileComplete, i) => fileComplete && confirmedPhases.has(PIPELINE_PHASES[i].id),
    );

    // The first non-fully-complete phase is the one needing attention
    const firstIncompleteIndex = fullyComplete.indexOf(false);

    return PIPELINE_PHASES.map((phase, index) => {
      let status: PipelinePhase['status'];

      if (firstIncompleteIndex === -1) {
        // All phases fully complete
        status = 'complete';
      } else if (index < firstIncompleteIndex) {
        status = 'complete';
      } else if (index === firstIncompleteIndex) {
        // Files exist but user hasn't confirmed → pending-completion
        // Files don't exist yet → active (still working)
        if (completionResults[index] && !confirmedPhases.has(phase.id)) {
          status = 'pending-completion';
        } else {
          status = 'active';
        }
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
   * Get the currently active or pending-completion phase, or null if all
   * phases are complete. Both 'active' and 'pending-completion' represent
   * the phase the author is currently attending to.
   */
  async getActivePhase(bookSlug: string): Promise<PipelinePhase | null> {
    const phases = await this.detectPhases(bookSlug);
    return (
      phases.find((p) => p.status === 'active' || p.status === 'pending-completion') ?? null
    );
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
   * Confirm that a phase's work is accepted and the pipeline should advance.
   *
   * Writes the phase to the confirmed list in pipeline-state.json. The next
   * call to `detectPhases` will then see this phase as 'complete' and promote
   * the following phase from 'locked' to 'active'.
   *
   * Idempotent — calling on an already-confirmed phase is a safe no-op.
   */
  async confirmPhaseAdvancement(bookSlug: string, phaseId: PipelinePhaseId): Promise<void> {
    await this.addConfirmedPhase(bookSlug, phaseId);
  }

  /**
   * Manually mark any pipeline phase as complete.
   *
   * - **Status-based phases** (`first-draft`, `mechanical-fixes`): advances
   *   `about.json` to the next book status.
   * - **Archive-based phase** (`revision`): delegates to `completeRevision()`
   *   which copies the reader/dev reports to their `v1` counterparts.
   * - **File-existence phases** (all others): creates the required marker
   *   file(s) as stubs when they don't already exist. The stub content
   *   is long enough to pass every word-count threshold used by
   *   `isPhaseComplete`. Agents will overwrite stubs with real content
   *   the next time they run.
   *
   * In all cases the phase is also auto-confirmed so the user does not need
   * a separate "Advance →" click after calling "Done".
   *
   * This enables the author to manually bypass any phase — useful when
   * work was done outside the app, or to skip a phase entirely.
   */
  async markPhaseComplete(bookSlug: string, phaseId: PipelinePhaseId): Promise<void> {
    switch (phaseId) {
      // ── Status-based phases ─────────────────────────────────────────────
      case 'first-draft':
        await this.fs.updateBookMeta(bookSlug, { status: 'revision-1' });
        break;

      case 'mechanical-fixes':
        await this.fs.updateBookMeta(bookSlug, { status: 'final' });
        break;

      // ── Archive-based phase ──────────────────────────────────────────────
      case 'revision':
        // Reuse completeRevision which copies the reports to their v1 counterparts.
        // completeRevision handles its own auto-confirm, so return early to
        // avoid double-writing pipeline-state.json.
        await this.completeRevision(bookSlug);
        return;

      // ── File-existence phases ────────────────────────────────────────────
      case 'pitch':
        await this.ensureStubFile(bookSlug, 'source/pitch.md', 'Story Pitch');
        break;

      case 'scaffold':
        await this.ensureStubFile(bookSlug, 'source/scene-outline.md', 'Scene Outline');
        break;

      case 'first-read':
        await this.ensureStubFile(bookSlug, 'source/reader-report.md', 'First Reader Report');
        break;

      case 'first-assessment':
        await this.ensureStubFile(bookSlug, 'source/dev-report.md', 'Developmental Assessment');
        break;

      case 'revision-plan-1':
        await this.ensureStubFile(bookSlug, 'source/project-tasks.md', 'Revision Task Plan');
        await this.ensureStubFile(bookSlug, 'source/revision-prompts.md', 'Revision Session Prompts');
        break;

      case 'second-read':
        // Needs a fresh reader-report.md AND the archived reader-report-v1.md
        await this.ensureStubFile(bookSlug, 'source/reader-report.md', 'Second Reader Report');
        await this.ensureStubFile(bookSlug, 'source/reader-report-v1.md', 'First Reader Report (Archived)');
        break;

      case 'second-assessment':
        // Detection key: dev-report-v1.md exists (the archived first assessment)
        await this.ensureStubFile(bookSlug, 'source/dev-report-v1.md', 'First Developmental Assessment (Archived)');
        break;

      case 'copy-edit':
        await this.ensureStubFile(bookSlug, 'source/audit-report.md', 'Copy Edit Audit Report');
        break;

      case 'revision-plan-2':
        // Requires all three: revision-prompts.md, audit-report.md, project-tasks-v1.md
        await this.ensureStubFile(bookSlug, 'source/revision-prompts.md', 'Mechanical Fix Prompts');
        await this.ensureStubFile(bookSlug, 'source/audit-report.md', 'Copy Edit Audit Report');
        await this.ensureStubFile(bookSlug, 'source/project-tasks-v1.md', 'First Revision Tasks (Archived)');
        break;

      case 'build':
        await this.ensureStubFile(bookSlug, `dist/${bookSlug}.md`, 'Manuscript Output');
        break;

      case 'publish':
        await this.ensureStubFile(bookSlug, 'source/metadata.md', 'Publication Metadata');
        break;

      default: {
        // Exhaustiveness guard — TypeScript will error here if a new phase is added
        const _exhaustive: never = phaseId;
        throw new Error(`Unknown pipeline phase: "${String(_exhaustive)}"`);
      }
    }

    // The user explicitly clicked "Done" — that IS their confirmation.
    // Auto-confirm so the pipeline advances without an additional "Advance →" click.
    await this.addConfirmedPhase(bookSlug, phaseId);
  }

  /**
   * Archive the revision reports to signal the revision phase is complete.
   *
   * Copies reader-report.md → reader-report-v1.md so the pipeline detects
   * the revision phase as done and unlocks second-read. Also copies
   * dev-report.md → dev-report-v1.md (if present) to pre-satisfy
   * the second-assessment gate.
   *
   * Auto-confirms the 'revision' phase — the user clicked "Complete Revision",
   * which is their explicit confirmation.
   */
  async completeRevision(bookSlug: string): Promise<void> {
    const readerReport = await this.fs.readFile(bookSlug, 'source/reader-report.md');
    await this.fs.writeFile(bookSlug, 'source/reader-report-v1.md', readerReport);

    const devReportExists = await this.fs.fileExists(bookSlug, 'source/dev-report.md');
    if (devReportExists) {
      const devReport = await this.fs.readFile(bookSlug, 'source/dev-report.md');
      await this.fs.writeFile(bookSlug, 'source/dev-report-v1.md', devReport);
    }

    // "Complete Revision" is explicit user confirmation — auto-confirm the phase.
    await this.addConfirmedPhase(bookSlug, 'revision');
  }

  /**
   * Revert a pipeline phase and all subsequent phases.
   *
   * Removes the target phase and every phase that comes after it from
   * the confirmed list. For status-dependent or archive-dependent phases,
   * also undoes the side-effects that made the phase detectable as complete.
   */
  async revertPhase(bookSlug: string, phaseId: PipelinePhaseId): Promise<void> {
    const targetIndex = PIPELINE_PHASES.findIndex((p) => p.id === phaseId);
    if (targetIndex === -1) {
      throw new Error(`Unknown pipeline phase: "${phaseId}"`);
    }

    // Collect all phase IDs at and after the target — they all lose confirmation
    const phasesToRevert = new Set(
      PIPELINE_PHASES.slice(targetIndex).map((p) => p.id),
    );

    // Remove confirmations for the target and all subsequent phases
    const stored = await this.loadPipelineState(bookSlug);
    const existing = stored?.confirmedPhases ?? [];
    const filtered = existing.filter((id) => !phasesToRevert.has(id));
    await this.savePipelineState(bookSlug, { confirmedPhases: filtered });

    // Undo phase-specific side-effects so the detection check also fails,
    // making the phase truly 'active' rather than 'pending-completion'.
    await this.undoPhaseSideEffects(bookSlug, phaseId);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Undo the side-effects that make a phase detectable as complete.
   *
   * For most phases this is a no-op — the files stay on disk and the phase
   * will show as 'pending-completion' (ready to re-confirm). For phases
   * whose completion depends on book status or archived files, we actively
   * revert those conditions so the phase returns to 'active'.
   */
  private async undoPhaseSideEffects(bookSlug: string, phaseId: PipelinePhaseId): Promise<void> {
    switch (phaseId) {
      // ── Status-based phases — revert book status ────────────────────────
      case 'first-draft': {
        const meta = await this.fs.getBookMeta(bookSlug);
        if (!PipelineService.FIRST_DRAFT_IN_PROGRESS.has(meta.status)) {
          await this.fs.updateBookMeta(bookSlug, { status: 'first-draft' });
        }
        break;
      }

      case 'mechanical-fixes': {
        const meta = await this.fs.getBookMeta(bookSlug);
        if (PipelineService.COPY_EDIT_OR_LATER.has(meta.status) && meta.status !== 'copy-edit') {
          await this.fs.updateBookMeta(bookSlug, { status: 'copy-edit' });
        }
        break;
      }

      // ── Archive-based phase — remove archived v1 files ──────────────────
      case 'revision': {
        // Delete the v1 archive files so the phase detection sees revision
        // as incomplete. The live report files are left intact.
        await this.safeDelete(bookSlug, 'source/reader-report-v1.md');
        await this.safeDelete(bookSlug, 'source/dev-report-v1.md');
        break;
      }

      // ── All other phases: no side-effects to undo ───────────────────────
      // The detection files stay on disk. The phase will show as
      // 'pending-completion' (files exist, not confirmed). The user can
      // either re-confirm with "Advance →" or manually delete files.
      default:
        break;
    }
  }

  /**
   * Delete a file, silently ignoring ENOENT (file does not exist).
   */
  private async safeDelete(bookSlug: string, relativePath: string): Promise<void> {
    try {
      await this.fs.deleteFile(bookSlug, relativePath);
    } catch {
      // File doesn't exist — that's fine
    }
  }

  /**
   * Load pipeline confirmation state from disk.
   *
   * Returns `null` when the file does not exist yet (first run / legacy book).
   * Returns the parsed state object otherwise. Treats parse errors as
   * an empty confirmed list rather than crashing.
   */
  private async loadPipelineState(bookSlug: string): Promise<PipelineState | null> {
    try {
      const raw = await this.fs.readFile(bookSlug, 'pipeline-state.json');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const confirmedPhases = Array.isArray(parsed.confirmedPhases)
        ? (parsed.confirmedPhases as PipelinePhaseId[])
        : [];
      return { confirmedPhases };
    } catch (err) {
      // ENOENT → file doesn't exist → first run. Any other parse error is
      // treated the same way (safe default: empty confirmations).
      return null;
    }
  }

  /**
   * Write a pipeline-state.json for the book.
   */
  private async savePipelineState(bookSlug: string, state: PipelineState): Promise<void> {
    await this.fs.writeFile(
      bookSlug,
      'pipeline-state.json',
      JSON.stringify(state, null, 2),
    );
  }

  /**
   * Add a single phase to the confirmed list, persisting atomically.
   * Idempotent — adding an already-confirmed phase is a no-op on disk.
   */
  private async addConfirmedPhase(bookSlug: string, phaseId: PipelinePhaseId): Promise<void> {
    const stored = await this.loadPipelineState(bookSlug);
    const existing = stored?.confirmedPhases ?? [];

    if (existing.includes(phaseId)) return; // already confirmed — skip write

    const updated: PipelineState = {
      confirmedPhases: [...existing, phaseId],
    };
    await this.savePipelineState(bookSlug, updated);
  }

  /**
   * Create a stub file at `relativePath` only when it doesn't already exist.
   *
   * The stub is long enough (>200 words) to pass both `MIN_SUBSTANTIVE_WORDS`
   * (50) and `MIN_SCAFFOLD_WORDS` (200) thresholds used by `isPhaseComplete`.
   */
  private async ensureStubFile(bookSlug: string, relativePath: string, title: string): Promise<void> {
    const exists = await this.fs.fileExists(bookSlug, relativePath);
    if (!exists) {
      await this.fs.writeFile(bookSlug, relativePath, this.buildStubContent(title));
    }
  }

  /**
   * Build a stub file that satisfies every pipeline word-count threshold.
   *
   * The stub clearly labels itself as a manual advancement marker so authors
   * know it was not AI-generated. Agents will overwrite it when they next run.
   */
  private buildStubContent(title: string): string {
    const timestamp = new Date().toISOString();
    return [
      `# ${title}`,
      '',
      '*This file was created as a manual pipeline advancement marker.*',
      '',
      '## Manual Advancement Notice',
      '',
      'The author manually advanced past this phase using the Novel Engine interface.',
      'This stub file was created to satisfy the pipeline phase completion check.',
      'No AI-generated content is present in this file. If you need real content for',
      'this phase, open the appropriate agent conversation and send your first message.',
      'The agent will write its output to this file, replacing this stub entirely.',
      '',
      '## What This Means',
      '',
      'By advancing manually, you are signaling to the Novel Engine that this phase',
      'is considered complete for your workflow. The pipeline will now show the next',
      'phase as active and available to work on.',
      '',
      'Manual advancement is useful when:',
      '- You completed this phase using external tools or a separate workflow',
      '- You want to bypass this phase for a particular project',
      '- You are testing the pipeline progression behaviour',
      '- The phase was completed in a previous session outside the application',
      '',
      '## How to Add Real Content',
      '',
      'To replace this stub with actual content, open the appropriate agent conversation',
      'for this phase and start a conversation. When the agent produces its output',
      'document it will write the real content to this file, overwriting this placeholder.',
      'You do not need to delete this file manually before running the agent.',
      '',
      '---',
      '',
      `*Manually advanced: ${timestamp}*`,
    ].join('\n');
  }

  /**
   * Compare the word counts of two files within a book.
   *
   * Returns `true` when the files have **different** word counts, indicating
   * the live file has been rewritten since it was archived. Returns `false`
   * when the counts match (content is still the archive copy) or when either
   * file cannot be read.
   *
   * This is used by the `second-read` and `second-assessment` phase checks to
   * prevent the pipeline from advancing when `completeRevision()` has copied
   * a report to its v1 counterpart but no new report has been generated yet.
   */
  private async filesHaveDifferentWordCount(
    bookSlug: string,
    pathA: string,
    pathB: string,
  ): Promise<boolean> {
    try {
      const [contentA, contentB] = await Promise.all([
        this.fs.readFile(bookSlug, pathA),
        this.fs.readFile(bookSlug, pathB),
      ]);
      const wordsA = contentA.split(/\s+/).filter(Boolean).length;
      const wordsB = contentB.split(/\s+/).filter(Boolean).length;
      return wordsA !== wordsB;
    } catch {
      // If either file can't be read, treat as not-ready
      return false;
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
   * Check whether a specific pipeline phase's detection condition is met.
   *
   * This only checks file/status conditions — it does NOT check the user
   * confirmation. `detectPhases` combines both to determine the final status.
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
        // Forge produces TWO files: project-tasks.md and revision-prompts.md.
        // Both must exist for the phase to be complete.
        //
        // Additionally, when an archived v1 copy exists (from a previous revision
        // queue), the live project-tasks.md must have a different word count than
        // the archive — proving Forge actually re-ran rather than the pipeline
        // seeing stale files left over from the first cycle.
        //
        // First run (no archive): both files exist → complete.
        // Second+ run (archive exists): both files exist AND word counts differ → complete.
        const [hasTasks, hasPrompts, hasArchivedTasks] = await Promise.all([
          this.hasSubstantiveFile(bookSlug, 'source/project-tasks.md'),
          this.hasSubstantiveFile(bookSlug, 'source/revision-prompts.md'),
          this.fs.fileExists(bookSlug, 'source/project-tasks-v1.md'),
        ]);
        if (!hasTasks || !hasPrompts) return false;
        // If no archive exists, this is the first run — both files present is sufficient
        if (!hasArchivedTasks) return true;
        // Archive exists — verify Forge regenerated (live differs from archive)
        return this.filesHaveDifferentWordCount(
          bookSlug,
          'source/project-tasks.md',
          'source/project-tasks-v1.md',
        );
      }

      case 'revision':
        return this.fs.fileExists(bookSlug, 'source/reader-report-v1.md');

      case 'second-read': {
        // Both the live reader report AND its archived v1 copy must exist.
        // Additionally, the live report must differ from the archive — if the
        // word counts match, the archive was just copied and no new report has
        // been generated yet (Ghostlight hasn't done a second read).
        const [hasReport, hasArchived] = await Promise.all([
          this.fs.fileExists(bookSlug, 'source/reader-report.md'),
          this.fs.fileExists(bookSlug, 'source/reader-report-v1.md'),
        ]);
        if (!hasReport || !hasArchived) return false;
        return this.filesHaveDifferentWordCount(
          bookSlug,
          'source/reader-report.md',
          'source/reader-report-v1.md',
        );
      }

      case 'second-assessment': {
        // The archived dev-report-v1.md must exist AND the live dev-report.md
        // must have a different word count — proving Lumen actually wrote a new
        // assessment after revision rather than the pipeline seeing the archive
        // copy that completeRevision() created.
        const [hasDevReport, hasArchivedDev] = await Promise.all([
          this.fs.fileExists(bookSlug, 'source/dev-report.md'),
          this.fs.fileExists(bookSlug, 'source/dev-report-v1.md'),
        ]);
        if (!hasDevReport || !hasArchivedDev) return false;
        return this.filesHaveDifferentWordCount(
          bookSlug,
          'source/dev-report.md',
          'source/dev-report-v1.md',
        );
      }

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
        return this.fs.fileExists(bookSlug, `dist/${bookSlug}.md`);

      case 'publish':
        return this.hasSubstantiveFile(bookSlug, 'source/metadata.md');

      default:
        return false;
    }
  }
}
