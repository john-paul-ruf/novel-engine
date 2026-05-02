import type {
  IAuditService,
  IAgentService,
  IProviderRegistry,
  IDatabaseService,
  IFileSystemService,
  ISettingsService,
  IUsageService,
} from '@domain/interfaces';
import type { AuditResult, StreamEvent } from '@domain/types';
import { nanoid } from 'nanoid';
import {
  VERITY_AUDIT_AGENT_FILE,
  VERITY_AUDIT_MODEL,
  VERITY_AUDIT_MAX_TOKENS,
  AGENT_REGISTRY,
  CLAUDE_CLI_PROVIDER_ID,
  MULTI_CALL_SCRATCH_DIR,
  MULTI_CALL_TARGET_WORDS_PER_BATCH,
} from '@domain/constants';
import { resolveThinkingBudget } from './thinkingBudget';

/**
 * AuditService — Owns the chapter audit/fix subsystem.
 *
 * Three cohesive operations:
 * - auditChapter: Run Verity's audit agent on a single chapter draft
 * - fixChapter: Run Verity's fix pass using audit findings
 * - runMotifAudit: Run Lumen's phrase/motif audit across the full manuscript
 */
export class AuditService implements IAuditService {
  constructor(
    private settings: ISettingsService,
    private agents: IAgentService,
    private providers: IProviderRegistry,
    private db: IDatabaseService,
    private fs: IFileSystemService,
    private usage: IUsageService,
  ) {}

  /**
   * Resolve the model for the audit pass.
   *
   * On Claude CLI → use hardcoded Sonnet (fast, cheap, sufficient).
   * On Ollama / other providers → fall back to the user's selected model
   * since Sonnet isn't available through those providers.
   */
  private async resolveAuditModel(): Promise<{ model: string; maxTokens: number }> {
    const appSettings = await this.settings.load();
    const activeProvider = this.providers.getProviderForModel(appSettings.model)
      ?? this.providers.getDefaultProvider();
    const isClaudeCli = activeProvider.providerId === CLAUDE_CLI_PROVIDER_ID;

    if (isClaudeCli) {
      return { model: VERITY_AUDIT_MODEL, maxTokens: VERITY_AUDIT_MAX_TOKENS };
    }
    // Non-Claude provider: use user's model with a reasonable token limit
    return { model: appSettings.model, maxTokens: appSettings.maxTokens };
  }

  /**
   * Run the audit pass on a chapter draft. Returns the parsed audit result.
   * On Claude CLI, uses Sonnet for speed and cost. On other providers,
   * falls back to the user's selected model. Returns null if the audit fails.
   */
  async auditChapter(params: {
    bookSlug: string;
    chapterSlug: string;
    conversationId?: string;
    onEvent?: (event: StreamEvent) => void;
  }): Promise<AuditResult | null> {
    const { bookSlug, chapterSlug, conversationId: targetConversationId } = params;
    const onEvent = params.onEvent ?? (() => {});
    console.log(`[AuditService] auditChapter starting for ${chapterSlug} in ${bookSlug}`);

    // Read the chapter draft
    let draft: string;
    try {
      draft = await this.fs.readFile(bookSlug, `chapters/${chapterSlug}/draft.md`);
      console.log(`[AuditService] Read draft for ${chapterSlug}: ${draft.length} chars`);
    } catch {
      console.warn(`[AuditService] Cannot read draft for ${chapterSlug}, skipping audit`);
      return null;
    }

    // Read supporting context (non-fatal if missing)
    let voiceProfile = '';
    try {
      voiceProfile = await this.fs.readFile(bookSlug, 'source/voice-profile.md');
    } catch { /* no voice profile yet */ }

    let motifLedger = '';
    try {
      const raw = await this.fs.readFile(bookSlug, 'source/motif-ledger.json');
      const parsed = JSON.parse(raw);
      // Extract just the flaggedPhrases section for the auditor
      if (parsed.flaggedPhrases?.length) {
        motifLedger = JSON.stringify(parsed.flaggedPhrases, null, 2);
      }
    } catch { /* no motif ledger yet */ }

    // Load the auditor prompt
    let auditorPrompt: string;
    try {
      auditorPrompt = await this.agents.loadRaw(VERITY_AUDIT_AGENT_FILE);
    } catch {
      console.warn('[AuditService] Audit agent file not found, skipping audit');
      return null;
    }

    // Assemble the user message with all context
    const userMessageParts = [
      `## Chapter Draft (${chapterSlug})\n\n${draft}`,
    ];
    if (voiceProfile) {
      userMessageParts.push(`## Voice Profile\n\n${voiceProfile}`);
    }
    if (motifLedger) {
      userMessageParts.push(`## Flagged Phrases (from motif ledger)\n\n${motifLedger}`);
    }
    const userMessage = userMessageParts.join('\n\n---\n\n');

    if (targetConversationId) {
      this.db.saveMessage({
        conversationId: targetConversationId,
        role: 'user',
        content: `[Auto-audit: ${chapterSlug}]`,
        thinking: '',
      });
    }

    try {
      let responseText = '';
      let thinkingText = '';
      const sessionId = nanoid();
      const auditConversationId = `audit-${sessionId}`;
      if (!targetConversationId) {
        this.ensureEphemeralConversation(auditConversationId, bookSlug, 'Verity');
      }
      const { model: auditModel, maxTokens: auditMaxTokens } = await this.resolveAuditModel();
      console.log(`[AuditService] Spawning audit CLI for ${chapterSlug} (model: ${auditModel}, session: ${sessionId})`);

      const AUDIT_TIMEOUT_MS = 120_000;

      onEvent({ type: 'callStart', agentName: 'Verity', model: auditModel, bookSlug });
      onEvent({ type: 'status', message: `Auditing ${chapterSlug} for voice/style violations…` });

      const cliPromise = this.providers.sendMessage({
        model: auditModel,
        systemPrompt: auditorPrompt,
        messages: [{ role: 'user' as const, content: userMessage }],
        maxTokens: auditMaxTokens,
        maxTurns: 3,
        bookSlug,
        sessionId,
        conversationId: auditConversationId,
        onEvent: (event: StreamEvent) => {
          if (event.type === 'textDelta') {
            responseText += event.text;
          } else if (event.type === 'thinkingDelta') {
            thinkingText += event.text;
          }
          if (event.type === 'done') {
            this.usage.recordUsage({
              conversationId: targetConversationId ?? auditConversationId,
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              thinkingTokens: event.thinkingTokens,
              model: auditModel,
            });
          }
          onEvent(event);
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          this.providers.abortStream(auditConversationId);
          reject(new Error(`Audit timed out after ${AUDIT_TIMEOUT_MS / 1000}s`));
        }, AUDIT_TIMEOUT_MS);
      });

      await Promise.race([cliPromise, timeoutPromise]);

      const clean = responseText.replace(/```json\s*|```/g, '').trim();
      const result = JSON.parse(clean) as AuditResult;

      if (targetConversationId) {
        const severity = result.summary.severity;
        const total = result.summary.total;
        const summaryLine = total > 0
          ? `[Audit complete: ${total} violation${total === 1 ? '' : 's'} — ${severity}]`
          : `[Audit complete: clean]`;
        this.db.saveMessage({
          conversationId: targetConversationId,
          role: 'assistant',
          content: summaryLine,
          thinking: thinkingText,
        });
      }

      return result;
    } catch (err) {
      console.warn(`[AuditService] Audit failed for ${chapterSlug}:`, err);
      return null;
    }
  }

  /**
   * Run the fix pass on a chapter using audit findings. Verity edits the
   * draft in-place to address each violation.
   */
  async fixChapter(params: {
    bookSlug: string;
    chapterSlug: string;
    auditResult: AuditResult;
    conversationId: string;
    sessionId: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void> {
    const { bookSlug, chapterSlug, auditResult, conversationId, sessionId, onEvent } = params;

    const appSettings = await this.settings.load();
    const thinkingBudget = resolveThinkingBudget(appSettings, AGENT_REGISTRY.Verity.thinkingBudget);

    // Build the fix prompt with audit findings (loaded from agent file)
    const auditJson = JSON.stringify(auditResult.violations, null, 2);
    const verityFixTemplate = await this.agents.loadRaw('VERITY-FIX.md');
    const fixInstructions = verityFixTemplate + '\n```json\n' + auditJson + '\n```';

    // Load Verity core + the fix instructions
    const corePrompt = await this.agents.loadComposite(AGENT_REGISTRY.Verity.filename, []);
    const systemPrompt = corePrompt + '\n\n---\n\n' + fixInstructions;

    const userMessage = `Fix the ${auditResult.violations.length} violations identified by the audit in chapters/${chapterSlug}/draft.md. Edit the file in place. Do not rewrite unflagged prose.`;

    // Save synthetic user message
    this.db.saveMessage({
      conversationId,
      role: 'user',
      content: `[Auto-fix: ${auditResult.violations.length} violations in ${chapterSlug}]`,
      thinking: '',
    });

    let responseBuffer = '';
    let thinkingBuffer = '';
    const fixConversationId = `${conversationId}-fix`;

    const FIX_TIMEOUT_MS = 300_000; // 5 minutes — fix pass uses Opus with tool use

    // Emit callStart so CLI Activity panel tracks this call
    onEvent({ type: 'callStart', agentName: 'Verity', model: appSettings.model, bookSlug });
    onEvent({ type: 'status', message: `Fixing ${auditResult.violations.length} violations in ${chapterSlug}…` });

    const cliPromise = this.providers.sendMessage({
      model: appSettings.model, // Opus for fix pass — needs creative judgment
      systemPrompt,
      messages: [{ role: 'user' as const, content: userMessage }],
      maxTokens: appSettings.maxTokens,
      thinkingBudget,
      maxTurns: 10,
      bookSlug,
      sessionId,
      conversationId: fixConversationId,
      onEvent: (event: StreamEvent) => {
        if (event.type === 'textDelta') {
          responseBuffer += event.text;
        } else if (event.type === 'thinkingDelta') {
          thinkingBuffer += event.text;
        }

        if (event.type === 'done') {
          // Save the fix response
          this.db.saveMessage({
            conversationId,
            role: 'assistant',
            content: responseBuffer || '[Fix pass completed]',
            thinking: thinkingBuffer,
          });

          this.usage.recordUsage({
            conversationId,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            thinkingTokens: event.thinkingTokens,
            model: appSettings.model,
          });
        }

        // Forward ALL events to IPC layer for CLI Activity visibility
        onEvent(event);
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        this.providers.abortStream(fixConversationId);
        reject(new Error(`Fix pass timed out after ${FIX_TIMEOUT_MS / 1000}s`));
      }, FIX_TIMEOUT_MS);
    });

    await Promise.race([cliPromise, timeoutPromise]);
  }

  /**
   * Run a scoped Lumen motif/phrase audit — Lens 8 only.
   * Reads the full manuscript, identifies repeated phrases and editorial intrusions,
   * and updates the motif ledger's flaggedPhrases section in source/motif-ledger.json.
   *
   * Two modes:
   *
   * 1. **Claude CLI** (single call) — Reads the full manuscript in one go via
   *    tool calls. Claude's 200K context handles even large manuscripts.
   *
   * 2. **Ollama / other providers** (multi-call sipping) — Breaks the read
   *    into batches of ~MULTI_CALL_TARGET_WORDS_PER_BATCH words. Each batch
   *    reads its chapters and writes a phrase tracker to source/.scratch/.
   *    A final synthesis call reads all trackers and updates the motif ledger.
   */
  async runMotifAudit(params: {
    bookSlug: string;
    appSettings: { model: string; maxTokens: number; enableThinking: boolean; thinkingBudget: number; overrideThinkingBudget: boolean };
    onEvent: (event: StreamEvent) => void;
    sessionId: string;
  }): Promise<void> {
    const { appSettings } = params;

    const activeProvider = this.providers.getProviderForModel(appSettings.model)
      ?? this.providers.getDefaultProvider();
    const isClaudeCli = activeProvider.providerId === CLAUDE_CLI_PROVIDER_ID;

    if (isClaudeCli) {
      await this.runMotifAuditSingleCall(params);
    } else {
      await this.runMotifAuditMultiCall(params);
    }
  }

  // ── Motif audit: single-call mode (Claude CLI) ──────────────────────────

  private async runMotifAuditSingleCall(params: {
    bookSlug: string;
    appSettings: { model: string; maxTokens: number; enableThinking: boolean; thinkingBudget: number; overrideThinkingBudget: boolean };
    onEvent: (event: StreamEvent) => void;
    sessionId: string;
  }): Promise<void> {
    const { bookSlug, appSettings, onEvent, sessionId } = params;

    let lumenAgent;
    try {
      lumenAgent = await this.agents.load('Lumen');
    } catch {
      console.warn('[motif-audit] Lumen agent not found, skipping motif audit');
      return;
    }

    const manifest = await this.fs.getProjectManifest(bookSlug);
    if (manifest.chapterCount === 0) {
      return;
    }

    const chapterListing = manifest.files
      .filter((f) => f.path.startsWith('chapters/') && f.path.endsWith('/draft.md'))
      .map((f) => `- \`${f.path}\` (${f.wordCount.toLocaleString()} words)`)
      .join('\n');

    const otherFiles = manifest.files
      .filter((f) => !f.path.startsWith('chapters/'))
      .map((f) => `- \`${f.path}\` (${f.wordCount.toLocaleString()} words)`)
      .join('\n');

    const motifAuditInstructions = await this.agents.loadRaw('MOTIF-AUDIT.md');
    let systemPrompt = lumenAgent.systemPrompt + '\n\n---\n\n' + motifAuditInstructions;
    systemPrompt += `\n\n## Chapters to Audit (in order)\n\n${chapterListing}`;
    if (otherFiles) {
      systemPrompt += `\n\n## Other Files\n\n${otherFiles}`;
    }

    const thinkingBudget = resolveThinkingBudget(appSettings, lumenAgent.thinkingBudget);

    // Emit callStart so CLI Activity panel tracks this call
    const motifConvId = `motif-audit-${sessionId}`;
    this.ensureEphemeralConversation(motifConvId, bookSlug, 'Lumen');
    onEvent({ type: 'callStart', agentName: 'Lumen', model: appSettings.model, bookSlug });
    onEvent({ type: 'status', message: 'Auditing phrase patterns across manuscript…' });

    await this.providers.sendMessage({
      model: appSettings.model,
      systemPrompt,
      messages: [{ role: 'user' as const, content: 'Run the motif/phrase audit now. Read every chapter, build the inventory, and update the flaggedPhrases section in source/motif-ledger.json.' }],
      maxTokens: appSettings.maxTokens,
      thinkingBudget,
      maxTurns: AGENT_REGISTRY.Lumen.maxTurns,
      bookSlug,
      sessionId,
      conversationId: motifConvId,
      onEvent: (event: StreamEvent) => {
        if (event.type === 'done') {
          this.usage.recordUsage({
            conversationId: motifConvId,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            thinkingTokens: event.thinkingTokens,
            model: appSettings.model,
          });
        }
        // Forward ALL events to IPC layer for CLI Activity visibility
        onEvent(event);
      },
    });
  }

  // ── Motif audit: multi-call sipping mode (Ollama / non-Claude-CLI) ──────

  private async runMotifAuditMultiCall(params: {
    bookSlug: string;
    appSettings: { model: string; maxTokens: number; enableThinking: boolean; thinkingBudget: number; overrideThinkingBudget: boolean };
    onEvent: (event: StreamEvent) => void;
    sessionId: string;
  }): Promise<void> {
    const { bookSlug, appSettings, onEvent, sessionId } = params;
    const model = appSettings.model;

    let lumenAgent;
    try {
      lumenAgent = await this.agents.load('Lumen');
    } catch {
      console.warn('[motif-audit] Lumen agent not found, skipping motif audit');
      return;
    }

    const manifest = await this.fs.getProjectManifest(bookSlug);
    if (manifest.chapterCount === 0) {
      return;
    }

    const chapters = manifest.files
      .filter((f) => f.path.startsWith('chapters/') && f.path.endsWith('/draft.md'))
      .sort((a, b) => a.path.localeCompare(b.path));

    if (chapters.length === 0) return;

    const motifAuditInstructions = await this.agents.loadRaw('MOTIF-AUDIT.md');
    const batches = this.computeWordCountBatches(chapters);
    const totalSteps = batches.length + 1; // N read batches + 1 synthesis
    const thinkingBudget = resolveThinkingBudget(appSettings, lumenAgent.thinkingBudget);
    const scratchFiles: string[] = [];

    console.log(
      `[AuditService] Motif audit multi-call sipping: ${batches.length} read batch(es) + synthesis ` +
      `for ${chapters.length} chapters, model=${model}`,
    );

    // ── Read batches — scan chapters for repeated phrases ──────────────

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      const stepNum = batchIdx + 1;
      const scratchFile = `${MULTI_CALL_SCRATCH_DIR}/motif-audit-batch-${stepNum}.md`;
      scratchFiles.push(scratchFile);

      const batchLabel = batches.length === 1
        ? 'Scanning manuscript for phrase patterns'
        : `Scanning batch ${stepNum}/${batches.length} for phrase patterns`;

      onEvent({
        type: 'multiCallProgress',
        step: stepNum,
        totalSteps,
        label: batchLabel,
      });
      onEvent({ type: 'status', message: `Step ${stepNum}/${totalSteps}: ${batchLabel}` });

      const chapterListing = batch
        .map((ch) => {
          const name = ch.path.replace('chapters/', '').replace('/draft.md', '');
          return `- \`${ch.path}\` — ${name} (${ch.wordCount.toLocaleString()} words)`;
        })
        .join('\n');

      // Prior batch context: carry forward cumulative phrase inventory
      const prevScratchFile = batchIdx > 0 ? scratchFiles[batchIdx - 1] : null;
      const priorContext = prevScratchFile
        ? `\n2. Use the **Read** tool on \`${prevScratchFile}\` to carry forward the running phrase inventory from the previous batch.\n`
        : '';
      const stepAfterPrior = prevScratchFile ? '3' : '2';

      const batchPrompt = `Scan ${batches.length === 1 ? 'the' : `batch ${stepNum} of ${batches.length} of the`} manuscript for repeated phrases, constructions, and editorial intrusions${batchIdx > 0 ? ', continuing from where you left off' : ''}.

${chapterListing}

**Instructions:**
1. Use the **Read** tool on each chapter file listed above, one at a time, in order.${priorContext}
${stepAfterPrior}. After reading ALL chapters in this batch, use the **Write** tool to create \`${scratchFile}\`.

Track every repeated element you find:
- **Thematic phrases**: Exact or near-exact phrases reused across chapters
- **Structural formulations**: Sentence templates reused with different nouns
- **Editorial intrusions**: Narrator explaining what a scene already shows
- **Rhetorical moves**: Repeated paragraph shapes or argumentative structures

For each, record: the exact phrase/construction, every chapter where it appears, and the total count.

**IMPORTANT: You MUST use the Write tool to create \`${scratchFile}\` before finishing.** Do not end without writing the file.

${batches.length > 1 ? `Do NOT update source/motif-ledger.json yet — this is batch ${stepNum} of ${batches.length}.` : 'Do NOT update source/motif-ledger.json yet — that comes in the next step.'}`;

      const batchSystemPrompt = lumenAgent.systemPrompt + '\n\n---\n\n' +
        'You are running a SCOPED PHRASE & MOTIF AUDIT — Lens 8 only.\n' +
        'This is a batch scan step. Read methodically, tracking every repeated element.\n' +
        'Be exhaustive — every repeated phrase matters.';

      const batchSessionId = nanoid();
      const batchConversationId = `motif-audit-batch-${batchSessionId}`;
      this.ensureEphemeralConversation(batchConversationId, bookSlug, 'Lumen');

      // Intermediate steps: intercept done/error to prevent caller teardown
      const wrappedOnEvent = (event: StreamEvent) => {
        if (event.type === 'done') {
          this.usage.recordUsage({
            conversationId: batchConversationId,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            thinkingTokens: event.thinkingTokens,
            model,
          });
          console.log(`[AuditService] Intercepted intermediate done (motif batch ${stepNum}/${batches.length})`);
          return;
        }
        if (event.type === 'error') {
          console.warn(`[AuditService] Motif batch ${stepNum} error: ${event.message}`);
          onEvent({ type: 'status', message: `Motif batch ${stepNum} warning: ${event.message}` });
          return;
        }
        onEvent(event);
      };

      try {
        onEvent({ type: 'callStart', agentName: 'Lumen', model, bookSlug });

        await this.providers.sendMessage({
          model,
          systemPrompt: batchSystemPrompt,
          messages: [{ role: 'user', content: batchPrompt }],
          maxTokens: appSettings.maxTokens,
          thinkingBudget,
          maxTurns: 15, // Enough for: N chapter reads + 1 prior-tracker read + 1 write + buffer
          bookSlug,
          sessionId: batchSessionId,
          conversationId: batchConversationId,
          onEvent: wrappedOnEvent,
        });

        console.log(`[AuditService] Motif batch ${stepNum}/${batches.length} complete`);
      } catch (err) {
        console.error(`[AuditService] Motif batch ${stepNum} failed:`, err);
        onEvent({
          type: 'error',
          message: `Motif audit batch ${stepNum}/${batches.length} failed: ` +
            `${err instanceof Error ? err.message : String(err)}. ` +
            `Partial scan saved in ${MULTI_CALL_SCRATCH_DIR}/. You can retry.`,
        });
        return;
      }
    }

    // ── Synthesis step — read all batch trackers, update motif ledger ──

    const synthLabel = 'Updating motif ledger';
    onEvent({
      type: 'multiCallProgress',
      step: totalSteps,
      totalSteps,
      label: synthLabel,
    });
    onEvent({ type: 'status', message: `Step ${totalSteps}/${totalSteps}: ${synthLabel}` });

    const scratchFileList = scratchFiles
      .map((f) => `- \`${f}\``)
      .join('\n');

    const synthPrompt = `Now synthesize your phrase/motif findings and update the motif ledger.

Read your batch scan notes (use the Read tool on each file):
${scratchFileList}

Also read \`source/motif-ledger.json\` if it exists (to preserve non-flaggedPhrases sections).
Also read \`source/reader-report.md\` if it exists (check for "Repetition Fatigue" section — prioritize phrases the reader actually noticed).

Then UPDATE \`source/motif-ledger.json\`. Rebuild the \`flaggedPhrases\` array from ground truth — your audit replaces whatever was there before. Each entry uses this shape:

\`\`\`json
{
  "id": "<short lowercase alphanumeric, 8-12 chars>",
  "phrase": "<the exact phrase or construction>",
  "category": "<retired | limited | crutch | anti-pattern>",
  "alternatives": ["<suggested replacement 1>", "<suggested replacement 2>"],
  "limit": "<number or omit — only for 'limited' category>",
  "limitChapters": ["<chapter slug where use is allowed>"],
  "notes": "<actual uses count, chapter list, recommendation>"
}
\`\`\`

Category mapping:
- RETIRE → "retired" (banned)
- KEEP 2 → "limited" with limit: 2
- ELIMINATE ALL → "retired"
- Editorial intrusions → "anti-pattern"

Preserve all other sections of the motif ledger (systems, entries, structuralDevices, foreshadows, minorCharacters, auditLog) unchanged. Only replace flaggedPhrases.

After updating the ledger, respond with a brief summary: how many phrases found, how many flagged for retirement, and the 3 worst offenders.`;

    const synthSessionId = nanoid();
    const synthConversationId = `motif-audit-synth-${synthSessionId}`;
    this.ensureEphemeralConversation(synthConversationId, bookSlug, 'Lumen');
    const synthSystemPrompt = lumenAgent.systemPrompt + '\n\n---\n\n' + motifAuditInstructions;

    onEvent({ type: 'callStart', agentName: 'Lumen', model, bookSlug });

    try {
      await this.providers.sendMessage({
        model,
        systemPrompt: synthSystemPrompt,
        messages: [{ role: 'user', content: synthPrompt }],
        maxTokens: appSettings.maxTokens,
        thinkingBudget,
        maxTurns: scratchFiles.length + 5, // reads + ledger read + reader-report read + write + buffer
        bookSlug,
        sessionId: synthSessionId,
        conversationId: synthConversationId,
        onEvent: (event: StreamEvent) => {
          if (event.type === 'done') {
            this.usage.recordUsage({
              conversationId: synthConversationId,
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              thinkingTokens: event.thinkingTokens,
              model,
            });
          }
          // Final step — let all events through (including done)
          onEvent(event);
        },
      });

      // Clean up scratch files after successful synthesis
      await this.cleanupScratchFiles(bookSlug, scratchFiles);
    } catch (err) {
      console.error('[AuditService] Motif audit synthesis failed:', err);
      onEvent({
        type: 'error',
        message: `Motif audit synthesis failed: ${err instanceof Error ? err.message : String(err)}. ` +
          `Batch scan notes preserved in ${MULTI_CALL_SCRATCH_DIR}/ — you can retry.`,
      });
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Create an ephemeral conversation row so that token_usage FK constraint
   * is satisfied when recording usage for audit sub-calls.
   */
  private ensureEphemeralConversation(id: string, bookSlug: string, agentName: 'Verity' | 'Lumen'): void {
    try {
      this.db.createConversation({
        id,
        bookSlug,
        agentName,
        pipelinePhase: null,
        purpose: 'pipeline',
        title: `[audit] ${id}`,
      });
    } catch {
      // Row may already exist (e.g. retry) — ignore
    }
  }

  /**
   * Split chapters into word-count-balanced batches.
   * Targets ~MULTI_CALL_TARGET_WORDS_PER_BATCH words per batch.
   */
  private computeWordCountBatches(
    chapters: { path: string; wordCount: number }[],
  ): { path: string; wordCount: number }[][] {
    const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
    const batchCount = Math.max(1, Math.min(8, Math.ceil(totalWords / MULTI_CALL_TARGET_WORDS_PER_BATCH)));

    if (batchCount === 1) return [chapters];

    const targetPerBatch = Math.ceil(totalWords / batchCount);
    const batches: typeof chapters[] = [];
    let current: typeof chapters = [];
    let currentWords = 0;

    for (const ch of chapters) {
      current.push(ch);
      currentWords += ch.wordCount;

      if (currentWords >= targetPerBatch && batches.length < batchCount - 1) {
        batches.push(current);
        current = [];
        currentWords = 0;
      }
    }

    if (current.length > 0) {
      batches.push(current);
    }

    return batches;
  }

  /**
   * Delete scratch files after successful synthesis.
   */
  private async cleanupScratchFiles(bookSlug: string, scratchFiles: string[]): Promise<void> {
    for (const file of scratchFiles) {
      try {
        const exists = await this.fs.fileExists(bookSlug, file);
        if (exists) {
          await this.fs.deleteFile(bookSlug, file);
          console.log(`[AuditService] Cleaned up ${file}`);
        }
      } catch (err) {
        console.warn(`[AuditService] Failed to clean up ${file}:`, err);
      }
    }

    // Remove scratch dir if empty
    try {
      const entries = await this.fs.listDirectory(bookSlug, MULTI_CALL_SCRATCH_DIR);
      if (entries.length === 0) {
        await this.fs.deletePath(bookSlug, MULTI_CALL_SCRATCH_DIR);
        console.log(`[AuditService] Removed empty ${MULTI_CALL_SCRATCH_DIR}/`);
      }
    } catch {
      // Directory may not exist — fine
    }
  }
}
