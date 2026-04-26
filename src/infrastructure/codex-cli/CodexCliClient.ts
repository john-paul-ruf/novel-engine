import { spawn, type ChildProcess } from 'node:child_process';
import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { nanoid } from 'nanoid';

import type { IDatabaseService, IModelProvider } from '@domain/interfaces';
import type { FileTouchMap, MessageRole, ProviderCapability, ProviderId, StreamEvent } from '@domain/types';
import { CHARS_PER_TOKEN, CODEX_CLI_PROVIDER_ID } from '@domain/constants';
import { StreamSessionTracker } from '@infra/claude-cli/StreamSessionTracker';

const execFileAsync = promisify(execFile);

const CLI_NOT_FOUND_MESSAGE =
  'Codex CLI not found. Install it with `npm i -g @openai/codex`, then run `codex login`.';

const ABORT_KILL_GRACE_MS = 2000;
const BATCH_FLUSH_INTERVAL_MS = 100;
const BATCH_MAX_SIZE = 20;
const CRITICAL_EVENT_TYPES = new Set(['done', 'error', 'callStart', 'filesChanged']);

type EventRecord = {
  sessionId: string;
  conversationId: string;
  sequenceNumber: number;
  eventType: string;
  payload: string;
  timestamp: string;
};

type FileSnapshot = Record<string, { mtimeMs: number; size: number }>;

type CodexUsage = {
  inputTokens: number;
  outputTokens: number;
};

export class CodexCliClient implements IModelProvider {
  readonly providerId: ProviderId = CODEX_CLI_PROVIDER_ID;

  readonly capabilities: ProviderCapability[] = [
    'text-completion',
    'tool-use',
    'streaming',
  ];

  private _available: boolean | null = null;
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private processBookMap: Map<string, string> = new Map();

  constructor(
    private booksDir: string,
    private db: IDatabaseService,
  ) {}

  async isAvailable(): Promise<boolean> {
    if (this._available !== null) return this._available;
    try {
      await execFileAsync('codex', ['--version'], { timeout: 10_000 });
      this._available = true;
      return true;
    } catch {
      this._available = false;
      return false;
    }
  }

  invalidateAvailabilityCache(): void {
    this._available = null;
  }

  hasActiveProcesses(): boolean {
    return this.activeProcesses.size > 0;
  }

  hasActiveProcessesForBook(bookSlug: string): boolean {
    for (const slug of this.processBookMap.values()) {
      if (slug === bookSlug) return true;
    }
    return false;
  }

  abortStream(conversationId: string): void {
    const child = this.activeProcesses.get(conversationId);
    if (!child) return;

    this.activeProcesses.delete(conversationId);
    this.processBookMap.delete(conversationId);
    child.kill('SIGTERM');

    const forceKillTimer = setTimeout(() => {
      try {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      } catch {
        // Process already exited.
      }
    }, ABORT_KILL_GRACE_MS);

    child.once('close', () => {
      clearTimeout(forceKillTimer);
    });
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
    const { model, bookSlug, workingDir } = params;
    const sessionId = params.sessionId || nanoid();
    const conversationId = params.conversationId ?? '';
    const tracker = new StreamSessionTracker(sessionId);
    const cwd = workingDir
      ? workingDir
      : bookSlug
        ? path.join(this.booksDir, bookSlug)
        : this.booksDir;

    const beforeSnapshot = await this.snapshotDirectory(cwd);
    let doneEmitted = false;
    let finalUsage: CodexUsage = { inputTokens: 0, outputTokens: 0 };
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
      if (streamEvent.type === 'done') {
        doneEmitted = true;
      }

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

    const prompt = this.buildPrompt(params.systemPrompt, params.messages);
    const args = [
      '--ask-for-approval', 'never',
      'exec',
      '--json',
      '--sandbox', 'workspace-write',
      '--skip-git-repo-check',
      '--ephemeral',
      '--model', model,
      '--cd', cwd,
      '--add-dir', this.booksDir,
    ];

    console.log(`[CodexCliClient] Spawning CLI: model=${model}, cwd=${cwd}, conversationId=${conversationId}`);

    return new Promise<void>((resolve, reject) => {
      const child = spawn('codex', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        cwd,
      });

      if (conversationId) {
        this.activeProcesses.set(conversationId, child);
        if (bookSlug) {
          this.processBookMap.set(conversationId, bookSlug);
        }
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

      child.on('error', (err: NodeJS.ErrnoException) => {
        const message = err.code === 'ENOENT' ? CLI_NOT_FOUND_MESSAGE : err.message;
        wrappedOnEvent({ type: 'error', message });
        flushBatch();
        settle(() => reject(new Error(message)));
      });

      const stdinBytes = Buffer.byteLength(prompt, 'utf-8');
      child.stdin.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
          console.warn(
            `[CodexCliClient] stdin ${err.code} — CLI process may have exited early ` +
            `(conversationId=${conversationId}, stdinBytes=${stdinBytes})`,
          );
          return;
        }
        const message = `Codex CLI stdin error: ${err.message}`;
        wrappedOnEvent({ type: 'error', message });
        flushBatch();
        settle(() => reject(new Error(message)));
      });

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as Record<string, unknown>;
            const usage = this.processStreamEvent(event, tracker, wrappedOnEvent);
            if (usage) finalUsage = usage;
          } catch {
            // Ignore non-JSON stdout lines defensively.
          }
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
      });

      child.on('close', (code) => {
        void (async () => {
          flushBatch();

          if (conversationId) {
            this.activeProcesses.delete(conversationId);
            this.processBookMap.delete(conversationId);
          }

          if (stdoutBuffer.trim()) {
            try {
              const event = JSON.parse(stdoutBuffer.trim()) as Record<string, unknown>;
              const usage = this.processStreamEvent(event, tracker, wrappedOnEvent);
              if (usage) finalUsage = usage;
            } catch {
              // Ignore unparseable remainder.
            }
          }

          const fileTouches = await this.collectFileTouches(cwd, beforeSnapshot);
          const touchedPaths = Object.keys(fileTouches);
          for (const touchedPath of touchedPaths) {
            tracker.touchFile(touchedPath);
          }

          if (touchedPaths.length > 0) {
            wrappedOnEvent({ type: 'filesChanged', paths: touchedPaths });
          }

          if (code === 0) {
            if (!doneEmitted) {
              const stageChange = tracker.inferStage('result');
              if (stageChange) {
                wrappedOnEvent({ type: 'progressStage', stage: stageChange });
              }
              wrappedOnEvent({
                type: 'done',
                inputTokens: finalUsage.inputTokens,
                outputTokens: finalUsage.outputTokens,
                thinkingTokens: Math.ceil(tracker.getThinkingBuffer().length / CHARS_PER_TOKEN),
                filesTouched: tracker.getFileTouches(),
              });
            }
            flushBatch();
            settle(() => resolve());
          } else {
            const message = stderrBuffer.trim() || `Codex CLI exited with code ${code}`;
            wrappedOnEvent({ type: 'error', message });
            flushBatch();
            settle(() => reject(new Error(message)));
          }
        })().catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          wrappedOnEvent({ type: 'error', message });
          flushBatch();
          settle(() => reject(new Error(message)));
        });
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  private buildPrompt(systemPrompt: string, messages: { role: MessageRole; content: string }[]): string {
    return [
      'You are running inside Novel Engine as an autonomous writing-production agent.',
      'Follow the system prompt below exactly. Read and write files relative to the current working directory unless an absolute path is provided.',
      '',
      '<system_prompt>',
      systemPrompt,
      '</system_prompt>',
      '',
      '<conversation>',
      this.buildConversationPrompt(messages),
      '</conversation>',
    ].join('\n');
  }

  private buildConversationPrompt(messages: { role: MessageRole; content: string }[]): string {
    if (messages.length === 0) return '';
    if (messages.length === 1) return `Human: ${messages[0].content}`;

    const parts: string[] = [];
    for (const msg of messages) {
      const roleLabel = msg.role === 'user' ? 'Human' : 'Assistant';
      parts.push(`${roleLabel}: ${msg.content}`);
    }
    return parts.join('\n\n');
  }

  private processStreamEvent(
    event: Record<string, unknown>,
    tracker: StreamSessionTracker,
    onEvent: (event: StreamEvent) => void,
  ): CodexUsage | null {
    const eventType = event.type as string;

    if (eventType === 'turn.started') {
      onEvent({ type: 'status', message: 'Codex started' });
      return null;
    }

    if (eventType === 'item.started') {
      this.emitToolEvent(event.item as Record<string, unknown> | undefined, tracker, onEvent, 'started');
      return null;
    }

    if (eventType === 'item.completed') {
      const item = event.item as Record<string, unknown> | undefined;
      if (!item) return null;

      const text = this.extractText(item);
      if (text) {
        const needsSeparator = tracker.getHasEmittedText();
        tracker.markTextEmitted();
        onEvent({ type: 'blockStart', blockType: 'text' });
        if (needsSeparator) {
          onEvent({ type: 'textDelta', text: '\n\n' });
        }
        onEvent({ type: 'textDelta', text });
        onEvent({ type: 'blockEnd', blockType: 'text' });
        return null;
      }

      this.emitToolEvent(item, tracker, onEvent, 'complete');
      return null;
    }

    if (eventType === 'turn.completed') {
      const usage = event.usage as Record<string, number> | undefined;
      return {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
      };
    }

    if (eventType === 'error') {
      const message = String(event.message ?? 'Codex CLI error');
      onEvent({ type: 'error', message });
      return null;
    }

    return null;
  }

  private extractText(item: Record<string, unknown>): string {
    if (typeof item.text === 'string') return item.text;
    if (typeof item.message === 'string') return item.message;
    if (typeof item.content === 'string') return item.content;

    const content = item.content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (!part || typeof part !== 'object') return '';
          const record = part as Record<string, unknown>;
          return typeof record.text === 'string' ? record.text : '';
        })
        .filter(Boolean)
        .join('');
    }

    return '';
  }

  private emitToolEvent(
    item: Record<string, unknown> | undefined,
    tracker: StreamSessionTracker,
    onEvent: (event: StreamEvent) => void,
    status: 'started' | 'complete',
  ): void {
    if (!item) return;
    const itemType = String(item.type ?? '');
    const toolName = this.resolveToolName(item);
    if (!toolName && !itemType.includes('tool') && !itemType.includes('command')) return;

    const toolId = String(item.id ?? item.call_id ?? nanoid());
    const filePath = this.extractFilePath(item);
    const resolvedToolName = toolName || itemType || 'tool';

    if (status === 'started') {
      tracker.startTool(toolId);
      tracker.setCurrentToolName(resolvedToolName);
      tracker.setCurrentToolId(toolId);
    }

    if (status === 'complete' && filePath && this.isWriteLikeTool(resolvedToolName)) {
      tracker.touchFile(filePath);
    }

    const toolInfo = {
      toolName: resolvedToolName,
      toolId,
      filePath,
      status,
    };

    onEvent({ type: 'toolUse', tool: toolInfo });
    const timestamped = status === 'complete' ? tracker.endTool(toolInfo) : null;
    if (timestamped) {
      onEvent({ type: 'toolDuration', tool: timestamped });
    }

    const stageChange = tracker.inferStage('toolUse', resolvedToolName, filePath);
    if (stageChange) {
      onEvent({ type: 'progressStage', stage: stageChange });
    }
  }

  private resolveToolName(item: Record<string, unknown>): string {
    const rawName = item.name ?? item.tool_name ?? item.command;
    if (typeof rawName === 'string' && rawName.trim()) {
      return rawName.includes(' ') ? 'Shell' : rawName;
    }
    return '';
  }

  private extractFilePath(item: Record<string, unknown>): string | undefined {
    const input = item.input as Record<string, unknown> | undefined;
    const candidates = [
      item.file_path,
      item.path,
      input?.file_path,
      input?.path,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
    return undefined;
  }

  private isWriteLikeTool(toolName: string): boolean {
    const normalized = toolName.toLowerCase();
    return normalized.includes('write') || normalized.includes('edit') || normalized.includes('patch');
  }

  private async snapshotDirectory(root: string): Promise<FileSnapshot> {
    const snapshot: FileSnapshot = {};
    await this.walkFiles(root, root, snapshot).catch(() => {});
    return snapshot;
  }

  private async collectFileTouches(root: string, before: FileSnapshot): Promise<FileTouchMap> {
    const after = await this.snapshotDirectory(root);
    const touched: FileTouchMap = {};

    for (const [relativePath, afterInfo] of Object.entries(after)) {
      const beforeInfo = before[relativePath];
      if (!beforeInfo || beforeInfo.mtimeMs !== afterInfo.mtimeMs || beforeInfo.size !== afterInfo.size) {
        touched[relativePath] = 1;
      }
    }

    return touched;
  }

  private async walkFiles(root: string, current: string, snapshot: FileSnapshot): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await this.walkFiles(root, absolutePath, snapshot);
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await stat(absolutePath);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      snapshot[relativePath] = { mtimeMs: info.mtimeMs, size: info.size };
    }
  }
}
