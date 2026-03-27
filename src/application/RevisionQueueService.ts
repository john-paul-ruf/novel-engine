import { nanoid } from 'nanoid';
import { createHash } from 'crypto';
import type {
  RevisionPlan,
  RevisionSession,
  RevisionSessionStatus,
  RevisionQueueEvent,
  QueueMode,
  QueueStatus,
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
  WRANGLER_MODEL,
  AGENT_REGISTRY,
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
  /** Which revision cycle this state belongs to — `1` for the first revision
   *  cycle, `2` for mechanical fixes. Used to detect cycle transitions and
   *  auto-clear stale state from the previous cycle. Files created before this
   *  field was added default to `1` on read. */
  revisionCycle: 1 | 2;
  sessions: Record<number, {
    status: RevisionSessionStatus;
    conversationId: string | null;
  }>;
  /** Embedded parsed data — redundant backup of the cache file so the
   *  Wrangler is never re-called just because a dotfile got lost during
   *  a directory copy or reinstall. */
  parsed?: ParsedWranglerOutput;
};

// Non-dotfile names so they survive Finder copy, drag-drop, etc.
// Legacy dotfile paths are checked on read for migration.
const CACHE_PATH = 'source/revision-plan-cache.json';
const STATE_PATH = 'source/revision-queue-state.json';
const LEGACY_CACHE_PATH = 'source/.revision-plan-cache.json';
const LEGACY_STATE_PATH = 'source/.revision-queue-state.json';

export class RevisionQueueService implements IRevisionQueueService {
  private plans: Map<string, RevisionPlan> = new Map();
  /** Quick lookup: bookSlug → planId for the most recent plan per book. */
  private plansByBook: Map<string, string> = new Map();
  /** Cached content hash per book — avoids re-reading files on every persistState call. */
  private hashByBook: Map<string, string> = new Map();
  /** In-memory copy of the parsed Wrangler output per book — ensures writeState
   *  can always embed parsed data even if the cache file is missing on disk. */
  private parsedByBook: Map<string, ParsedWranglerOutput> = new Map();
  /** Tracks the current revision cycle per book — `1` for first revision,
   *  `2` for mechanical fixes. Set in `loadPlan()`, used by `writeState()`. */
  private cycleByBook: Map<string, 1 | 2> = new Map();
  private listeners: Set<(event: RevisionQueueEvent) => void> = new Set();
  /** Per-plan paused flags — keyed by planId. */
  private pausedPlans: Set<string> = new Set();
  /** Plans currently being executed by runAll — prevents concurrent runs. */
  private runningPlans: Set<string> = new Set();
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

  /**
   * Compute a structural hash of the plan content.
   * Normalizes checkbox state, whitespace, and line endings before hashing
   * so that approving sessions (which ticks checkboxes in project-tasks.md)
   * does NOT invalidate the cache. Checkbox progress is tracked
   * separately via the session state file.
   */
  private computeHash(content: string): string {
    const normalized = content
      .replace(/\r\n/g, '\n')           // normalize line endings
      .replace(/- \[[xX]\]/g, '- [ ]')  // normalize checkboxes (case-insensitive)
      .replace(/[ \t]+$/gm, '')          // strip trailing whitespace per line
      .replace(/\n{3,}/g, '\n\n')        // collapse excessive blank lines
      .replace(/\n+$/, '\n');            // normalize trailing newline
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }

  private async readCache(bookSlug: string): Promise<PlanCache | null> {
    // Try current path first, then legacy dotfile path
    for (const p of [CACHE_PATH, LEGACY_CACHE_PATH]) {
      try {
        const raw = await this.fs.readFile(bookSlug, p);
        const cache = JSON.parse(raw) as PlanCache;
        // Migrate legacy file to new path
        if (p === LEGACY_CACHE_PATH) {
          await this.writeCache(bookSlug, cache);
          try { await this.fs.deleteFile(bookSlug, LEGACY_CACHE_PATH); } catch { /* best-effort cleanup */ }
        }
        return cache;
      } catch {
        // ENOENT or malformed JSON — try next path
        continue;
      }
    }
    return null;
  }

  private async writeCache(bookSlug: string, cache: PlanCache): Promise<void> {
    try {
      const json = JSON.stringify(cache, null, 2);
      console.log(`[RevisionQueue] writeCache: writing ${json.length} bytes to ${CACHE_PATH} for "${bookSlug}"`);
      await this.fs.writeFile(bookSlug, CACHE_PATH, json);
      console.log(`[RevisionQueue] writeCache: success`);
    } catch (err) {
      console.error(`[RevisionQueue] writeCache FAILED for "${bookSlug}":`, err);
    }
  }

  private async readState(bookSlug: string): Promise<SessionStateFile | null> {
    // Try current path first, then legacy dotfile path
    for (const p of [STATE_PATH, LEGACY_STATE_PATH]) {
      try {
        const raw = await this.fs.readFile(bookSlug, p);
        const state = JSON.parse(raw) as SessionStateFile;
        // Migrate legacy file to new path
        if (p === LEGACY_STATE_PATH) {
          try {
            await this.fs.writeFile(bookSlug, STATE_PATH, JSON.stringify(state, null, 2));
            await this.fs.deleteFile(bookSlug, LEGACY_STATE_PATH);
          } catch { /* best-effort */ }
        }
        return state;
      } catch {
        // ENOENT or malformed JSON — try next path
        continue;
      }
    }
    return null;
  }

  /**
   * Re-read source files, re-compute the content hash, and update both
   * the on-disk cache and the in-memory hash map. Called after any operation
   * that modifies project-tasks.md or revision-prompts.md so the cache
   * stays in sync and the next loadPlan doesn't re-send to the Wrangler.
   */
  private async refreshCacheHash(bookSlug: string): Promise<void> {
    try {
      let revisionPromptsContent: string | null = null;
      let projectTasksContent: string | null = null;
      try { revisionPromptsContent = await this.fs.readFile(bookSlug, 'source/revision-prompts.md'); } catch { /* may not exist */ }
      try { projectTasksContent = await this.fs.readFile(bookSlug, 'source/project-tasks.md'); } catch { /* may not exist */ }

      const combinedContent = (revisionPromptsContent ?? '') + '\0' + (projectTasksContent ?? '');
      const newHash = this.computeHash(combinedContent);

      // Update in-memory hash
      this.hashByBook.set(bookSlug, newHash);

      // Update on-disk cache
      const cache = await this.readCache(bookSlug);
      if (cache) {
        cache.contentHash = newHash;
        await this.writeCache(bookSlug, cache);
      }
    } catch {
      // Best-effort — don't break the approval flow
    }
  }

  private async writeState(bookSlug: string, plan: RevisionPlan, contentHash: string): Promise<void> {
    // Use the in-memory parsed data directly — never depend on the cache file
    // existing on disk, since writeCache is best-effort and can silently fail.
    const parsed = this.parsedByBook.get(bookSlug);
    const revisionCycle = this.cycleByBook.get(bookSlug) ?? 1;

    const state: SessionStateFile = {
      planHash: contentHash,
      mode: plan.mode,
      revisionCycle,
      sessions: {},
      parsed,
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
        'Sable has completed copy editing, but the first revision cycle files have not been archived yet. ' +
        'The archiving of revision files (project-tasks, revision-prompts) is an agent action ' +
        'that should be handled as part of the revision workflow.',
      );
    }

    // Determine which revision cycle we're loading and auto-clear stale state
    // from a previous cycle. A cycle transition is detected when the on-disk
    // state file records a different cycle than the one we're about to load.
    const isSecondCycle = auditExists && archivedTasksExist;
    const currentCycle: 1 | 2 = isSecondCycle ? 2 : 1;
    this.cycleByBook.set(bookSlug, currentCycle);

    const savedStateForCycleCheck = await this.readState(bookSlug);
    if (savedStateForCycleCheck && (savedStateForCycleCheck.revisionCycle ?? 1) !== currentCycle) {
      console.log(
        `[RevisionQueue] Cycle transition detected: state is cycle ${savedStateForCycleCheck.revisionCycle ?? 1}, ` +
        `now loading cycle ${currentCycle}. Clearing stale cache and state.`,
      );
      await this.clearCache(bookSlug);
      // Re-set the cycle since clearCache deletes it
      this.cycleByBook.set(bookSlug, currentCycle);
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

    // 3. Check disk cache — if hash matches, skip the CLI call entirely.
    //    Fallback chain: cache file → state file (embedded parsed) → Wrangler CLI.
    //    A cache with 0 sessions is treated as invalid (Wrangler returned garbage).
    let parsed: ParsedWranglerOutput;
    const rawCache = await this.readCache(bookSlug);
    const cache = rawCache?.parsed?.sessions?.length ? rawCache : null;
    const savedState = await this.readState(bookSlug);

    if (cache && cache.contentHash === contentHash) {
      this.emit({ type: 'plan:loading-step', step: 'Loaded from cache (files unchanged)' });
      parsed = cache.parsed;
    } else if (savedState?.parsed?.sessions?.length && savedState.planHash === contentHash) {
      // No valid cache but the state file has embedded parsed data AND its
      // planHash matches the current content. This happens after a reinstall
      // or directory copy where the cache file was lost but the plan hasn't
      // actually changed. Only recover if the hashes match — a hash mismatch
      // means the content genuinely changed and needs a fresh Wrangler parse.
      console.log('[RevisionQueue] Cache file missing — recovering parsed data from state file (hash match).');
      parsed = savedState.parsed;
      // Re-create the cache file for next time
      await this.writeCache(bookSlug, { contentHash, parsed, cachedAt: new Date().toISOString() });
    } else {
      if (cache) {
        console.log(
          `[RevisionQueue] Cache hash mismatch — cached: ${cache.contentHash}, computed: ${contentHash}. Content changed, re-parsing with Wrangler.`,
        );
      } else {
        console.log('[RevisionQueue] No valid cache or matching state file found. Parsing with Wrangler.');
      }

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
      const wranglerSettings = await this.settings.load();
      const wranglerThinkingBudget = wranglerSettings.enableThinking ? 4000 : undefined;
      await this.claude.sendMessage({
        model: WRANGLER_MODEL,
        systemPrompt: await this.agents.loadRaw('WRANGLER-PARSE.md'),
        messages: [{ role: 'user' as const, content: userMessage }],
        maxTokens: 8192,
        thinkingBudget: wranglerThinkingBudget,
        maxTurns: 3,
        onEvent: (event) => {
          // Forward ALL stream events to the activity viewer so users can
          // see thinking, tool use, and progress while the Wrangler works
          this.emit({ type: 'session:streamEvent', sessionId: '__plan-load__', event });

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

      // The real 'done' event is already forwarded by the onEvent handler above,
      // so no synthetic done emission is needed here.

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

      // Validate: don't cache garbage — the Wrangler must produce at least one session
      if (!parsed.sessions?.length) {
        throw new Error(
          `Wrangler returned 0 sessions. This likely means the revision-prompts.md format was not recognized. ` +
          `Response keys: ${Object.keys(parsed).join(', ')}`,
        );
      }

      // Write cache for next time
      await this.writeCache(bookSlug, {
        contentHash,
        parsed,
        cachedAt: new Date().toISOString(),
      });
    }

    // 4. Store parsed in memory so writeState can always embed it
    this.parsedByBook.set(bookSlug, parsed);

    // 5. Build plan from parsed data
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

    // 5. Merge saved session state (only if the plan content hasn't changed).
    //    A hash mismatch means the plan content genuinely changed (e.g., cycle
    //    transition, manual edits) and old statuses are meaningless. The hash
    //    normalization in computeHash() strips checkbox state and whitespace,
    //    so the only remaining hash changes represent genuine content differences.
    if (savedState?.sessions && savedState.planHash === contentHash) {
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
    } else if (savedState?.sessions) {
      console.log(
        `[RevisionQueue] Skipping state merge: plan hash mismatch ` +
        `(state: ${savedState.planHash}, current: ${contentHash}). ` +
        `This is expected after a cycle transition or content change.`,
      );
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
      mode: savedState?.mode ?? 'manual',
      createdAt: new Date().toISOString(),
      verificationConversationId: null,
    };

    this.plans.set(plan.id, plan);
    this.plansByBook.set(bookSlug, plan.id);
    this.hashByBook.set(bookSlug, contentHash);
    return plan;
  }

  async clearCache(bookSlug: string): Promise<void> {
    // Delete both the plan cache AND the session state file to force a
    // completely fresh Wrangler parse on next load. The state file contains
    // an embedded copy of the parsed data, so leaving it would let loadPlan
    // recover the old (stale) sessions even after the cache is gone.
    for (const path of [CACHE_PATH, STATE_PATH]) {
      try {
        await this.fs.deleteFile(bookSlug, path);
      } catch {
        // File may not exist — that's fine
      }
    }
    this.emit({ type: 'plan:loading-step', step: 'Cache cleared' });
    // Clear in-memory caches
    const planId = this.plansByBook.get(bookSlug);
    if (planId) {
      this.plans.delete(planId);
      this.plansByBook.delete(bookSlug);
    }
    this.hashByBook.delete(bookSlug);
    this.parsedByBook.delete(bookSlug);
    this.cycleByBook.delete(bookSlug);
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

    // Emit running status AFTER conversation creation so the frontend gets the conversationId
    this.emit({ type: 'session:status', sessionId: session.id, status: 'running', conversationId: conversation.id });
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
      conversationId: session.conversationId ?? undefined,
    });

    try {
      await this.claude.sendMessage({
        model,
        systemPrompt,
        messages: conversationMessages,
        maxTokens: settings.maxTokens,
        thinkingBudget: settings.enableThinking
          ? (settings.overrideThinkingBudget ? settings.thinkingBudget : verity.thinkingBudget)
          : undefined,
        maxTurns: AGENT_REGISTRY.Verity.maxTurns,
        onEvent: (event: StreamEvent) => {
          this.emit({ type: 'session:streamEvent', sessionId: session.id, event, conversationId: session.conversationId ?? undefined });

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

    // Prevent concurrent runAll calls on the same plan
    if (this.runningPlans.has(planId)) {
      throw new Error('This revision queue is already running. Wait for it to finish or pause it first.');
    }

    this.runningPlans.add(planId);
    this.pausedPlans.delete(planId);

    try {
      let pendingSessions = plan.sessions
        .filter((s) => s.status === 'pending')
        .sort((a, b) => a.index - b.index);

      // In selective mode, only run sessions the user selected
      if (selectedSessionIds && selectedSessionIds.length > 0) {
        const selectedSet = new Set(selectedSessionIds);
        pendingSessions = pendingSessions.filter((s) => selectedSet.has(s.id));
      }

      for (const session of pendingSessions) {
        if (this.pausedPlans.has(planId)) {
          this.emit({ type: 'queue:done', planId });
          return;
        }
        await this.runSession(planId, session.id);
      }

      this.emit({ type: 'queue:done', planId });
    } finally {
      this.runningPlans.delete(planId);
    }
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

      // Keep cache hash in sync so the next loadPlan uses the cache
      await this.refreshCacheHash(plan.bookSlug);
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
      planId: plan.id,
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
    this.pausedPlans.add(planId);
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

  getQueueStatus(bookSlug: string): QueueStatus {
    const planId = this.plansByBook.get(bookSlug) ?? null;
    if (!planId) return { planId: null, isRunning: false, activeSessionId: null };

    const plan = this.plans.get(planId);
    const isRunning = this.runningPlans.has(planId);
    const activeSessionId = plan?.sessions.find(s => s.status === 'running')?.id ?? null;

    return { planId, isRunning, activeSessionId };
  }

  async startVerification(planId: string): Promise<string> {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');

    if (plan.verificationConversationId) {
      return plan.verificationConversationId;
    }

    const conversation = this.db.createConversation({
      id: nanoid(),
      bookSlug: plan.bookSlug,
      agentName: 'Verity' as AgentName,
      pipelinePhase: null,
      purpose: 'pipeline',
      title: 'Revision Verification',
    });

    plan.verificationConversationId = conversation.id;

    this.db.saveMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'All revision sessions are complete. Please review the project tasks and the manuscript, then give me a final check-in on how things look.',
      thinking: '',
    });

    return conversation.id;
  }

  // ── State persistence ────────────────────────────────────────────

  /** Persist current session statuses to disk so they survive restarts. */
  private async persistState(plan: RevisionPlan): Promise<void> {
    const contentHash = this.hashByBook.get(plan.bookSlug);
    if (!contentHash) return; // No hash means plan was never loaded — nothing to persist
    await this.writeState(plan.bookSlug, plan, contentHash);
  }
}
