import { nanoid } from 'nanoid';
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

export class RevisionQueueService implements IRevisionQueueService {
  private plans: Map<string, RevisionPlan> = new Map();
  private listeners: Set<(event: RevisionQueueEvent) => void> = new Set();
  private paused: boolean = false;
  private gateResolvers: Map<string, (decision: { action: ApprovalAction; message?: string }) => void> = new Map();

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

  async loadPlan(bookSlug: string): Promise<RevisionPlan> {
    let revisionPromptsContent: string | null = null;
    let projectTasksContent: string | null = null;

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

    if (!revisionPromptsContent && !projectTasksContent) {
      throw new Error('No revision plan found. Run Forge first to generate project tasks and revision prompts.');
    }

    const userMessage = `## revision-prompts.md\n\n${revisionPromptsContent ?? '(File does not exist)'}\n\n## project-tasks.md\n\n${projectTasksContent ?? '(File does not exist)'}`;

    const rawResponse = await this.claude.sendOneShot({
      model: WRANGLER_MODEL,
      systemPrompt: WRANGLER_SESSION_PARSE_PROMPT,
      userMessage,
      maxTokens: 8192,
    });

    // Extract JSON from response — handle potential markdown fencing
    let parsed: {
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
      phases: { number: number; name: string; taskCount: number; completedCount: number }[];
    };

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

    const plan: RevisionPlan = {
      id: nanoid(),
      bookSlug,
      sessions,
      totalTasks: parsed.totalTasks,
      completedTaskNumbers: parsed.completedTaskNumbers,
      phases: parsed.phases,
      mode: 'manual',
      createdAt: new Date().toISOString(),
    };

    this.plans.set(plan.id, plan);
    return plan;
  }

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

    try {
      await this.claude.sendMessage({
        model,
        systemPrompt,
        messages: conversationMessages,
        maxTokens: settings.maxTokens,
        thinkingBudget: settings.enableThinking ? verity.thinkingBudget : undefined,
        onEvent: (event: StreamEvent) => {
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
      return;
    }

    // Check for approval gate
    if (this.isApprovalGate(responseBuffer)) {
      if (plan.mode === 'auto-approve') {
        await this.sendFollowUp(session, 'Approved. Continue with the next task.');
        return this.runConversationLoop(session, plan, systemPrompt, model, settings, verity);
      } else if (plan.mode === 'auto-skip') {
        await this.sendFollowUp(session, 'Skip this task and move to the next one without waiting for approval.');
        return this.runConversationLoop(session, plan, systemPrompt, model, settings, verity);
      } else {
        // Manual or selective: wait for author decision
        session.status = 'awaiting-approval';
        this.emit({ type: 'session:status', sessionId: session.id, status: 'awaiting-approval' });
        const lastParagraph = responseBuffer.trim().split('\n\n').pop() ?? '';
        this.emit({ type: 'session:gate', sessionId: session.id, gateText: lastParagraph });

        const decision = await this.waitForDecision(session.id);

        switch (decision.action) {
          case 'approve':
            session.status = 'running';
            this.emit({ type: 'session:status', sessionId: session.id, status: 'running' });
            await this.sendFollowUp(session, 'Approved. Continue with the next task.');
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
            return;
        }
      }
    }

    // No approval gate — session is complete
    session.status = 'awaiting-approval';
    this.emit({ type: 'session:status', sessionId: session.id, status: 'awaiting-approval' });

    // In auto modes, auto-approve the session
    if (plan.mode === 'auto-approve' || plan.mode === 'auto-skip') {
      await this.approveSession(plan.id, session.id);
    }
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

    // Update phase counts
    for (const phase of plan.phases) {
      phase.completedCount = plan.completedTaskNumbers.length; // simplified — could be per-phase
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
  }

  async skipSession(planId: string, sessionId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error('Plan not found');

    const session = plan.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Session not found');

    session.status = 'skipped';
    this.emit({ type: 'session:status', sessionId, status: 'skipped' });
  }

  pause(planId: string): void {
    this.paused = true;
  }

  setMode(planId: string, mode: QueueMode): void {
    const plan = this.plans.get(planId);
    if (plan) {
      plan.mode = mode;
    }
  }

  getPlan(planId: string): RevisionPlan | null {
    return this.plans.get(planId) ?? null;
  }
}
