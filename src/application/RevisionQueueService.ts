import { nanoid } from 'nanoid';
import { createHash } from 'crypto';
import type {
  RevisionPlan,
  RevisionSession,
  RevisionSessionStatus,
  RevisionQueueEvent,
  QueueMode,
  ApprovalAction,
  AgentName,
  StreamEvent,
  Agent,
  AppSettings,
} from '@domain/types';
import type {
  IRevisionQueueService,
  IFileSystemService,
  IClaudeClient,
  IAgentService,
  IDatabaseService,
  ISettingsService,
} from '@domain/interfaces';
import {
  WRANGLER_SESSION_PARSE_PROMPT,
  WRANGLER_MODEL,
} from '@domain/constants';
import { ContextBuilder } from './ContextBuilder';

// ── Cache types ──────────────────────────────────────────────────────

/** Structured output from the wrangler CLI parse. */
type ParsedWranglerOutput = {
  sessions: {
    index: number;
    title: string;
    chapters: string[];
    taskNumbers: number[];
    model: 'opus' | 'sonnet';
    prompt: string;
    notes: string;
  }[];
  totalTasks: number;
  completedTaskNumbers: number[];
  phases: { number: number; name: string; taskCount: number; completedCount: number; taskNumbers?: number[] }[];
};

/** On-disk wrangler parse cache (avoids re-calling CLI when files haven't changed). */
type PlanCache = {
  contentHash: string;
  parsed: ParsedWranglerOutput;
  cachedAt: string;
};

/** On-disk session state — survives app restarts so progress isn't lost. */
type SessionStateFile = {
  planHash: string;
  mode: QueueMode;
  sessions: Record<number, {
    status: RevisionSessionStatus;
    conversationId: string | null;
  }>;
};

const CACHE_PATH = 'source/.revision-plan-cache.json';
const STATE_PATH = 'source/.revision-queue-state.json';

export class RevisionQueueService implements IRevisionQueueService {
  private plans: Map<string, RevisionPlan> = new Map();
  /** Quick lookup: bookSlug → planId for the most recent plan per book. */
  private plansByBook: Map<string, string> = new Map();
  /** Cached content hash per book — avoids re-reading files on every persistState call. */
  private hashByBook: Map<string, string> = new Map();
  private listeners: Set<(event: RevisionQueueEvent) => void> = new Set();
  private paused: boolean = false;
  private gateResolvers: Map<string, (decision: { action: ApprovalAction; message?: string }) => void> = new Map();
  private autoApproveSessionIds: Set<string> = new Set();

  constructor(
    private fs: IFileSystemService,
    private claude: IClaudeClient,
    private agents: IAgentService,
    private db: IDatabaseService,
    private settings: ISettingsService,
  ) {}

  onEvent(callback: (event: RevisionQueueEvent) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(event: RevisionQueueEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  // ── Hashing & cache helpers ──────────────────────────────────────

  private computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  private async readCache(bookSlug: string): Promise<PlanCache | null> {
    try {
      const raw = await this.fs.readFile(bookSlug, CACHE_PATH);
      return JSON.parse(raw) as PlanCache;
    } catch {
      return null;
    }
  }

  private async writeCache(bookSlug: string, cache: PlanCache): Promise<void> {
    try {
      await this.fs.writeFile(bookSlug, CACHE_PATH, JSON.stringify(cache, null, 2));
    } catch {
      // Best-effort — don't fail the plan load
    }
  }

  private async readState(bookSlug: string): Promise<SessionStateFile | null> {
    try {
      const raw = await this.fs.readFile(bookSlug, STATE_PATH);
      return JSON.parse(raw) as SessionStateFile;
    } catch {
      return null;
    }
  }

  private async writeState(bookSlug: string, plan: RevisionPlan, contentHash: string): Promise<void> {
    const state: SessionStateFile = {
      planHash: contentHash,
      mode: plan.mode,
      sessions: {},
    };
    for (const s of plan.sessions) {
      state.sessions[s.index] = {
        status: s.status,
        conversationId: s.conversationId,
      };
    }
    try {
      await this.fs.writeFile(bookSlug, STATE_PATH, JSON.stringify(state, null, 2));
    } catch {
      // Best-effort
    }
  }

  // ── Plan loading with cache ──────────────────────────────────────

  async loadPlan(bookSlug: string): Promise<RevisionPlan> {
    // 1. Read source files
    let revisionPromptsContent: string | null = null;
    let projectTasksContent: string | null = null;

    this.emit({ type: 'plan:loading-step', step: 'Reading source files…' });
    try {
      revisionPromptsContent = await this.fs.readFile(bookSlug, 'source/revision-prompts.md');
    } catch {
      // File may not exist
    }
    try {
      projectTasksContent = await this.fs.readFile(bookSlug, 'source/project-tasks.md');
    } catch {
      // File may not exist
    }

    // 1a. Determine which revision cycle we're in.
    //
    // Sable's output (audit-report.md) signals the copy-edit phase is complete,
    // meaning we are now in the SECOND revision cycle (mechanical fixes).
    // The first-cycle files must have been archived (project-tasks-v1.md exists)
    // before the second queue can load. If they weren't archived, the live files
    // belong to the first cycle and must not be run as the second cycle's plan.
    const [auditExists, archivedTasksExist] = await Promise.all([
      this.fs.fileExists(bookSlug, 'source/audit-report.md'),
      this.fs.fileExists(bookSlug, 'source/project-tasks-v1.md'),
    ]);

    if (auditExists && !archivedTasksExist && (revisionPromptsContent || projectTasksContent)) {
      throw new Error(
        'Sable has completed copy editing, but the first revision queue has not been archived. ' +
        'Open the revision queue, review any remaining sessions, then click "Complete Queue" to ' +
        'archive it before working on mechanical fixes.',
      );
    }

    if (!revisionPromptsContent && !projectTasksContent) {
      if (auditExists) {
        throw new Error(
          'No mechanical fixes plan found. Run Forge to generate the mechanical fixes task list and session prompts.',
        );
      }
      throw new Error('No revision plan found. Run Forge first to generate project tasks and revision prompts.');
    }

    // 2. Compute content hash
    const combinedContent = (revisionPromptsContent ?? '') + '\0' + (projectTasksContent ?? '');
    const contentHash = this.computeHash(combinedContent);

    // 3. Check disk cache — if hash matches, skip the CLI call entirely
    let parsed: ParsedWranglerOutput;
    const cache = await this.readCache(bookSlug);

    if (cache && cache.contentHash === contentHash) {
      this.emit({ type: 'plan:loading-step', step: 'Loaded from cache (files unchanged)' });
      parsed = cache.parsed;
    } else {
      const promptSize = (revisionPromptsContent?.length ?? 0);
      const taskSize = (projectTasksContent?.length ?? 0);
      const totalChars = promptSize + taskSize;
      this.emit({
        type: 'plan:loading-step',
        step: `Sending ${Math.round(totalChars / 1000)}k chars to Wrangler (${WRANGLER_MODEL})…`,
      });

      this.emit({
        type: 'session:streamEvent',
        sessionId: '__plan-load__',
        event: { type: 'callStart', agentName: 'Wrangler' as AgentName, model: WRANGLER_MODEL, bookSlug },
      });
      this.emit({
        type: 'session:streamEvent',
        sessionId: '__plan-load__',
        event: { type: 'status', message: `Parsing revision plan (${Math.round(totalChars / 1000)}k chars)…` },
      });

      const userMessage = `## revision-prompts.md\n\n${revisionPromptsContent ?? '(File does not exist)'}\n\n## project-tasks.md\n\n${projectTasksContent ?? '(File does not exist)'}`;

      let rawResponse = '';
      let cliError = '';
      await this.claude.sendMessage({
        model: WRANGLER_MODEL,
        systemPrompt: WRANGLER_SESSION_PARSE_PROMPT,
        messages: [{ role: 'user' as const, content: userMessage }],
        maxTokens: 8192,
        onEvent: (event) => {
          if (event.type === 'textDelta') {
            rawResponse += event.text;
          } else if (event.type === 'error') {
            cliError = event.message;
          }
        },
      });

      if (!rawResponse.trim() && cliError) {
        throw new Error(`Wrangler CLI call failed: ${cliError}`);
      }

      this.emit({
        type: 'session:streamEvent',
        sessionId: '__plan-load__',
        event: { type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0 },
      });

      this.emit({ type: 'plan:loading-step', step: 'Parsing Wrangler response…' });

      try {
        const jsonStart = rawResponse.indexOf('{');
        const jsonEnd = rawResponse.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) {
          throw new Error('No JSON object found in response');
        }
        parsed = JSON.parse(rawResponse.slice(jsonStart, jsonEnd + 1));
      } catch (err) {
        throw new Error(
          `Failed to parse Wrangler response as JSON: ${err instanceof Error ? err.message : String(err)}. Response starts with: "${rawResponse.slice(0, 200)}"`,
        );
      }

      // Write cache for next time
      await this.writeCache(bookSlug, {
        contentHash,
        parsed,
        cachedAt: new Date().toISOString(),
      });
    }

    // 4. Build plan from parsed data
    this.emit({
      type: 'plan:loading-step',
      step: `Building ${parsed.sessions.length} sessions (${parsed.totalTasks} tasks)…`,
    });

    const completedSet = new Set(parsed.completedTaskNumbers);

    const sessions: RevisionSession[] = parsed.sessions.map((s) => ({
      id: nanoid(),
      index: s.index,
      title: s.title,
      chapters: s.chapters,
      taskNumbers: s.taskNumbers,
      model: s.model,
      prompt: s.prompt,
      notes: s.notes,
      status: s.taskNumbers.length > 0 && s.taskNumbers.every((n) => completedSet.has(n))
        ? 'approved' as RevisionSessionStatus
        : 'pending' as RevisionSessionStatus,
      conversationId: null,
      response: '',
    }));

    // 5. Merge saved session state (if hash matches — same plan)
    const savedState = await this.readState(bookSlug);
    if (savedState && savedState.planHash === contentHash) {
      this.emit({ type: 'plan:loading-step', step: 'Restoring session progress…' });
      for (const session of sessions) {
        const saved = savedState.sessions[session.index];
        if (saved) {
          // Only restore terminal/paused statuses — don't restore 'running' or 'awaiting-approval'
          // since those are ephemeral states tied to an active CLI process
          if (saved.status === 'approved' || saved.status === 'rejected' || saved.status === 'skipped') {
            session.status = saved.status;
          }
          if (saved.conversationId) {
            session.conversationId = saved.conversationId;
          }
        }
      }
    }

    const reconciledCompleted = new Set(parsed.completedTaskNumbers);
    for (const session of sessions) {
      if (session.status === 'approved') {
        for (const tn of session.taskNumbers) {
          reconciledCompleted.add(tn);
        }
      }
    }

    const plan: RevisionPlan = {
      id: nanoid(),
      bookSlug,
      sessions,
      totalTasks: parsed.totalTasks,
      completedTaskNumbers: [...reconciledCompleted],
      phases: parsed.phases,
      mode: savedState?.planHash === contentHash ? savedState.mode : 'manual',
      createdAt: new Date().toISOString(),
    };

    this.plans.set(plan.id, plan);
    this.plansByBook.set(bookSlug, plan.id);
    this.hashByBook.set(bookSlug, contentHash);
    return plan;
  }

  async clearCache(bookSlug: string): Promise<void> {
    // Delete the plan cache to force a fresh parse on next load
    try {
      await this.fs.deleteFile(bookSlug, CACHE_PATH);
      this.emit({ type: 'plan:loading-step', step: 'Cache cleared' });
    } catch {
      // Cache file may not exist — that's fine
    }
    // Clear in-memory caches
    const planId = this.plansByBook.get(bookSlug);
    if (planId) {
      this.plans.delete(planId);
      this.plansByBook.delete(bookSlug);
    }
    this.hashByBook.delete(bookSlug);
  }

  async completeQueue(planId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');

    // Guard: all sessions must be in a terminal state
    const blocked = plan.sessions.filter(
      (s) => s.status === 'pending' || s.status === 'running' || s.status === 'awaiting-approval',
    );
    if (blocked.length > 0) {
      throw new Error(
        `Cannot archive: ${blocked.length} session(s) are still pending, running, or awaiting approval.`,
      );
    }

    // Move project-tasks.md → project-tasks-v1.md (overwrite if re-archiving)
    const tasksExists = await this.fs.fileExists(plan.bookSlug, 'source/project-tasks.md');
    if (tasksExists) {
      try {
        // Read then write to handle potential rename collision across file-system boundaries
        const content = await this.fs.readFile(plan.bookSlug, 'source/project-tasks.md');
        await this.fs.writeFile(plan.bookSlug, 'source/project-tasks-v1.md', content);
        await this.fs.deleteFile(plan.bookSlug, 'source/project-tasks.md');
      } catch (err) {
        console.error('Failed to archive project-tasks.md:', err);
      }
    }

    // Move revision-prompts.md → revision-prompts-v1.md
    const promptsExists = await this.fs.fileExists(plan.bookSlug, 'source/revision-prompts.md');
    if (promptsExists) {
      try {
        const content = await this.fs.readFile(plan.bookSlug, 'source/revision-prompts.md');
        await this.fs.writeFile(plan.bookSlug, 'source/revision-prompts-v1.md', content);
        await this.fs.deleteFile(plan.bookSlug, 'source/revision-prompts.md');
      } catch (err) {
        console.error('Failed to archive revision-prompts.md:', err);
      }
    }

    // Also clear the plan cache so the next loadPlan starts fresh
    try {
      await this.fs.deleteFile(plan.bookSlug, CACHE_PATH);
      await this.fs.deleteFile(plan.bookSlug, STATE_PATH);
    } catch {
      // Best-effort
    }

    // Remove from in-memory maps
    this.plans.delete(planId);
    this.plansByBook.delete(plan.bookSlug);
    this.hashByBook.delete(plan.bookSlug);

    this.emit({ type: 'queue:archived' });
  }

  // ── Session execution ────────────────────────────────────────────

  async runSession(planId: string, sessionId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');

    const session = plan.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Session not found');

    if (session.status !== 'pending' && session.status !== 'rejected') {
      throw new Error('Session is not runnable.');
    }

    session.status = 'running';
    this.emit({ type: 'session:status', sessionId: session.id, status: 'running' });

    const verity = await this.agents.load('Verity' as AgentName);
    const appSettings = await this.settings.load();

    const model = session.model === 'sonnet'
      ? 'claude-sonnet-4-20250514'
      : appSettings.model;

    const conversation = this.db.createConversation({
      id: nanoid(),
      bookSlug: plan.bookSlug,
      agentName: 'Verity' as AgentName,
      pipelinePhase: null,
      purpose: 'pipeline',
      title: session.title,
    });

    session.conversationId = conversation.id;
    await this.persistState(plan);

    this.db.saveMessage({
      conversationId: conversation.id,
      role: 'user',
      content: session.prompt,
      thinking: '',
    });

    const manifest = await this.fs.getProjectManifest(plan.bookSlug);
    const messages = this.db.getMessages(conversation.id);
    const contextBuilder = new ContextBuilder();
    const assembled = contextBuilder.build({
      agentName: 'Verity' as AgentName,
      agentSystemPrompt: verity.systemPrompt,
      manifest,
      messages,
    });
    const systemPrompt = assembled.systemPrompt;

    await this.runConversationLoop(session, plan, systemPrompt, model, appSettings, verity);
  }

  private async runConversationLoop(
    session: RevisionSession,
    plan: RevisionPlan,
    systemPrompt: string,
    model: string,
    settings: AppSettings,
    verity: Agent,
  ): Promise<void> {
    const messages = this.db.getMessages(session.conversationId!);
    const conversationMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    let responseBuffer = '';
    let thinkingBuffer = '';

    this.emit({
      type: 'session:streamEvent',
      sessionId: session.id,
      event: { type: 'callStart', agentName: 'Verity' as AgentName, model, bookSlug: plan.bookSlug },
    });

    try {
      await this.claude.sendMessage({
        model,
        systemPrompt,
        messages: conversationMessages,
        maxTokens: settings.maxTokens,
        thinkingBudget: settings.enableThinking ? verity.thinkingBudget : undefined,
        onEvent: (event: StreamEvent) => {
          this.emit({ type: 'session:streamEvent', sessionId: session.id, event });

          switch (event.type) {
            case 'textDelta':
              responseBuffer += event.text;
              session.response += event.text;
              this.emit({ type: 'session:chunk', sessionId: session.id, text: event.text });
              break;
            case 'thinkingDelta':
              thinkingBuffer += event.text;
              this.emit({ type: 'session:thinking', sessionId: session.id, text: event.text });
              break;
            case 'done':
              this.db.saveMessage({
                conversationId: session.conversationId!,
                role: 'assistant',
                content: responseBuffer,
                thinking: thinkingBuffer,
              });
              break;
            case 'error':
              this.emit({ type: 'error', sessionId: session.id, message: event.message });
              break;
          }
        },
      });
    } catch (err) {
      session.status = 'rejected';
      this.emit({ type: 'session:status', sessionId: session.id, status: 'rejected' });
      this.emit({ type: 'error', sessionId: session.id, message: err instanceof Error ? err.message : String(err) });
      await this.persistState(plan);
      return;
    }

    // Check for approval gate
    if (this.isApprovalGate(responseBuffer)) {
      if (plan.mode === 'auto-approve' || this.autoApproveSessionIds.has(session.id)) {
        await this.sendFollowUp(session, 'Approved. Continue with the next task.');
        return this.runConversationLoop(session, plan, systemPrompt, model, settings, verity);
      } else if (plan.mode === 'auto-skip') {
        await this.sendFollowUp(session, 'Skip this task and move to the next one without waiting for approval.');
        return this.runConversationLoop(session, plan, systemPrompt, model, settings, verity);
      } else {
        session.status = 'awaiting-approval';
        this.emit({ type: 'session:status', sessionId: session.id, status: 'awaiting-approval' });
        await this.persistState(plan);
        const lastParagraph = responseBuffer.trim().split('\n\n').pop() ?? '';
        this.emit({ type: 'session:gate', sessionId: session.id, gateText: lastParagraph });

        const decision = await this.waitForDecision(session.id);

        switch (decision.action) {
          case 'approve':
            session.status = 'running';
            this.emit({ type: 'session:status', sessionId: session.id, status: 'running' });
            await this.sendFollowUp(session, 'Approved. Continue with the next task.');
            return this.runConversationLoop(session, plan, systemPrompt, model, settings, verity);

          case 'approve-all':
            this.autoApproveSessionIds.add(session.id);
            session.status = 'running';
            this.emit({ type: 'session:status', sessionId: session.id, status: 'running' });
            await this.sendFollowUp(session, 'Approved. Continue with the next task. Approve all remaining tasks in this session without stopping.');
            return this.runConversationLoop(session, plan, systemPrompt, model, settings, verity);

          case 'reject':
            session.status = 'running';
            this.emit({ type: 'session:status', sessionId: session.id, status: 'running' });
            await this.sendFollowUp(session, decision.message ?? 'Please redo this task.');
            return this.runConversationLoop(session, plan, systemPrompt, model, settings, verity);

          case 'skip':
            session.status = 'running';
            this.emit({ type: 'session:status', sessionId: session.id, status: 'running' });
            await this.sendFollowUp(session, 'Skip this task — do not revise it. Move to the next task in the list.');
            return this.runConversationLoop(session, plan, systemPrompt, model, settings, verity);

          case 'retry':
            session.status = 'rejected';
            session.response = '';
            session.conversationId = null;
            this.emit({ type: 'session:status', sessionId: session.id, status: 'rejected' });
            await this.persistState(plan);
            return;
        }
      }
    }

    // No approval gate — session is complete
    this.autoApproveSessionIds.delete(session.id);
    await this.approveSession(plan.id, session.id);
  }

  private async sendFollowUp(
    session: RevisionSession,
    message: string,
  ): Promise<void> {
    this.db.saveMessage({
      conversationId: session.conversationId!,
      role: 'user',
      content: message,
      thinking: '',
    });
  }

  private isApprovalGate(response: string): boolean {
    const lastParagraph = response.trim().split('\n\n').pop()?.toLowerCase() ?? '';
    const signals = [
      'approval', 'approve', 'proceed', 'continue',
      'go ahead', 'go-ahead', 'next task', 'shall i',
      'ready for', 'waiting for', 'let me know',
      'before moving', 'before proceeding', 'your go',
    ];
    return signals.some((s) => lastParagraph.includes(s));
  }

  private waitForDecision(sessionId: string): Promise<{ action: ApprovalAction; message?: string }> {
    return new Promise((resolve) => {
      this.gateResolvers.set(sessionId, resolve);
    });
  }

  respondToGate(planId: string, sessionId: string, action: ApprovalAction, message?: string): void {
    const resolver = this.gateResolvers.get(sessionId);
    if (resolver) {
      resolver({ action, message });
      this.gateResolvers.delete(sessionId);
    }
  }

  async runAll(planId: string, selectedSessionIds?: string[]): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');

    this.paused = false;

    let pendingSessions = plan.sessions
      .filter((s) => s.status === 'pending')
      .sort((a, b) => a.index - b.index);

    // In selective mode, only run sessions the user selected
    if (selectedSessionIds && selectedSessionIds.length > 0) {
      const selectedSet = new Set(selectedSessionIds);
      pendingSessions = pendingSessions.filter((s) => selectedSet.has(s.id));
    }

    for (const session of pendingSessions) {
      if (this.paused) {
        this.emit({ type: 'queue:done' });
        return;
      }
      await this.runSession(planId, session.id);
    }

    this.emit({ type: 'queue:done' });
  }

  async approveSession(planId: string, sessionId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');

    const session = plan.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Session not found');

    session.status = 'approved';
    this.emit({ type: 'session:status', sessionId, status: 'approved' });

    // Update project-tasks.md checkboxes
    try {
      let taskContent = await this.fs.readFile(plan.bookSlug, 'source/project-tasks.md');

      for (const taskNum of session.taskNumbers) {
        const pattern = `- [ ] **${taskNum}.`;
        const replacement = `- [x] **${taskNum}.`;
        taskContent = taskContent.replace(pattern, replacement);
      }

      await this.fs.writeFile(plan.bookSlug, 'source/project-tasks.md', taskContent);
    } catch (err) {
      // project-tasks.md update is best-effort — don't fail the approval
      console.error('Failed to update project-tasks.md:', err);
    }

    // Update plan state
    plan.completedTaskNumbers = [
      ...plan.completedTaskNumbers,
      ...session.taskNumbers.filter((n) => !plan.completedTaskNumbers.includes(n)),
    ];

    // Update phase counts (per-phase calculation)
    for (const phase of plan.phases) {
      if (phase.taskNumbers) {
        phase.completedCount = phase.taskNumbers.filter(
          tn => plan.completedTaskNumbers.includes(tn)
        ).length;
      }
    }

    this.emit({
      type: 'session:done',
      sessionId,
      taskNumbers: session.taskNumbers,
    });

    this.emit({
      type: 'plan:progress',
      completedTasks: plan.completedTaskNumbers.length,
      totalTasks: plan.totalTasks,
    });

    // Persist session state to disk
    await this.persistState(plan);
  }

  async rejectSession(planId: string, sessionId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');

    const session = plan.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Session not found');

    session.status = 'rejected';
    session.response = '';
    session.conversationId = null;
    this.emit({ type: 'session:status', sessionId, status: 'rejected' });

    await this.persistState(plan);
  }

  async skipSession(planId: string, sessionId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');

    const session = plan.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Session not found');

    session.status = 'skipped';
    this.emit({ type: 'session:status', sessionId, status: 'skipped' });

    await this.persistState(plan);
  }

  pause(planId: string): void {
    this.paused = true;
  }

  setMode(planId: string, mode: QueueMode): void {
    const plan = this.plans.get(planId);
    if (plan) {
      plan.mode = mode;
      this.persistState(plan); // fire-and-forget
    }
  }

  getPlan(planId: string): RevisionPlan | null {
    return this.plans.get(planId) ?? null;
  }

  // ── State persistence ────────────────────────────────────────────

  /** Persist current session statuses to disk so they survive restarts. */
  private async persistState(plan: RevisionPlan): Promise<void> {
    const contentHash = this.hashByBook.get(plan.bookSlug);
    if (!contentHash) return; // No hash means plan was never loaded — nothing to persist
    await this.writeState(plan.bookSlug, plan, contentHash);
  }
}
