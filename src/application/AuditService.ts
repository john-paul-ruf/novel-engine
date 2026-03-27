import type {
  IAuditService,
  IAgentService,
  IClaudeClient,
  IDatabaseService,
  IFileSystemService,
  ISettingsService,
  IUsageService,
} from '@domain/interfaces';
import type { AuditResult, StreamEvent } from '@domain/types';
import { nanoid } from 'nanoid';
import { VERITY_AUDIT_AGENT_FILE, VERITY_AUDIT_MODEL, VERITY_AUDIT_MAX_TOKENS, AGENT_REGISTRY } from '@domain/constants';
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
    private claude: IClaudeClient,
    private db: IDatabaseService,
    private fs: IFileSystemService,
    private usage: IUsageService,
  ) {}

  /**
   * Run the audit pass on a chapter draft. Returns the parsed audit result.
   * Uses Sonnet for speed and cost. Returns null if the audit call fails.
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
      console.log(`[AuditService] Spawning audit CLI for ${chapterSlug} (model: ${VERITY_AUDIT_MODEL}, session: ${sessionId})`);

      const AUDIT_TIMEOUT_MS = 120_000;

      onEvent({ type: 'callStart', agentName: 'Verity', model: VERITY_AUDIT_MODEL, bookSlug });
      onEvent({ type: 'status', message: `Auditing ${chapterSlug} for voice/style violations…` });

      const cliPromise = this.claude.sendMessage({
        model: VERITY_AUDIT_MODEL,
        systemPrompt: auditorPrompt,
        messages: [{ role: 'user' as const, content: userMessage }],
        maxTokens: VERITY_AUDIT_MAX_TOKENS,
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
              model: VERITY_AUDIT_MODEL,
            });
          }
          onEvent(event);
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          this.claude.abortStream(auditConversationId);
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

    const cliPromise = this.claude.sendMessage({
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
        this.claude.abortStream(fixConversationId);
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
   * This is a silent pre-step: it runs to completion before the main agent call,
   * emitting status events but not saving a conversation (it's infrastructure, not a chat).
   * Uses Sonnet for speed and cost — this is a mechanical pattern-detection task.
   */
  async runMotifAudit(params: {
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
    onEvent({ type: 'callStart', agentName: 'Lumen', model: appSettings.model, bookSlug });
    onEvent({ type: 'status', message: 'Auditing phrase patterns across manuscript…' });

    await this.claude.sendMessage({
      model: appSettings.model,
      systemPrompt,
      messages: [{ role: 'user' as const, content: 'Run the motif/phrase audit now. Read every chapter, build the inventory, and update the flaggedPhrases section in source/motif-ledger.json.' }],
      maxTokens: appSettings.maxTokens,
      thinkingBudget,
      maxTurns: AGENT_REGISTRY.Lumen.maxTurns,
      bookSlug,
      sessionId,
      conversationId: `motif-audit-${sessionId}`,
      onEvent: (event: StreamEvent) => {
        if (event.type === 'done') {
          this.usage.recordUsage({
            conversationId: `motif-audit-${sessionId}`,
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
}
