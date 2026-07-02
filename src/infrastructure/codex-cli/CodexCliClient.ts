import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { nanoid } from 'nanoid';

import type { IDatabaseService, IModelProvider } from '@domain/interfaces';
import type { MessageRole, ProviderCapability, ProviderId, StreamEvent } from '@domain/types';
import { CHARS_PER_TOKEN, CODEX_CLI_PROVIDER_ID } from '@domain/constants';
import { StreamSessionTracker } from '../claude-cli/StreamSessionTracker';

const execFileAsync = promisify(execFile);

const CODEX_NOT_FOUND_MESSAGE =
  'Codex CLI not found. Install it and sign in before selecting the Codex provider.';

const ABORT_KILL_GRACE_MS = 2000;
const BATCH_FLUSH_INTERVAL_MS = 100;
const BATCH_MAX_SIZE = 20;
const CRITICAL_EVENT_TYPES = new Set(['done', 'error', 'callStart', 'filesChanged']);

export class CodexCliClient implements IModelProvider {
  readonly providerId: ProviderId = CODEX_CLI_PROVIDER_ID;

  readonly capabilities: ProviderCapability[] = [
    'text-completion',
    'streaming',
    'tool-use',
    'thinking',
  ];

  private _available: boolean | null = null;
  private _supportsAddDir: boolean | null = null;
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private streamBookMap: Map<string, string> = new Map();

  constructor(
    private booksDir: string,
    private db: IDatabaseService,
  ) {}

  async isAvailable(): Promise<boolean> {
    if (this._available !== null) return this._available;
    try {
      const { stdout, stderr } = await execFileAsync('codex', ['--version'], { timeout: 10_000 });
      this._available = `${stdout}${stderr}`.trim().length > 0;
      return this._available;
    } catch {
      this._available = false;
      return false;
    }
  }

  invalidateAvailabilityCache(): void {
    this._available = null;
    this._supportsAddDir = null;
  }

  private async supportsAddDir(): Promise<boolean> {
    if (this._supportsAddDir !== null) return this._supportsAddDir;
    try {
      const { stdout, stderr } = await execFileAsync('codex', ['exec', '--help'], { timeout: 10_000 });
      this._supportsAddDir = `${stdout}${stderr}`.includes('--add-dir');
      return this._supportsAddDir;
    } catch {
      this._supportsAddDir = false;
      return false;
    }
  }

  private async buildWorkspacePlan(params: {
    bookSlug?: string;
    workingDir?: string;
  }): Promise<CodexWorkspacePlan> {
    const cwd = params.workingDir
      ? params.workingDir
      : params.bookSlug
        ? path.join(this.booksDir, params.bookSlug)
        : this.booksDir;

    if (!existsSync(cwd)) {
      throw new Error(`Codex CLI working directory does not exist: ${cwd}`);
    }

    const supportsAddDir = await this.supportsAddDir();
    const extraArgs: string[] = [];

    if (supportsAddDir && cwd !== this.booksDir) {
      extraArgs.push('--add-dir', this.booksDir);
      return { cwd, argsCwd: cwd, extraArgs, mode: 'book-with-books-root' };
    }

    if (!supportsAddDir && params.bookSlug && !params.workingDir) {
      return {
        cwd,
        argsCwd: cwd,
        extraArgs,
        mode: 'book-only',
        warning: `Codex CLI does not support --add-dir; continuing with active-book workspace only (${params.bookSlug}).`,
      };
    }

    return {
      cwd,
      argsCwd: cwd,
      extraArgs,
      mode: params.workingDir ? 'custom-working-dir' : 'books-root',
      warning: !supportsAddDir && cwd !== this.booksDir
        ? `Codex CLI does not support --add-dir; workspace is limited to ${cwd}.`
        : undefined,
    };
  }

  hasActiveProcesses(): boolean {
    return this.activeProcesses.size > 0;
  }

  hasActiveProcessesForBook(bookSlug: string): boolean {
    for (const slug of this.streamBookMap.values()) {
      if (slug === bookSlug) return true;
    }
    return false;
  }

  abortStream(conversationId: string): void {
    const child = this.activeProcesses.get(conversationId);
    if (!child) return;

    this.activeProcesses.delete(conversationId);
    this.streamBookMap.delete(conversationId);
    child.kill('SIGTERM');

    const forceKillTimer = setTimeout(() => {
      try {
        if (!child.killed) child.kill('SIGKILL');
      } catch {
        // Process already exited.
      }
    }, ABORT_KILL_GRACE_MS);

    child.once('close', () => clearTimeout(forceKillTimer));
  }

  async sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    maxTurns?: number;
    bookSlug?: string;
    workingDir?: string;
    sessionId?: string;
    conversationId?: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void> {
    const { model, systemPrompt, messages, bookSlug, workingDir } = params;
    const sessionId = params.sessionId || nanoid();
    const conversationId = params.conversationId ?? '';
    const tracker = new StreamSessionTracker(sessionId);
    const prompt = this.buildPrompt(systemPrompt, messages);

    let doneEmitted = false;
    let textBlockOpen = false;
    let outputTextLength = 0;
    let persistErrorLogged = false;
    let eventBatch: EventRecord[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushBatch = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (eventBatch.length === 0) return;
      const toFlush = eventBatch;
      eventBatch = [];
      try {
        this.db.persistStreamEventBatch(toFlush);
      } catch (err) {
        if (!persistErrorLogged) {
          console.error(`[CodexCliClient] Stream event batch persistence failed (conversationId=${conversationId}):`, err);
          persistErrorLogged = true;
        }
      }
    };

    const wrappedOnEvent = (streamEvent: StreamEvent) => {
      if (streamEvent.type === 'done') doneEmitted = true;

      eventBatch.push({
        sessionId,
        conversationId,
        sequenceNumber: tracker.nextSequence(),
        eventType: streamEvent.type,
        payload: JSON.stringify(streamEvent),
        timestamp: new Date().toISOString(),
      });

      if (CRITICAL_EVENT_TYPES.has(streamEvent.type) || eventBatch.length >= BATCH_MAX_SIZE) {
        flushBatch();
      } else if (!flushTimer) {
        flushTimer = setTimeout(flushBatch, BATCH_FLUSH_INTERVAL_MS);
      }

      params.onEvent(streamEvent);
    };

    const emitText = (text: string) => {
      if (!text) return;
      outputTextLength += text.length;
      if (!textBlockOpen) {
        textBlockOpen = true;
        tracker.setCurrentBlockType('text');
        tracker.markTextEmitted();
        wrappedOnEvent({ type: 'blockStart', blockType: 'text' });
      }
      wrappedOnEvent({ type: 'textDelta', text });
    };

    const closeTextBlock = () => {
      if (!textBlockOpen) return;
      wrappedOnEvent({ type: 'blockEnd', blockType: 'text' });
      tracker.setCurrentBlockType(null);
      textBlockOpen = false;
    };

    let workspacePlan: CodexWorkspacePlan;
    try {
      workspacePlan = await this.buildWorkspacePlan({ bookSlug, workingDir });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      wrappedOnEvent({ type: 'error', message });
      throw new Error(message);
    }

    if (workspacePlan.warning) {
      console.warn(`[CodexCliClient] ${workspacePlan.warning}`);
      wrappedOnEvent({ type: 'status', message: workspacePlan.warning });
    }

    const args = [
      'exec',
      '--json',
      '--model', model,
      '--sandbox', 'workspace-write',
      '--skip-git-repo-check',
      '--cd', workspacePlan.argsCwd,
      ...workspacePlan.extraArgs,
      '-',
    ];

    console.log(
      `[CodexCliClient] Spawning CLI: model=${model}, workspaceMode=${workspacePlan.mode}, ` +
      `cwd=${workspacePlan.cwd}, conversationId=${conversationId}`,
    );

    return new Promise<void>((resolve, reject) => {
      const child = spawn('codex', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        cwd: workspacePlan.cwd,
      });

      if (conversationId) {
        this.activeProcesses.set(conversationId, child);
        if (bookSlug) this.streamBookMap.set(conversationId, bookSlug);
      }

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let settled = false;

      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      const cleanup = () => {
        flushBatch();
        if (conversationId) {
          this.activeProcesses.delete(conversationId);
          this.streamBookMap.delete(conversationId);
        }
      };

      child.on('error', (err: NodeJS.ErrnoException) => {
        cleanup();
        const message = err.code === 'ENOENT' ? CODEX_NOT_FOUND_MESSAGE : err.message;
        wrappedOnEvent({ type: 'error', message });
        settle(() => reject(new Error(message)));
      });

      child.stdin.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') return;
        const message = `Codex CLI stdin error: ${err.message}`;
        wrappedOnEvent({ type: 'error', message });
        settle(() => reject(new Error(message)));
      });

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() ?? '';

        for (const line of lines) {
          this.processOutputLine(line, emitText, wrappedOnEvent, tracker, closeTextBlock);
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
      });

      child.on('close', (code) => {
        if (stdoutBuffer.trim()) {
          this.processOutputLine(stdoutBuffer, emitText, wrappedOnEvent, tracker, closeTextBlock);
        }
        closeTextBlock();

        if (code === 0) {
          if (!doneEmitted) {
            const outputTokens = Math.ceil(outputTextLength / CHARS_PER_TOKEN);
            const inputTokens = Math.ceil(prompt.length / CHARS_PER_TOKEN);
            const stageChange = tracker.inferStage('result');
            if (stageChange) {
              wrappedOnEvent({ type: 'progressStage', stage: stageChange });
            }
            wrappedOnEvent({
              type: 'done',
              inputTokens,
              outputTokens,
              thinkingTokens: 0,
              filesTouched: tracker.getFileTouches(),
            });
          }
          cleanup();
          settle(() => resolve());
        } else {
          cleanup();
          const stderr = stderrBuffer.trim();
          const message = stderr || `Codex CLI exited with code ${code ?? 'unknown'}`;
          wrappedOnEvent({ type: 'error', message });
          settle(() => reject(new Error(message)));
        }
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  private processOutputLine(
    line: string,
    emitText: (text: string) => void,
    onEvent: (event: StreamEvent) => void,
    tracker: StreamSessionTracker,
    closeTextBlock: () => void,
  ): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    const parsed = this.parseJsonObject(trimmed);
    if (!parsed) {
      emitText(`${line}\n`);
      return;
    }

    const text = this.extractText(parsed);
    if (text) {
      emitText(text);
    }

    const usage = this.extractUsage(parsed);
    if (usage) {
      closeTextBlock();
      const stageChange = tracker.inferStage('result');
      if (stageChange) {
        onEvent({ type: 'progressStage', stage: stageChange });
      }
      onEvent({
        type: 'done',
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        thinkingTokens: usage.thinkingTokens,
        filesTouched: tracker.getFileTouches(),
      });
      return;
    }

    const message = this.extractStatus(parsed);
    if (message) {
      onEvent({ type: 'status', message });
    }
  }

  private parseJsonObject(line: string): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(line);
      return this.isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private extractText(event: Record<string, unknown>): string {
    const directText = this.getString(event, 'text') ?? this.getString(event, 'delta') ?? this.getString(event, 'message');
    if (directText && this.looksLikeAssistantText(event)) return directText;

    const item = event.item;
    if (this.isRecord(item)) {
      const itemText = this.getString(item, 'text') ?? this.getString(item, 'content');
      if (itemText && this.looksLikeAssistantText(item)) return itemText;
    }

    const content = event.content;
    if (Array.isArray(content)) {
      return content
        .map((part) => this.isRecord(part) ? (this.getString(part, 'text') ?? '') : '')
        .filter(Boolean)
        .join('');
    }

    return '';
  }


  private extractUsage(event: Record<string, unknown>): { inputTokens: number; outputTokens: number; thinkingTokens: number } | null {
    const type = this.getString(event, 'type');
    if (type !== 'turn.completed') return null;

    const usage = event.usage;
    if (!this.isRecord(usage)) return null;

    return {
      inputTokens: this.getNumber(usage, 'input_tokens') ?? 0,
      outputTokens: this.getNumber(usage, 'output_tokens') ?? 0,
      thinkingTokens: this.getNumber(usage, 'reasoning_output_tokens') ?? 0,
    };
  }

  private extractStatus(event: Record<string, unknown>): string {
    const type = this.getString(event, 'type');
    const msg = this.getString(event, 'message') ?? this.getString(event, 'msg');
    if (type && !this.looksLikeAssistantText(event)) return msg ?? type;
    return '';
  }

  private looksLikeAssistantText(event: Record<string, unknown>): boolean {
    const type = this.getString(event, 'type') ?? '';
    const role = this.getString(event, 'role') ?? '';
    return role === 'assistant'
      || type.includes('message')
      || type.includes('delta')
      || type.includes('output')
      || type.includes('agent_message');
  }

  private getString(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
  }

  private getNumber(record: Record<string, unknown>, key: string): number | undefined {
    const value = record[key];
    return typeof value === 'number' ? value : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private buildPrompt(systemPrompt: string, messages: { role: MessageRole; content: string }[]): string {
    const conversation = messages
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    return [
      'SYSTEM:',
      systemPrompt,
      '',
      'CONVERSATION:',
      conversation,
      '',
      'Respond as the assigned Novel Engine agent. Use available filesystem tools when needed.',
    ].join('\n');
  }
}

type CodexWorkspacePlan = {
  cwd: string;
  argsCwd: string;
  extraArgs: string[];
  mode: 'book-with-books-root' | 'book-only' | 'custom-working-dir' | 'books-root';
  warning?: string;
};

type EventRecord = {
  sessionId: string;
  conversationId: string;
  sequenceNumber: number;
  eventType: string;
  payload: string;
  timestamp: string;
};
