import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
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

    if (!supportsAddDir && cwd !== this.booksDir) {
      // Older Codex CLIs (e.g. 0.27.0) lack --add-dir but honor config overrides.
      // sandbox_workspace_write.writable_roots adds extra writable roots to the
      // workspace-write sandbox (verified against codex debug seatbelt, 0.27.0).
      extraArgs.push('-c', `sandbox_workspace_write.writable_roots=[${JSON.stringify(this.booksDir)}]`);
      return { cwd, argsCwd: cwd, extraArgs, mode: 'book-with-books-root-config' };
    }

    return { cwd, argsCwd: cwd, extraArgs, mode: params.workingDir ? 'custom-working-dir' : 'books-root' };
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

    const startedAt = Date.now();
    let parsedJsonEventCount = 0;
    let parsedJsonEventTail: string[] = [];
    let nonJsonStdoutTail = '';
    let lastStatusMessage = '';
    let terminalErrorMessage = '';
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

    const outputDir = mkdtempSync(path.join(os.tmpdir(), 'novel-engine-codex-'));
    const outputLastMessagePath = path.join(outputDir, 'last-message.txt');

    const readFallbackOutput = (): string => {
      try {
        if (!existsSync(outputLastMessagePath)) return '';
        return readFileSync(outputLastMessagePath, 'utf-8').trim();
      } catch {
        return '';
      }
    };

    const cleanupOutputFile = () => {
      try {
        rmSync(outputDir, { recursive: true, force: true });
      } catch {
        // Best-effort temp cleanup.
      }
    };

    const args = [
      'exec',
      '--json',
      '--model', model,
      '--sandbox', 'workspace-write',
      '--skip-git-repo-check',
      '--cd', workspacePlan.argsCwd,
      ...workspacePlan.extraArgs,
      '--output-last-message', outputLastMessagePath,
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
        cleanupOutputFile();
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

      const applyLineResult = (result: CodexLineResult) => {
        if (result.parsedJson) parsedJsonEventCount += 1;
        if (result.eventSummary) {
          parsedJsonEventTail = [...parsedJsonEventTail, result.eventSummary].slice(-12);
        }
        if (result.nonJsonText) nonJsonStdoutTail = this.appendTail(nonJsonStdoutTail, `${result.nonJsonText}\n`);
        if (result.statusMessage) lastStatusMessage = result.statusMessage;
        if (result.errorMessage) terminalErrorMessage = result.errorMessage;
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() ?? '';

        for (const line of lines) {
          applyLineResult(this.processOutputLine(line, emitText, wrappedOnEvent, tracker, closeTextBlock, workspacePlan.cwd));
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer = this.appendTail(stderrBuffer, chunk.toString());
      });

      child.on('close', (code, signal) => {
        if (stdoutBuffer.trim()) {
          applyLineResult(this.processOutputLine(stdoutBuffer, emitText, wrappedOnEvent, tracker, closeTextBlock, workspacePlan.cwd));
        }
        closeTextBlock();
        const fallbackText = readFallbackOutput();
        if (fallbackText && outputTextLength === 0) {
          emitText(fallbackText);
          closeTextBlock();
        }

        const elapsedMs = Date.now() - startedAt;
        const stderr = stderrBuffer.trim();
        const stdoutTail = nonJsonStdoutTail.trim();

        if (code === 0) {
          if (terminalErrorMessage) {
            const message = this.buildCodexExitMessage({
              summary: `Codex CLI reported an error: ${terminalErrorMessage}`,
              code,
              signal,
              elapsedMs,
              workspaceMode: workspacePlan.mode,
              parsedJsonEventCount,
              parsedJsonEventTail,
              lastStatusMessage,
              stderr,
              stdoutTail,
            });
            cleanup();
            settle(() => reject(new Error(message)));
            return;
          }

          if (!doneEmitted && outputTextLength === 0) {
            const message = this.buildCodexExitMessage({
              summary: 'Codex CLI exited without assistant output or usage.',
              code,
              signal,
              elapsedMs,
              workspaceMode: workspacePlan.mode,
              parsedJsonEventCount,
              parsedJsonEventTail,
              lastStatusMessage,
              stderr,
              stdoutTail,
            });
            wrappedOnEvent({ type: 'error', message });
            cleanup();
            settle(() => reject(new Error(message)));
            return;
          }

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
          const touchedPaths = Object.keys(tracker.getFileTouches());
          if (touchedPaths.length > 0) {
            wrappedOnEvent({ type: 'filesChanged', paths: touchedPaths });
          }
          cleanup();
          settle(() => resolve());
        } else {
          const message = this.buildCodexExitMessage({
            summary: terminalErrorMessage
              ? `Codex CLI reported an error before exit: ${terminalErrorMessage}`
              : 'Codex CLI exited unsuccessfully.',
            code,
            signal,
            elapsedMs,
            workspaceMode: workspacePlan.mode,
            parsedJsonEventCount,
            parsedJsonEventTail,
            lastStatusMessage,
            stderr,
            stdoutTail,
          });
          if (!terminalErrorMessage) {
            wrappedOnEvent({ type: 'error', message });
          }
          cleanup();
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
    workspaceCwd: string,
  ): CodexLineResult {
    const emptyResult: CodexLineResult = {
      parsedJson: false,
      emittedText: false,
      emittedUsageDone: false,
    };

    const trimmed = line.trim();
    if (!trimmed) return emptyResult;

    const parsed = this.parseJsonObject(trimmed);
    if (!parsed) {
      return { ...emptyResult, nonJsonText: line };
    }

    const eventSummary = this.summarizeCodexEvent(parsed);
    const errorMessage = this.extractError(parsed);
    if (errorMessage) {
      closeTextBlock();
      onEvent({ type: 'error', message: errorMessage });
      return {
        parsedJson: true,
        eventSummary,
        errorMessage,
        emittedText: false,
        emittedUsageDone: false,
      };
    }

    const tool = this.extractToolInfo(parsed, workspaceCwd);
    if (tool) {
      const stageChange = tracker.inferStage('toolUse', tool.toolName, tool.filePath);
      if (stageChange) {
        onEvent({ type: 'progressStage', stage: stageChange });
      }

      if (tool.filePath && this.isFileWriteTool(tool.toolName)) {
        tracker.touchFile(tool.filePath);
      }

      const now = Date.now();
      const toolInfo = {
        toolName: tool.toolName,
        toolId: tool.toolId,
        filePath: tool.filePath,
        status: 'complete' as const,
      };
      onEvent({ type: 'toolUse', tool: toolInfo });
      onEvent({
        type: 'toolDuration',
        tool: {
          ...toolInfo,
          startedAt: now,
          endedAt: now,
          durationMs: 0,
        },
      });
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
      return {
        parsedJson: true,
        eventSummary,
        emittedText: Boolean(text),
        emittedUsageDone: true,
      };
    }

    const statusMessage = this.extractStatus(parsed);
    if (statusMessage) {
      onEvent({ type: 'status', message: statusMessage });
    }

    return {
      parsedJson: true,
      eventSummary,
      statusMessage: statusMessage || undefined,
      emittedText: Boolean(text),
      emittedUsageDone: false,
    };
  }

  private appendTail(current: string, chunk: string, maxChars = 4000): string {
    const next = current + chunk;
    return next.length > maxChars ? next.slice(next.length - maxChars) : next;
  }

  private summarizeCodexEvent(event: Record<string, unknown>): string {
    const type = this.getString(event, 'type') ?? 'unknown';
    const item = event.item;
    if (this.isRecord(item)) {
      const itemType = this.getString(item, 'type');
      const toolName = this.getString(item, 'name') ?? this.getString(item, 'tool_name');
      return [type, itemType, toolName].filter(Boolean).join(':');
    }
    return type;
  }

  private extractToolInfo(event: Record<string, unknown>, workspaceCwd: string): { toolName: string; filePath?: string; toolId: string } | null {
    const item = event.item;
    if (!this.isRecord(item)) return null;
    if (!this.isCompletedCodexItem(event, item)) return null;

    const itemType = this.getString(item, 'type') ?? '';
    if (itemType === 'file_change') {
      const filePath = this.extractFileChangePath(item, workspaceCwd);
      if (!filePath) return null;
      const toolName = this.getFileChangeToolName(item);
      const toolId = this.getString(item, 'id') ?? `${toolName}:${filePath}`;
      return { toolName, filePath, toolId };
    }

    const rawToolName = this.getString(item, 'name')
      ?? this.getString(item, 'tool_name')
      ?? this.getString(item, 'toolName')
      ?? itemType;
    const toolName = this.normalizeToolName(rawToolName);

    const lower = `${itemType} ${toolName}`.toLowerCase();
    const isToolLike = lower.includes('tool')
      || ['read', 'write', 'edit', 'ls'].some((name) => lower.includes(name));
    if (!isToolLike) return null;

    const input = item.input;
    const filePath = this.extractToolFilePath(this.isRecord(input) ? input : item, toolName, workspaceCwd);
    const toolId = this.getString(item, 'id') ?? `${toolName}:${filePath ?? 'unknown'}`;
    return { toolName, filePath, toolId };
  }

  private isCompletedCodexItem(event: Record<string, unknown>, item: Record<string, unknown>): boolean {
    const eventType = this.getString(event, 'type') ?? '';
    const status = this.getString(item, 'status') ?? '';
    return eventType.includes('completed') || status.includes('complete');
  }

  private extractToolFilePath(record: Record<string, unknown>, toolName: string | undefined, workspaceCwd: string): string | undefined {
    const directPath = this.getString(record, 'file_path')
      ?? this.getString(record, 'filePath')
      ?? this.getString(record, 'path');
    if (directPath) return this.normalizeWorkspacePath(directPath, workspaceCwd);

    const cmd = this.getString(record, 'cmd');
    if (!cmd || !toolName || !['Read', 'Write', 'Edit'].includes(toolName)) return undefined;
    return /\s/.test(cmd) ? undefined : this.normalizeWorkspacePath(cmd, workspaceCwd);
  }

  private extractFileChangePath(item: Record<string, unknown>, workspaceCwd: string): string | undefined {
    const changes = item.changes;
    if (!Array.isArray(changes)) return undefined;
    for (const change of changes) {
      if (!this.isRecord(change)) continue;
      const changePath = this.getString(change, 'path');
      if (changePath) return this.normalizeWorkspacePath(changePath, workspaceCwd);
    }
    return undefined;
  }

  private getFileChangeToolName(item: Record<string, unknown>): string {
    const changes = item.changes;
    if (Array.isArray(changes)) {
      for (const change of changes) {
        if (!this.isRecord(change)) continue;
        const kind = (this.getString(change, 'kind') ?? '').toLowerCase();
        if (kind === 'add' || kind === 'create') return 'Write';
      }
    }
    return 'Edit';
  }

  private normalizeWorkspacePath(filePath: string, workspaceCwd: string): string {
    if (!path.isAbsolute(filePath)) return filePath;
    const relativePath = path.relative(workspaceCwd, filePath);
    return relativePath && !relativePath.startsWith('..') ? relativePath : filePath;
  }

  private normalizeToolName(toolName: string): string {
    const lower = toolName.toLowerCase();
    if (lower === 'read' || lower.includes('read')) return 'Read';
    if (lower === 'write' || lower.includes('write')) return 'Write';
    if (lower === 'edit' || lower.includes('edit')) return 'Edit';
    if (lower === 'ls' || lower.includes('list')) return 'LS';
    return toolName;
  }

  private isFileWriteTool(toolName: string): boolean {
    return toolName === 'Write' || toolName === 'Edit';
  }

  private buildCodexExitMessage(params: {
    summary: string;
    code: number | null;
    signal: NodeJS.Signals | null;
    elapsedMs: number;
    workspaceMode: CodexWorkspacePlan['mode'];
    parsedJsonEventCount: number;
    parsedJsonEventTail: string[];
    lastStatusMessage: string;
    stderr: string;
    stdoutTail: string;
  }): string {
    const parts = [
      params.summary,
      `exitCode=${params.code ?? 'null'}`,
      `signal=${params.signal ?? 'null'}`,
      `elapsedMs=${params.elapsedMs}`,
      `workspaceMode=${params.workspaceMode}`,
      `jsonEvents=${params.parsedJsonEventCount}`,
    ];
    if (params.parsedJsonEventTail.length > 0) {
      parts.push(`eventTail=${params.parsedJsonEventTail.join(' > ')}`);
    }
    if (params.lastStatusMessage) parts.push(`lastStatus=${params.lastStatusMessage}`);
    if (params.stderr) parts.push(`stderr=${params.stderr}`);
    if (params.stdoutTail) parts.push(`stdout=${params.stdoutTail}`);
    return parts.join('\n');
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

  private extractError(event: Record<string, unknown>): string {
    const type = this.getString(event, 'type') ?? '';
    const level = this.getString(event, 'level') ?? '';
    const message = this.getString(event, 'message') ?? this.getString(event, 'msg');
    const error = event.error;

    if (typeof error === 'string') return error;
    if (this.isRecord(error)) {
      return this.getString(error, 'message') ?? this.getString(error, 'msg') ?? JSON.stringify(error);
    }
    if (type.toLowerCase().includes('error') || level.toLowerCase() === 'error') {
      return message ?? type;
    }
    const item = event.item;
    if (this.isRecord(item)) {
      const itemType = this.getString(item, 'type') ?? '';
      if (itemType.toLowerCase().includes('error')) {
        return this.getString(item, 'message') ?? this.getString(item, 'text') ?? itemType;
      }
    }
    return '';
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

type CodexLineResult = {
  parsedJson: boolean;
  eventSummary?: string;
  nonJsonText?: string;
  statusMessage?: string;
  errorMessage?: string;
  emittedText: boolean;
  emittedUsageDone: boolean;
};

type CodexWorkspacePlan = {
  cwd: string;
  argsCwd: string;
  extraArgs: string[];
  mode: 'book-with-books-root' | 'book-with-books-root-config' | 'custom-working-dir' | 'books-root';
};

type EventRecord = {
  sessionId: string;
  conversationId: string;
  sequenceNumber: number;
  eventType: string;
  payload: string;
  timestamp: string;
};
