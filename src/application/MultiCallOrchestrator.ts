import { nanoid } from 'nanoid';
import type {
  AgentName,
  CreativeAgentName,
  MultiCallStep,
  StreamEvent,
  ProjectManifest,
} from '@domain/types';
import type {
  IAgentService,
  IDatabaseService,
  IFileSystemService,
  IProviderRegistry,
  ISettingsService,
  ISeriesService,
} from '@domain/interfaces';
import {
  AGENT_MULTI_CALL_STEPS,
  MULTI_CALL_SCRATCH_DIR,
  MULTI_CALL_TARGET_WORDS_PER_BATCH,
} from '@domain/constants';
import { ContextBuilder } from './ContextBuilder';
import { StreamManager } from './StreamManager';
import { resolveThinkingBudget } from './thinkingBudget';

/**
 * MultiCallOrchestrator — Breaks heavy pipeline agent work into
 * sequential, smaller CLI calls with bounded context.
 *
 * Instead of one massive call where the agent reads the entire manuscript
 * and produces a full report, the orchestrator runs 3–6 focused sub-calls:
 *   1. Each sub-call gets a focused prompt (e.g. "Run Pass 2: Continuity")
 *   2. Intermediate results go to source/.scratch/<agent>-*.md
 *   3. The final synthesis call reads all scratch files and writes the real output
 *   4. Scratch files are cleaned up after successful synthesis
 *
 * Benefits:
 *   - Each sub-call has a manageable context window
 *   - Progress is visible to the user (step 2/5, step 3/5, etc.)
 *   - If a sub-call fails, prior scratch files survive for retry
 *   - Works with both Claude CLI and Ollama providers
 */
export class MultiCallOrchestrator {
  private contextBuilder = new ContextBuilder();

  constructor(
    private settings: ISettingsService,
    private agents: IAgentService,
    private db: IDatabaseService,
    private providers: IProviderRegistry,
    private fs: IFileSystemService,
    private streamManager: StreamManager,
    private series: ISeriesService,
  ) {}

  /**
   * Check whether an agent has multi-call steps defined.
   */
  static hasMultiCallSteps(agentName: AgentName): boolean {
    return agentName in AGENT_MULTI_CALL_STEPS;
  }

  /**
   * Get the step schema for an agent, or null if single-call.
   */
  static getSteps(agentName: AgentName): MultiCallStep[] | null {
    return AGENT_MULTI_CALL_STEPS[agentName as CreativeAgentName] ?? null;
  }

  /**
   * Run all steps for the given agent sequentially.
   *
   * Each step is a separate sendMessage call through the provider registry.
   * The orchestrator:
   *   1. Emits multiCallProgress events so the UI shows step progress
   *   2. Builds a fresh context for each step (no conversation carryover)
   *   3. Injects the step's prompt as the user message
   *   4. For dynamic steps (Ghostlight), resolves chapter lists at runtime
   *   5. After synthesis succeeds, cleans up scratch files
   *
   * Returns the list of changed files (from the synthesis step).
   */
  async runMultiCall(params: {
    agentName: AgentName;
    conversationId: string;
    bookSlug: string;
    thinkingBudgetOverride?: number;
    callId?: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<{ changedFiles: string[] }> {
    const { agentName, conversationId, bookSlug, onEvent } = params;

    const steps = MultiCallOrchestrator.getSteps(agentName);
    if (!steps) {
      throw new Error(`No multi-call steps defined for agent ${agentName}`);
    }

    // Load settings and agent metadata
    const appSettings = await this.settings.load();
    const agent = await this.agents.load(agentName);
    const manifest = await this.fs.getProjectManifest(bookSlug);
    const seriesBiblePath = await this.series.getSeriesBiblePath(bookSlug);
    const authorProfileAbsPath = this.fs.getAuthorProfilePath();

    // Resolve model context window for budget-aware building
    const modelInfo = this.providers.listAllModels().find(m => m.id === appSettings.model);
    const modelContextWindow = modelInfo?.contextWindow;

    // For agents with dynamic steps (Ghostlight), expand the step list
    // based on actual manuscript word count. The static schema defines a
    // template with 2 read steps, but a 102K-word manuscript needs ~4
    // batches at 25K words each to avoid overwhelming the model's context.
    const expandedSteps = this.expandDynamicSteps(steps, manifest);

    // Compute chapter batches for the (possibly expanded) dynamic steps
    const chapterBatches = this.computeChapterBatches(manifest, expandedSteps);

    const allChangedFiles: string[] = [];

    for (let stepIdx = 0; stepIdx < expandedSteps.length; stepIdx++) {
      const step = expandedSteps[stepIdx];
      const stepNum = stepIdx + 1;
      const isFinalStep = stepIdx === expandedSteps.length - 1;

      // Emit progress event
      onEvent({
        type: 'multiCallProgress',
        step: stepNum,
        totalSteps: expandedSteps.length,
        label: step.label,
      });

      onEvent({
        type: 'status',
        message: `Step ${stepNum}/${expandedSteps.length}: ${step.label}`,
      });

      // Resolve the prompt (inject chapter lists for dynamic steps)
      const prompt = step.dynamic && chapterBatches.has(step.id)
        ? step.promptTemplate.replace('{{CHAPTER_LIST}}', chapterBatches.get(step.id)!)
        : step.promptTemplate;

      // Save the sub-prompt as a user message in the conversation
      this.db.saveMessage({
        conversationId,
        role: 'user',
        content: prompt,
        thinking: '',
      });

      // Build context: system prompt + manifest, but NO conversation history
      // (each sub-call is independent — relies on scratch files, not context)
      const thinkingBudget = resolveThinkingBudget(
        appSettings,
        agent.thinkingBudget,
        params.thinkingBudgetOverride,
      );

      const assembled = this.contextBuilder.build({
        agentName,
        agentSystemPrompt: agent.systemPrompt,
        manifest,
        messages: [], // No conversation history — scratch files carry state
        authorProfilePath: authorProfileAbsPath,
        seriesBiblePath: seriesBiblePath ?? undefined,
        thinkingBudget,
        maxContextTokens: modelContextWindow,
      });

      // Create a session record for this sub-call
      const sessionId = nanoid();
      this.db.createStreamSession({
        id: sessionId,
        conversationId,
        agentName,
        model: appSettings.model,
        bookSlug,
        startedAt: new Date().toISOString(),
        endedAt: null,
        finalStage: 'idle',
        filesTouched: {},
        interrupted: false,
      });

      // ── Event interceptor ──────────────────────────────────────
      // Intermediate steps (non-final) must NOT emit `done` or `error`
      // to the caller. If they do, the chatStore resets streaming state
      // (isStreaming=false, _activeCallId=null) and the stream handler
      // rejects all events from subsequent steps — killing the UI.
      //
      // Instead, intermediate `done` events are swallowed (the orchestrator
      // loop handles step transitions). Intermediate `error` events are
      // converted to status messages so the user sees the failure without
      // the chatStore tearing down the stream.
      const wrappedOnEvent = isFinalStep
        ? onEvent
        : (event: StreamEvent) => {
            if (event.type === 'done') {
              // Swallow — the orchestrator manages step transitions
              console.log(
                `[MultiCallOrchestrator] Intercepted intermediate done event (step ${stepNum}/${expandedSteps.length})`,
              );
              return;
            }
            if (event.type === 'error') {
              // Convert to status so the user sees it but the stream stays alive
              console.warn(
                `[MultiCallOrchestrator] Intermediate error (step ${stepNum}): ${event.message}`,
              );
              onEvent({
                type: 'status',
                message: `Step ${stepNum} warning: ${event.message}`,
              });
              return;
            }
            onEvent(event);
          };

      // Start the managed stream
      const stream = this.streamManager.startStream({
        conversationId,
        agentName,
        model: appSettings.model,
        bookSlug,
        sessionId,
        callId: params.callId ?? '',
        onEvent: wrappedOnEvent,
      }, {
        // No special onDone/onError hooks — the orchestrator manages the flow
      });

      try {
        await this.providers.sendMessage({
          model: appSettings.model,
          systemPrompt: assembled.systemPrompt,
          messages: [{ role: 'user', content: prompt }],
          maxTokens: appSettings.maxTokens,
          thinkingBudget,
          maxTurns: step.maxTurns,
          bookSlug,
          sessionId,
          conversationId,
          onEvent: stream.onEvent,
        });

        await stream.awaitPendingHook();

        // Collect changed files from this step
        const stepChangedFiles = stream.getChangedFiles();
        allChangedFiles.push(...stepChangedFiles);

        console.log(
          `[MultiCallOrchestrator] Step ${stepNum}/${expandedSteps.length} complete: ` +
          `${step.label}, files=${stepChangedFiles.join(', ') || 'none'}`,
        );
      } catch (err) {
        console.error(
          `[MultiCallOrchestrator] Step ${stepNum}/${expandedSteps.length} failed: ${step.label}`,
          err,
        );

        // Emit error to the caller — this IS a terminal failure.
        // For intermediate steps, this ends the multi-call run.
        // For the final step, it's a normal error.
        onEvent({
          type: 'error',
          message: `Step ${stepNum}/${expandedSteps.length} (${step.label}) failed: ` +
            `${err instanceof Error ? err.message : String(err)}. ` +
            `Prior results saved in ${MULTI_CALL_SCRATCH_DIR}/. You can retry or run individual passes manually.`,
        });
        return { changedFiles: allChangedFiles };
      }
    }

    // All steps completed — clean up scratch files
    await this.cleanupScratchFiles(bookSlug, expandedSteps);

    return { changedFiles: allChangedFiles };
  }

  /**
   * Expand dynamic steps based on actual manuscript word count.
   *
   * The static step schema defines template read steps with `dynamic: true`.
   * This method expands them into the right number of batches based on
   * total word count, using the agent's own prompt templates (not hardcoded
   * Ghostlight/Lumen-specific text).
   *
   * Template convention:
   *   - First dynamic step = template for batch 1 (reads reference docs, no prior context)
   *   - Last dynamic step  = template for batches 2..N (reads prior batch file for context)
   *   - Scratch file refs in templates use the template step's own numbering
   *     (e.g. `lumen-read-1.md`, `lumen-read-2.md`) — replaced with actual batch numbers
   *
   * For a 102K-word manuscript at 25K/batch: 4 read steps + analysis steps + synthesis.
   * For a 20K-word manuscript: 1 read step + analysis steps + synthesis.
   */
  private expandDynamicSteps(
    steps: MultiCallStep[],
    manifest: ProjectManifest,
  ): MultiCallStep[] {
    const hasDynamic = steps.some(s => s.dynamic);
    if (!hasDynamic) return steps;

    // Count manuscript words
    const totalWords = manifest.files
      .filter(f => f.path.startsWith('chapters/') && f.path.endsWith('/draft.md'))
      .reduce((sum, f) => sum + f.wordCount, 0);

    if (totalWords === 0) return steps;

    // Compute batch count (at least 1, at most ~8 for very large manuscripts)
    const batchCount = Math.max(1, Math.min(8, Math.ceil(totalWords / MULTI_CALL_TARGET_WORDS_PER_BATCH)));

    // Separate step categories (preserving original order within each category)
    const dynamicTemplates = steps.filter(s => s.dynamic && !s.isSynthesis);
    const staticSteps = steps.filter(s => !s.dynamic && !s.isSynthesis);
    const synthesisStep = steps.find(s => s.isSynthesis);

    if (dynamicTemplates.length === 0) return steps;

    // Use first template for batch 1, last template for subsequent batches
    const firstTemplate = dynamicTemplates[0];
    const subsequentTemplate = dynamicTemplates.length > 1
      ? dynamicTemplates[dynamicTemplates.length - 1]
      : dynamicTemplates[0];

    // Base ID: strip trailing -N (e.g. "lumen-read-1" → "lumen-read")
    const baseId = firstTemplate.id.replace(/-\d+$/, '');

    // Template numbering (for find-and-replace)
    const firstTemplateNum = firstTemplate.id.match(/-(\d+)$/)?.[1] ?? '1';
    const subsequentTemplateNum = subsequentTemplate.id.match(/-(\d+)$/)?.[1] ?? '2';

    // Generate read batch steps from the agent's own templates
    const readSteps: MultiCallStep[] = [];

    for (let i = 0; i < batchCount; i++) {
      const batchNum = i + 1;
      const isFirst = i === 0;
      const scratchFile = `source/.scratch/${baseId}-${batchNum}.md`;

      if (batchCount === 1) {
        // Single batch: use first template as-is (just update label)
        readSteps.push({
          ...firstTemplate,
          id: `${baseId}-${batchNum}`,
          label: 'Read Manuscript',
          scratchFile,
        });
      } else if (isFirst) {
        // First batch of multi: use first template with updated label
        readSteps.push({
          ...firstTemplate,
          id: `${baseId}-${batchNum}`,
          label: `Read Batch 1/${batchCount}`,
          scratchFile,
        });
      } else {
        // Subsequent batches: clone subsequent template, update file references.
        // IMPORTANT: replace higher-numbered refs first to avoid collision.
        // e.g. template has "lumen-read-2.md" (own) and "lumen-read-1.md" (prior).
        // For batch 3: own → "lumen-read-3.md", prior → "lumen-read-2.md".
        let prompt = subsequentTemplate.promptTemplate;

        // Replace own scratch file ref first (higher template number)
        prompt = prompt.replaceAll(
          `source/.scratch/${baseId}-${subsequentTemplateNum}.md`,
          `source/.scratch/${baseId}-${batchNum}.md`,
        );
        // Replace prior batch ref second (lower template number)
        prompt = prompt.replaceAll(
          `source/.scratch/${baseId}-${firstTemplateNum}.md`,
          `source/.scratch/${baseId}-${i}.md`,
        );

        readSteps.push({
          ...subsequentTemplate,
          id: `${baseId}-${batchNum}`,
          label: `Read Batch ${batchNum}/${batchCount}`,
          promptTemplate: prompt,
          scratchFile,
        });
      }
    }

    // Build explicit list of read batch scratch files (for injection into
    // static steps that use the {{READ_TRACKER_FILES}} placeholder)
    const readTrackerFileList = readSteps
      .map(s => `- \`${s.scratchFile}\``)
      .join('\n');

    // Update static (non-dynamic, non-synthesis) steps:
    // Replace {{READ_TRACKER_FILES}} placeholder with explicit file list
    const updatedStaticSteps = staticSteps.map(step => {
      if (!step.promptTemplate.includes('{{READ_TRACKER_FILES}}')) return step;
      return {
        ...step,
        promptTemplate: step.promptTemplate.replace('{{READ_TRACKER_FILES}}', readTrackerFileList),
      };
    });

    // Handle synthesis step
    let updatedSynthesis: MultiCallStep | undefined;
    if (synthesisStep) {
      // Check if synthesis references read batch files directly (Ghostlight pattern)
      // vs. lens analysis files (Lumen pattern — no change needed)
      const refsReadBatches = synthesisStep.promptTemplate.includes(`${baseId}-`);

      if (refsReadBatches) {
        // Ghostlight pattern: rebuild synthesis to reference all batch tracker files
        const batchFileList = readSteps.map(s => `- ${s.scratchFile}`).join('\n');
        updatedSynthesis = {
          ...synthesisStep,
          maxTurns: batchCount + 5,
          promptTemplate: `Synthesize the final Reader Report from your reading experience.

**IMPORTANT**: Do NOT read any manuscript chapters. Do NOT use the Read tool on any chapters/ files. Your batch notes already contain everything you need.

Read ONLY these batch tracker files (use the Read tool on each one):
${batchFileList}

After reading all batch trackers, IMMEDIATELY write the final report using the Write tool. Do not read any other files.

The report must include:
- Chapter-by-chapter engagement map (merge all batches)
- Emotional arc of the read
- Running questions resolved and unresolved
- Prediction log
- Strongest and weakest moments
- Overall reader verdict

Write the final report to source/reader-report.md.`,
        };
      } else {
        // Lumen pattern (or any agent where synthesis reads analysis files, not read batches):
        // No prompt changes needed — synthesis already references the right files.
        updatedSynthesis = synthesisStep;
      }
    }

    // Assemble in execution order: read batches → static analysis steps → synthesis
    const result = [
      ...readSteps,
      ...updatedStaticSteps,
      ...(updatedSynthesis ? [updatedSynthesis] : []),
    ];

    console.log(
      `[MultiCallOrchestrator] Expanded ${steps.length} steps → ${result.length} steps ` +
      `(${batchCount} read batches for ${totalWords.toLocaleString()} words, ` +
      `~${Math.ceil(totalWords / batchCount).toLocaleString()} words/batch)`,
    );

    return result;
  }

  /**
   * Compute chapter batches for dynamic (Ghostlight) steps.
   *
   * Splits chapters by cumulative word count, targeting roughly equal
   * word counts per batch. Returns a map from step ID to a formatted
   * chapter list string that replaces {{CHAPTER_LIST}} in the prompt.
   */
  private computeChapterBatches(
    manifest: ProjectManifest,
    steps: MultiCallStep[],
  ): Map<string, string> {
    const dynamicSteps = steps.filter(s => s.dynamic && !s.isSynthesis);
    if (dynamicSteps.length === 0) return new Map();

    // Get chapter files sorted by path (natural chapter order)
    const chapters = manifest.files
      .filter(f => f.path.startsWith('chapters/') && f.path.endsWith('/draft.md'))
      .sort((a, b) => a.path.localeCompare(b.path));

    if (chapters.length === 0) return new Map();

    const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
    const targetPerBatch = Math.ceil(totalWords / dynamicSteps.length);

    const batches: typeof chapters[] = [];
    let currentBatch: typeof chapters = [];
    let currentWords = 0;

    for (const ch of chapters) {
      currentBatch.push(ch);
      currentWords += ch.wordCount;

      // Start a new batch when we exceed the target, unless this is the last batch
      if (currentWords >= targetPerBatch && batches.length < dynamicSteps.length - 1) {
        batches.push(currentBatch);
        currentBatch = [];
        currentWords = 0;
      }
    }

    // Push remaining chapters into the last batch
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    // Map batch content to dynamic step IDs
    const result = new Map<string, string>();
    for (let i = 0; i < dynamicSteps.length; i++) {
      const batch = batches[i] ?? [];
      const listing = batch
        .map(ch => {
          const name = ch.path.replace('chapters/', '').replace('/draft.md', '');
          return `- \`${ch.path}\` — ${name} (${ch.wordCount.toLocaleString()} words)`;
        })
        .join('\n');

      result.set(
        dynamicSteps[i].id,
        listing || '(no chapters in this batch)',
      );
    }

    return result;
  }

  /**
   * Delete scratch files after a successful synthesis run.
   *
   * Only deletes files that belong to the completed step schema — never
   * touches scratch files from other agents or interrupted runs.
   */
  private async cleanupScratchFiles(
    bookSlug: string,
    steps: MultiCallStep[],
  ): Promise<void> {
    for (const step of steps) {
      if (step.scratchFile) {
        try {
          const exists = await this.fs.fileExists(bookSlug, step.scratchFile);
          if (exists) {
            await this.fs.deleteFile(bookSlug, step.scratchFile);
            console.log(`[MultiCallOrchestrator] Cleaned up ${step.scratchFile}`);
          }
        } catch (err) {
          // Non-fatal — scratch file cleanup failure shouldn't break the flow
          console.warn(`[MultiCallOrchestrator] Failed to clean up ${step.scratchFile}:`, err);
        }
      }
    }

    // Try to remove the scratch directory if empty
    try {
      const entries = await this.fs.listDirectory(bookSlug, MULTI_CALL_SCRATCH_DIR);
      if (entries.length === 0) {
        await this.fs.deletePath(bookSlug, MULTI_CALL_SCRATCH_DIR);
        console.log(`[MultiCallOrchestrator] Removed empty ${MULTI_CALL_SCRATCH_DIR}/`);
      }
    } catch {
      // Directory may not exist — that's fine
    }
  }
}
