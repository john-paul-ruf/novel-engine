import { nanoid } from 'nanoid';
import type {
  Agent,
  AgentName,
  AppSettings,
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
  MAX_CALL_CONTEXT_TOKENS,
  MULTI_CALL_MAX_RETRIES,
  MULTI_CALL_RETRY_EXTRA_TURNS,
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
   *   4. For dynamic steps, resolves chapter lists at runtime
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

    // Resolve model context window for budget-aware building, capped at global ceiling
    const modelInfo = this.providers.listAllModels().find(m => m.id === appSettings.model);
    const modelContextWindow = Math.min(
      modelInfo?.contextWindow ?? MAX_CALL_CONTEXT_TOKENS,
      MAX_CALL_CONTEXT_TOKENS,
    );

    // For agents with dynamic steps, expand the step list based on actual
    // manuscript word count. The static schema defines template read steps,
    // but a large manuscript needs multiple batches to avoid overwhelming
    // the model's context.
    const expandedSteps = this.expandDynamicSteps(steps, manifest);

    // For non-dynamic agents, ensure the synthesis step's
    // maxTurns scales with the number of scratch files it must read.
    // Dynamic agents handle this inside expandDynamicSteps.
    const hasDynamic = steps.some(s => s.dynamic);
    if (!hasDynamic) {
      const synthIdx = expandedSteps.findIndex(s => s.isSynthesis);
      if (synthIdx !== -1) {
        const scratchCount = expandedSteps.filter(s => s.scratchFile).length;
        const floor = expandedSteps[synthIdx].maxTurns;
        expandedSteps[synthIdx] = {
          ...expandedSteps[synthIdx],
          maxTurns: Math.max(floor, scratchCount + 5),
        };
      }
    }

    // Compute chapter batches for the (possibly expanded) dynamic steps
    const chapterBatches = this.computeChapterBatches(manifest, expandedSteps);

    const allChangedFiles: string[] = [];

    // ── Resumption: detect which steps already have output on disk ──
    // If a prior run was interrupted, scratch files from completed steps
    // survive. We skip any step whose expected output file already exists,
    // except the synthesis step — always re-run synthesis since the user
    // explicitly triggered a new run (and cleanup only happens after
    // successful synthesis, so existing scratch files prove synthesis
    // hasn't completed yet).
    const skippedSteps = new Set<number>();
    for (let i = 0; i < expandedSteps.length; i++) {
      const step = expandedSteps[i];
      if (step.isSynthesis) continue; // never skip synthesis
      const expectedFile = step.scratchFile ?? step.outputFile;
      if (expectedFile) {
        const exists = await this.fs.fileExists(bookSlug, expectedFile);
        if (exists) {
          skippedSteps.add(i);
          console.log(
            `[MultiCallOrchestrator] Resuming: skipping step ${i + 1} (${step.label}) — ` +
            `${expectedFile} already exists`,
          );
        }
      }
    }

    if (skippedSteps.size > 0) {
      onEvent({
        type: 'status',
        message: `Resuming: ${skippedSteps.size} of ${expandedSteps.length} steps already complete, ` +
          `skipping to step ${[...Array(expandedSteps.length).keys()].find(i => !skippedSteps.has(i))! + 1}`,
      });
    }

    // ── Run all steps sequentially ──────────────────────────────────
    for (let stepIdx = 0; stepIdx < expandedSteps.length; stepIdx++) {
      const step = expandedSteps[stepIdx];
      const stepNum = stepIdx + 1;
      const isFinalStep = stepIdx === expandedSteps.length - 1;

      // Skip steps whose output already exists on disk (resumption)
      if (skippedSteps.has(stepIdx)) {
        onEvent({
          type: 'multiCallProgress',
          step: stepNum,
          totalSteps: expandedSteps.length,
          label: `✓ ${step.label} (cached)`,
        });
        onEvent({
          type: 'status',
          message: `Step ${stepNum}/${expandedSteps.length}: ${step.label} — skipped (output exists)`,
        });
        continue;
      }

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

      // ── Retry loop: attempt each step up to MULTI_CALL_MAX_RETRIES + 1 times ──
      // On retry, bump maxTurns to give the model more room. The most common
      // failure is the model exhausting its turn limit before calling Write.
      let stepSucceeded = false;

      for (let attempt = 0; attempt <= MULTI_CALL_MAX_RETRIES; attempt++) {
        const isRetry = attempt > 0;
        const extraTurns = attempt * MULTI_CALL_RETRY_EXTRA_TURNS;

        // On retry, create a modified step with bumped maxTurns
        const effectiveStep = isRetry
          ? { ...step, maxTurns: step.maxTurns + extraTurns }
          : step;

        if (isRetry) {
          console.log(
            `[MultiCallOrchestrator] Retrying step ${stepNum}/${expandedSteps.length} ` +
            `(attempt ${attempt + 1}/${MULTI_CALL_MAX_RETRIES + 1}, ` +
            `maxTurns: ${effectiveStep.maxTurns})`,
          );
          onEvent({
            type: 'multiCallProgress',
            step: stepNum,
            totalSteps: expandedSteps.length,
            label: `↻ ${step.label} (retry ${attempt}/${MULTI_CALL_MAX_RETRIES})`,
          });
          onEvent({
            type: 'status',
            message: `Retrying step ${stepNum}/${expandedSteps.length}: ${step.label} ` +
              `(attempt ${attempt + 1}/${MULTI_CALL_MAX_RETRIES + 1}, ` +
              `maxTurns bumped to ${effectiveStep.maxTurns})`,
          });
        }

        try {
          const stepChangedFiles = await this.runSingleStep({
            step: effectiveStep,
            stepNum,
            totalSteps: expandedSteps.length,
            isFinalStep,
            agentName,
            conversationId,
            bookSlug,
            appSettings,
            agent,
            manifest,
            chapterBatches,
            modelContextWindow,
            authorProfileAbsPath,
            seriesBiblePath,
            onEvent,
            callId: params.callId,
            thinkingBudgetOverride: params.thinkingBudgetOverride,
          });
          allChangedFiles.push(...stepChangedFiles);

          // Verify the step wrote its expected file (scratch or output).
          // Models can exhaust maxTurns or silently skip the Write call,
          // leaving downstream steps with missing input. Fail fast so the
          // user can retry this step instead of discovering a broken report
          // several steps later.
          const expectedFile = step.scratchFile ?? step.outputFile;
          if (expectedFile) {
            const written = await this.fs.fileExists(bookSlug, expectedFile);
            if (!written) {
              throw new Error(
                `Step "${step.label}" completed but never wrote its expected file ` +
                `${expectedFile}. The model may have exhausted its ` +
                `${effectiveStep.maxTurns}-turn limit before calling the Write tool.`,
              );
            }
          }

          // Step succeeded — break out of the retry loop
          stepSucceeded = true;
          break;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(
            `[MultiCallOrchestrator] Step ${stepNum}/${expandedSteps.length} failed ` +
            `(attempt ${attempt + 1}/${MULTI_CALL_MAX_RETRIES + 1}): ${step.label}`,
            err,
          );

          if (attempt < MULTI_CALL_MAX_RETRIES) {
            // More retries available — log and continue the retry loop
            onEvent({
              type: 'status',
              message: `Step ${stepNum}/${expandedSteps.length} (${step.label}) failed: ${errMsg}. ` +
                `Retrying (${MULTI_CALL_MAX_RETRIES - attempt} attempt(s) remaining)...`,
            });
          } else {
            // All retries exhausted — give up on this step
            onEvent({
              type: 'error',
              message: `Step ${stepNum}/${expandedSteps.length} (${step.label}) failed after ` +
                `${MULTI_CALL_MAX_RETRIES + 1} attempts: ${errMsg}. ` +
                `Prior results saved in ${MULTI_CALL_SCRATCH_DIR}/. ` +
                `You can retry or run individual passes manually.`,
            });
            return { changedFiles: allChangedFiles };
          }
        }
      }

      if (!stepSucceeded) {
        // Safety net — should never reach here because the last catch returns
        return { changedFiles: allChangedFiles };
      }
    }

    // All steps completed and every expected file verified — clean up scratch files
    await this.cleanupScratchFiles(bookSlug, expandedSteps);

    return { changedFiles: allChangedFiles };
  }

  /**
   * Build a minimal system prompt for lightweight read-and-track steps.
   *
   * Skips the full agent markdown (developmental editing framework, lens
   * definitions, etc.) and provides only essential instructions: the book
   * metadata, file manifest, and file-writing instructions.
   */
  private buildLightweightSystemPrompt(manifest: ProjectManifest): string {
    const lines: string[] = [];
    lines.push('You are a careful manuscript reader. Your job is to read chapters and produce structured tracking notes.');
    lines.push('');
    lines.push(`## Active Book`);
    lines.push(`- **Title**: ${manifest.meta.title}`);
    lines.push(`- **Author**: ${manifest.meta.author}`);
    lines.push(`- **Chapters**: ${manifest.chapterCount}`);
    lines.push(`- **Total words**: ${manifest.totalWordCount.toLocaleString()}`);
    lines.push('');
    lines.push('## Available Files');
    for (const f of manifest.files) {
      lines.push(`- \`${f.path}\` (${f.wordCount.toLocaleString()} words)`);
    }
    lines.push('');
    lines.push('## Instructions');
    lines.push('- Use the Read tool to read chapter files.');
    lines.push('- Use the Write tool to create your tracker/notes files.');
    lines.push('- Write files relative to the working directory (e.g. `source/.scratch/...`).');
    lines.push('- Do NOT skip chapters. Read every file listed in your prompt.');
    lines.push('- Be concise in your notes — bullet points, not paragraphs.');
    return lines.join('\n');
  }

  /**
   * Run a single step sequentially.
   * Returns the list of changed files from this step.
   */
  private async runSingleStep(params: {
    step: MultiCallStep;
    stepNum: number;
    totalSteps: number;
    isFinalStep: boolean;
    agentName: AgentName;
    conversationId: string;
    bookSlug: string;
    appSettings: AppSettings;
    agent: Agent;
    manifest: ProjectManifest;
    chapterBatches: Map<string, string>;
    modelContextWindow: number | undefined;
    authorProfileAbsPath: string;
    seriesBiblePath: string | null;
    onEvent: (event: StreamEvent) => void;
    callId?: string;
    thinkingBudgetOverride?: number;
  }): Promise<string[]> {
    const {
      step, stepNum, totalSteps, isFinalStep,
      agentName, conversationId, bookSlug,
      appSettings, agent, manifest, chapterBatches,
      modelContextWindow, authorProfileAbsPath, seriesBiblePath,
      onEvent,
    } = params;

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

    // Resolve thinking budget: per-step override takes priority
    const thinkingBudget = step.thinkingBudgetOverride !== undefined
      ? (step.thinkingBudgetOverride > 0 ? step.thinkingBudgetOverride : undefined)
      : resolveThinkingBudget(
          appSettings,
          agent.thinkingBudget,
          params.thinkingBudgetOverride,
        );

    // Build system prompt: lightweight for read steps, full for analysis/synthesis
    let systemPrompt: string;
    if (step.lightweightPrompt) {
      systemPrompt = this.buildLightweightSystemPrompt(manifest);
    } else {
      const assembled = this.contextBuilder.build({
        agentName,
        agentSystemPrompt: agent.systemPrompt,
        manifest,
        messages: [],
        authorProfilePath: authorProfileAbsPath,
        seriesBiblePath: seriesBiblePath ?? undefined,
        thinkingBudget,
        maxContextTokens: modelContextWindow,
      });
      systemPrompt = assembled.systemPrompt;
    }

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

    const streamKey = conversationId;

    // ── Event interceptor ──────────────────────────────────────
    // Track whether the provider emitted an error event. Since
    // LlamaServerClient.sendMessage() catches errors internally and
    // emits them via callback (never throws), we must detect errors
    // here and re-throw after sendMessage resolves.
    let stepError: string | null = null;

    const wrappedOnEvent = (event: StreamEvent) => {
          if (event.type === 'done' && !isFinalStep) {
            console.log(
              `[MultiCallOrchestrator] Intercepted intermediate done event (step ${stepNum}/${totalSteps})`,
            );
            return;
          }
          if (event.type === 'error') {
            console.warn(
              `[MultiCallOrchestrator] Step ${stepNum}/${totalSteps} error: ${event.message}`,
            );
            // Record the error so we can throw after sendMessage resolves.
            // This is critical for ALL steps including the final one —
            // LlamaServerClient emits errors via callback (never throws),
            // so without this the catch block is never entered and
            // scratch files would be cleaned up despite failure.
            stepError = event.message;
            if (!isFinalStep) {
              onEvent({
                type: 'status',
                message: `Step ${stepNum}/${totalSteps} failed: ${event.message}`,
              });
            }
            return;
          }
          onEvent(event);
        };

    // Start the managed stream
    const stream = this.streamManager.startStream({
      conversationId: streamKey,
      agentName,
      model: appSettings.model,
      bookSlug,
      sessionId,
      callId: params.callId ?? '',
      onEvent: wrappedOnEvent,
    }, {});

    await this.providers.sendMessage({
      model: appSettings.model,
      systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: appSettings.maxTokens,
      thinkingBudget,
      maxTurns: step.maxTurns,
      bookSlug,
      sessionId,
      conversationId: streamKey,
      onEvent: stream.onEvent,
    });

    await stream.awaitPendingHook();

    // Check if the provider emitted an error event during execution.
    // Since sendMessage doesn't throw on errors (it emits them via
    // callback), this is the only way to detect failures.
    if (stepError) {
      throw new Error(stepError);
    }

    const stepChangedFiles = stream.getChangedFiles();
    console.log(
      `[MultiCallOrchestrator] Step ${stepNum}/${totalSteps} complete: ` +
      `${step.label}, files=${stepChangedFiles.join(', ') || 'none'}`,
    );

    return stepChangedFiles;
  }

  /**
   * Expand dynamic steps based on actual manuscript word count.
   *
   * The static step schema defines template read steps with `dynamic: true`.
   * This method expands them into the right number of batches based on
   * total word count, using the agent's own prompt templates.
   *
   * Template convention:
   *   - First dynamic step = template for batch 1 (no prior context)
   *   - Last dynamic step  = template for batches 2..N (reads prior batch file)
   *   - Scratch file refs in templates use the template step's own numbering
   *     (e.g. `<agent>-read-1.md`, `<agent>-read-2.md`) — replaced with actual batch numbers
   *
   * Supported placeholders in step templates (replaced generically):
   *   - `{{CHAPTER_LIST}}`        — chapter file listing for this batch
   *   - `{{READ_TRACKER_FILES}}`  — list of all read-batch scratch files (for analysis steps)
   *   - `{{BATCH_TRACKER_FILES}}` — list of all read-batch scratch files (for synthesis steps)
   *   - `{{BATCH_COUNT}}`         — number of read batches
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

    // Base ID: strip trailing -N (e.g. "agent-read-1" → "agent-read")
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
        // e.g. template has "<agent>-read-2.md" (own) and "<agent>-read-1.md" (prior).
        // For batch 3: own → "<agent>-read-3.md", prior → "<agent>-read-2.md".
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

    // Handle synthesis step: replace placeholders and scale maxTurns.
    // All agent-specific content lives in the step definitions (constants.ts).
    // The orchestrator only performs generic placeholder substitution.
    let updatedSynthesis: MultiCallStep | undefined;
    if (synthesisStep) {
      const scratchFileCount = readSteps.length + staticSteps.filter(s => s.scratchFile).length;
      const dynamicMaxTurns = Math.max(synthesisStep.maxTurns, scratchFileCount + 5);

      // Build the batch tracker file list from expanded read steps
      const batchTrackerFileList = readSteps
        .map(s => `- ${s.scratchFile}`)
        .join('\n');

      // Replace generic placeholders in the synthesis prompt template
      const prompt = synthesisStep.promptTemplate
        .replaceAll('{{BATCH_TRACKER_FILES}}', batchTrackerFileList)
        .replaceAll('{{BATCH_COUNT}}', String(readSteps.length));

      updatedSynthesis = {
        ...synthesisStep,
        maxTurns: dynamicMaxTurns,
        promptTemplate: prompt,
      };
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
   * Compute chapter batches for dynamic steps.
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
