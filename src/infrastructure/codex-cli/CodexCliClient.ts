import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';
import path from 'node:path';
import { nanoid } from 'nanoid';

import type { IDatabaseService, IModelProvider } from '@domain/interfaces';
import type { MessageRole, ProviderCapability, ProviderId, StreamEvent } from '@domain/types';
import {
  CHARS_PER_TOKEN,
  CODEX_CLI_PROVIDER_ID,
  CODEX_STREAM_RETRY_DELAY_MS,
  CODEX_STREAM_RETRY_MAX,
} from '@domain/constants';
import { StreamSessionTracker } from '../claude-cli/StreamSessionTracker';

const execFileAsync = promisify(execFile);

const CODEX_NOT_FOUND_MESSAGE =
  'Codex CLI not found. Install it and sign in before selecting the Codex provider.';

const ABORT_KILL_GRACE_MS = 2000;
const BATCH_FLUSH_INTERVAL_MS = 100;
const BATCH_MAX_SIZE = 20;
const CRITICAL_EVENT_TYPES = new Set(['done', 'error', 'callStart', 'filesChanged']);
const WORKSPACE_SNAPSHOT_MAX_FILES = 5000;
const WORKSPACE_SNAPSHOT_SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', '.vite']);

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
  private abortedStreams: Set<string> = new Set();

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

  private snapshotWorkspace(root: string): Map<string, string> {
    const snapshot = new Map<string, string>();

    const visit = (dir: string): void => {
      if (snapshot.size >= WORKSPACE_SNAPSHOT_MAX_FILES) return;

      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }

      for (const entry of entries) {
        if (snapshot.size >= WORKSPACE_SNAPSHOT_MAX_FILES) return;
        if (WORKSPACE_SNAPSHOT_SKIP_DIRS.has(entry)) continue;

        const absPath = path.join(dir, entry);
        let stat: ReturnType<typeof statSync>;
        try {
          stat = statSync(absPath);
        } catch {
          continue;
        }

        if (stat.isDirectory()) {
          visit(absPath);
        } else if (stat.isFile()) {
          const relPath = this.normalizeWorkspacePath(absPath, root);
          snapshot.set(relPath, `${stat.size}:${stat.mtimeMs}`);
        }
      }
    };

    visit(root);
    return snapshot;
  }

  private diffWorkspaceSnapshot(root: string, before: Map<string, string>): string[] {
    const after = this.snapshotWorkspace(root);
    const changed: string[] = [];

    for (const [filePath, signature] of after) {
      if (before.get(filePath) !== signature) changed.push(filePath);
    }

    return changed.sort();
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
    // Marked before the process lookup so a Stop during retry backoff
    // (no live process) still cancels the pending re-spawn.
    this.abortedStreams.add(conversationId);
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

    if (conversationId) this.abortedStreams.delete(conversationId);

    let doneEmitted = false;
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

    let workspacePlan: CodexWorkspacePlan;
    try {
      workspacePlan = await this.buildWorkspacePlan({ bookSlug, workingDir });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      wrappedOnEvent({ type: 'error', message });
      throw new Error(message);
    }

    let lastFailure: Extract<CodexAttemptOutcome, { kind: 'failure' }> = {
      kind: 'failure',
      message: 'Codex CLI did not run.',
      retryable: false,
    };

    for (let attempt = 0; attempt <= CODEX_STREAM_RETRY_MAX; attempt++) {
      if (attempt > 0) {
        wrappedOnEvent({
          type: 'status',
          message: `Codex stream failed — retrying (${attempt}/${CODEX_STREAM_RETRY_MAX})...`,
        });
        await this.delay(attempt * CODEX_STREAM_RETRY_DELAY_MS);
        if (conversationId && this.abortedStreams.has(conversationId)) break; // user cancelled during backoff
      }

      const outcome = await this.runCodexAttempt({
        model,
        prompt,
        bookSlug,
        conversationId,
        workspacePlan,
        tracker,
        wrappedOnEvent,
        flushBatch,
        isDoneEmitted: () => doneEmitted,
      });

      if (outcome.kind === 'success') {
        if (conversationId) this.abortedStreams.delete(conversationId);
        return;
      }
      lastFailure = outcome;
      if (!outcome.retryable) break;
      if (conversationId && this.abortedStreams.has(conversationId)) break;
    }

    if (conversationId) this.abortedStreams.delete(conversationId);
    wrappedOnEvent({ type: 'error', message: lastFailure.message });
    throw new Error(lastFailure.message);
  }

  /**
   * Spawn one `codex exec` process and classify its outcome. Error
   * StreamEvents are withheld here — the retry loop in sendMessage() emits
   * exactly one error event if the run finally gives up.
   */
  private runCodexAttempt(options: {
    model: string;
    prompt: string;
    bookSlug?: string;
    conversationId: string;
    workspacePlan: CodexWorkspacePlan;
    tracker: StreamSessionTracker;
    wrappedOnEvent: (event: StreamEvent) => void;
    flushBatch: () => void;
    isDoneEmitted: () => boolean;
  }): Promise<CodexAttemptOutcome> {
    const { model, prompt, bookSlug, conversationId, workspacePlan, tracker, wrappedOnEvent, flushBatch, isDoneEmitted } = options;

    const parseState: CodexParseState = { deltaTextSeen: false, pendingUsage: null };
    const startedAt = Date.now();
    let parsedJsonEventCount = 0;
    let parsedJsonEventTail: string[] = [];
    let unknownJsonEventTail: string[] = [];
    let nonJsonStdoutTail = '';
    let lastStatusMessage = '';
    let lastStreamErrorMessage = '';
    let terminalErrorMessage = '';
    let textBlockOpen = false;
    let outputTextLength = 0;

    const onAttemptEvent = (streamEvent: StreamEvent) => {
      if (streamEvent.type === 'error') return;
      wrappedOnEvent(streamEvent);
    };

    const emitText = (text: string) => {
      if (!text) return;
      outputTextLength += text.length;
      if (!textBlockOpen) {
        textBlockOpen = true;
        tracker.setCurrentBlockType('text');
        tracker.markTextEmitted();
        onAttemptEvent({ type: 'blockStart', blockType: 'text' });
      }
      onAttemptEvent({ type: 'textDelta', text });
    };

    const closeTextBlock = () => {
      if (!textBlockOpen) return;
      onAttemptEvent({ type: 'blockEnd', blockType: 'text' });
      tracker.setCurrentBlockType(null);
      textBlockOpen = false;
    };

    const workspaceSnapshotBefore = this.snapshotWorkspace(workspacePlan.cwd);
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
      '--enable', 'standalone_web_search',
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

    return new Promise<CodexAttemptOutcome>((resolve) => {
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

      const settle = (outcome: CodexAttemptOutcome) => {
        if (!settled) {
          settled = true;
          resolve(outcome);
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
        settle({ kind: 'failure', message, retryable: false });
      });

      child.stdin.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') return;
        settle({ kind: 'failure', message: `Codex CLI stdin error: ${err.message}`, retryable: false });
      });

      const applyLineResult = (result: CodexLineResult) => {
        if (result.parsedJson) parsedJsonEventCount += 1;
        if (result.eventSummary) {
          parsedJsonEventTail = [...parsedJsonEventTail, result.eventSummary].slice(-12);
          if (result.eventSummary.startsWith('unknown') && result.rawJsonSnippet) {
            unknownJsonEventTail = [...unknownJsonEventTail, result.rawJsonSnippet].slice(-5);
          }
        }
        if (result.nonJsonText) nonJsonStdoutTail = this.appendTail(nonJsonStdoutTail, `${result.nonJsonText}\n`);
        if (result.statusMessage) lastStatusMessage = result.statusMessage;
        if (result.streamErrorMessage) lastStreamErrorMessage = result.streamErrorMessage;
        if (result.errorMessage) terminalErrorMessage = result.errorMessage;
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() ?? '';

        for (const line of lines) {
          applyLineResult(this.processOutputLine(line, emitText, onAttemptEvent, tracker, closeTextBlock, workspacePlan.cwd, parseState));
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer = this.appendTail(stderrBuffer, chunk.toString());
      });

      child.on('close', (code, signal) => {
        if (stdoutBuffer.trim()) {
          applyLineResult(this.processOutputLine(stdoutBuffer, emitText, onAttemptEvent, tracker, closeTextBlock, workspacePlan.cwd, parseState));
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

        // Retry only fully-empty transient failures: nothing streamed, nothing
        // written, and either a recorded stream error or a clean-but-empty exit.
        const isRetryable = () =>
          outputTextLength === 0 &&
          Object.keys(tracker.getFileTouches()).length === 0 &&
          !isDoneEmitted() &&
          (lastStreamErrorMessage !== '' || (code === 0 && parsedJsonEventCount > 0));

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
              unknownJsonEventTail,
              lastStatusMessage,
              lastStreamErrorMessage,
              stderr,
              stdoutTail,
            });
            cleanup();
            settle({ kind: 'failure', message, retryable: isRetryable() });
            return;
          }

          const touchedPaths = Object.keys(tracker.getFileTouches());
          if (touchedPaths.length === 0) {
            const snapshotChangedPaths = this.diffWorkspaceSnapshot(workspacePlan.cwd, workspaceSnapshotBefore);
            for (const changedPath of snapshotChangedPaths) {
              tracker.touchFile(changedPath);
            }
          }

          const finalTouchedPaths = Object.keys(tracker.getFileTouches());
          if (!isDoneEmitted() && outputTextLength === 0 && finalTouchedPaths.length > 0) {
            const summaryText = [
              'Codex completed and updated files:',
              ...finalTouchedPaths.map((filePath) => `- ${filePath}`),
            ].join('\n');
            emitText(summaryText);
            closeTextBlock();

            const inputTokens = Math.ceil(prompt.length / CHARS_PER_TOKEN);
            const outputTokens = Math.ceil(summaryText.length / CHARS_PER_TOKEN);
            const stageChange = tracker.inferStage('result');
            if (stageChange) {
              onAttemptEvent({ type: 'progressStage', stage: stageChange });
            }
            onAttemptEvent({
              type: 'done',
              inputTokens,
              outputTokens,
              thinkingTokens: 0,
              filesTouched: tracker.getFileTouches(),
            });
          }

          if (!isDoneEmitted() && outputTextLength === 0) {
            const message = this.buildCodexExitMessage({
              summary: lastStreamErrorMessage
                ? `Codex CLI stream failed after retries: ${lastStreamErrorMessage}`
                : 'Codex CLI exited without assistant output or usage.',
              code,
              signal,
              elapsedMs,
              workspaceMode: workspacePlan.mode,
              parsedJsonEventCount,
              parsedJsonEventTail,
              unknownJsonEventTail,
              lastStatusMessage,
              lastStreamErrorMessage,
              stderr,
              stdoutTail,
            });
            cleanup();
            settle({ kind: 'failure', message, retryable: isRetryable() });
            return;
          }

          if (!isDoneEmitted()) {
            const usage = parseState.pendingUsage ?? {
              inputTokens: Math.ceil(prompt.length / CHARS_PER_TOKEN),
              outputTokens: Math.ceil(outputTextLength / CHARS_PER_TOKEN),
              thinkingTokens: 0,
            };
            const stageChange = tracker.inferStage('result');
            if (stageChange) {
              onAttemptEvent({ type: 'progressStage', stage: stageChange });
            }
            onAttemptEvent({
              type: 'done',
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              thinkingTokens: usage.thinkingTokens,
              filesTouched: tracker.getFileTouches(),
            });
          }
          const changedPaths = Object.keys(tracker.getFileTouches());
          if (changedPaths.length > 0) {
            onAttemptEvent({ type: 'filesChanged', paths: changedPaths });
          }
          cleanup();
          settle({ kind: 'success' });
        } else {
          const message = this.buildCodexExitMessage({
            summary: terminalErrorMessage
              ? `Codex CLI reported an error before exit: ${terminalErrorMessage}`
              : lastStreamErrorMessage
                ? `Codex CLI stream failed after retries: ${lastStreamErrorMessage}`
                : 'Codex CLI exited unsuccessfully.',
            code,
            signal,
            elapsedMs,
            workspaceMode: workspacePlan.mode,
            parsedJsonEventCount,
            parsedJsonEventTail,
            unknownJsonEventTail,
            lastStatusMessage,
            lastStreamErrorMessage,
            stderr,
            stdoutTail,
          });
          cleanup();
          settle({ kind: 'failure', message, retryable: isRetryable() });
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
    parseState: CodexParseState,
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
    const rawJsonSnippet = eventSummary.startsWith('unknown')
      ? this.safeJsonSnippet(parsed)
      : undefined;
    const streamErrorMessage = this.extractStreamError(parsed);
    if (streamErrorMessage) {
      onEvent({ type: 'status', message: `Model stream error (Codex retrying): ${streamErrorMessage}` });
      return {
        parsedJson: true,
        eventSummary,
        rawJsonSnippet,
        streamErrorMessage,
        emittedText: false,
        emittedUsageDone: false,
      };
    }

    const errorMessage = this.extractError(parsed);
    if (errorMessage) {
      closeTextBlock();
      onEvent({ type: 'error', message: errorMessage });
      return {
        parsedJson: true,
        eventSummary,
        rawJsonSnippet,
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

    const text = this.extractText(parsed, parseState);
    if (text) {
      emitText(text);
    }

    const usageResult = this.extractUsage(parsed, parseState);
    if (usageResult) {
      if (!usageResult.terminal) {
        parseState.pendingUsage = usageResult.usage;
        return {
          parsedJson: true,
          eventSummary,
          rawJsonSnippet,
          emittedText: Boolean(text),
          emittedUsageDone: false,
        };
      }
      closeTextBlock();
      const stageChange = tracker.inferStage('result');
      if (stageChange) {
        onEvent({ type: 'progressStage', stage: stageChange });
      }
      onEvent({
        type: 'done',
        inputTokens: usageResult.usage.inputTokens,
        outputTokens: usageResult.usage.outputTokens,
        thinkingTokens: usageResult.usage.thinkingTokens,
        filesTouched: tracker.getFileTouches(),
      });
      return {
        parsedJson: true,
        eventSummary,
        rawJsonSnippet,
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
      rawJsonSnippet,
      statusMessage: statusMessage || undefined,
      emittedText: Boolean(text),
      emittedUsageDone: false,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private appendTail(current: string, chunk: string, maxChars = 4000): string {
    const next = current + chunk;
    return next.length > maxChars ? next.slice(next.length - maxChars) : next;
  }

  private summarizeCodexEvent(event: Record<string, unknown>): string {
    const candidates = this.unwrapCodexEvent(event);

    for (const candidate of candidates) {
      const rawType = this.getString(candidate, 'type');
      const type = rawType && rawType !== 'unknown' ? rawType : undefined;
      const item = this.getNestedRecord(candidate, 'item');
      if (!type) continue;
      if (item) {
        const rawItemType = this.getString(item, 'type');
        const itemType = rawItemType && rawItemType !== 'unknown' ? rawItemType : undefined;
        const toolName = this.getString(item, 'name') ?? this.getString(item, 'tool_name');
        const itemKeys = Object.keys(item).slice(0, 6).join(',');
        return [type, itemType ?? (itemKeys ? `item{${itemKeys}}` : undefined), toolName]
          .filter(Boolean)
          .join(':');
      }
      return type;
    }

    // No candidate carried a type — label the CLI's config/prompt echo lines.
    for (const candidate of candidates) {
      if ('prompt' in candidate) return 'prompt-echo';
      const configKeyCount = ['provider', 'model', 'sandbox', 'workdir', 'approval']
        .filter((key) => key in candidate).length;
      if (configKeyCount >= 2) return 'config-echo';
    }

    const keys = Object.keys(event).slice(0, 6).join(',');
    const item = candidates
      .map((candidate) => this.getNestedRecord(candidate, 'item'))
      .find((candidate): candidate is Record<string, unknown> => Boolean(candidate));

    if (item) {
      const itemKeys = Object.keys(item).slice(0, 6).join(',');
      return `unknown{${keys}}:item{${itemKeys}}`;
    }

    return keys ? `unknown{${keys}}` : 'unknown{}';
  }

  private safeJsonSnippet(value: Record<string, unknown>, maxChars = 500): string {
    try {
      const json = JSON.stringify(value);
      return json.length > maxChars ? `${json.slice(0, maxChars)}…` : json;
    } catch {
      return '';
    }
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
      || lower.includes('web_search')
      || lower.includes('websearch')
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

    if (toolName === 'WebSearch') {
      const action = record.action;
      if (this.isRecord(action)) {
        const actionQuery = this.getString(action, 'query');
        if (actionQuery) return actionQuery;
      }
      const query = this.getString(record, 'query');
      if (query) return query;
      return undefined;
    }

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
    if (!relativePath || relativePath.startsWith('..')) return filePath;
    // Book-relative paths are display/domain values — always POSIX separators
    return relativePath.split(path.sep).join('/');
  }

  private normalizeToolName(toolName: string): string {
    const lower = toolName.toLowerCase();
    if (lower === 'read' || lower.includes('read')) return 'Read';
    if (lower === 'write' || lower.includes('write')) return 'Write';
    if (lower === 'edit' || lower.includes('edit')) return 'Edit';
    if (lower === 'ls' || lower.includes('list')) return 'LS';
    if (lower.includes('web_search') || lower.includes('websearch')) return 'WebSearch';
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
    unknownJsonEventTail: string[];
    lastStatusMessage: string;
    lastStreamErrorMessage: string;
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
    if (params.unknownJsonEventTail.length > 0) {
      parts.push(`unknownJsonTail=${params.unknownJsonEventTail.join(' | ')}`);
    }
    if (params.lastStatusMessage) parts.push(`lastStatus=${params.lastStatusMessage}`);
    if (params.lastStreamErrorMessage) parts.push(`streamError=${params.lastStreamErrorMessage}`);
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

  private extractText(event: Record<string, unknown>, parseState: CodexParseState): string {
    for (const candidate of this.unwrapCodexEvent(event)) {
      const type = this.getString(candidate, 'type') ?? '';

      // Deltas already streamed this content; skip the final full message.
      if (type === 'agent_message' && parseState.deltaTextSeen) {
        parseState.deltaTextSeen = false;
        continue;
      }

      const text = this.extractCandidateText(candidate);
      if (!text) continue;
      if (type.includes('delta')) parseState.deltaTextSeen = true;
      return text;
    }
    return '';
  }

  private extractCandidateText(candidate: Record<string, unknown>): string {
    const directText = this.getString(candidate, 'text') ?? this.getString(candidate, 'delta') ?? this.getString(candidate, 'message');
    if (directText && this.looksLikeAssistantText(candidate)) return directText;

    const item = candidate.item;
    if (this.isRecord(item)) {
      const itemText = this.getString(item, 'text') ?? this.getString(item, 'content');
      if (itemText && this.looksLikeAssistantText(item)) return itemText;
    }

    const content = candidate.content;
    if (Array.isArray(content)) {
      return content
        .map((part) => this.isRecord(part) ? (this.getString(part, 'text') ?? '') : '')
        .filter(Boolean)
        .join('');
    }

    return '';
  }


  private extractUsage(
    event: Record<string, unknown>,
    parseState: CodexParseState,
  ): { usage: CodexUsage; terminal: boolean } | null {
    for (const candidate of this.unwrapCodexEvent(event)) {
      const type = this.getString(candidate, 'type');

      if (type === 'turn.completed') {
        const usage = this.getNestedRecord(candidate, 'usage');
        if (!usage) continue;
        return { usage: this.readUsageFields(usage), terminal: true };
      }

      // 0.27.0 emits token_count mid-task; ending the turn there would cut
      // the UI off while the process keeps running.
      if (type === 'token_count') {
        const hasDirectFields = this.getNumber(candidate, 'input_tokens') !== undefined
          || this.getNumber(candidate, 'output_tokens') !== undefined;
        const info = this.getNestedRecord(candidate, 'info');
        const source = hasDirectFields
          ? candidate
          : info && (this.getNestedRecord(info, 'total_token_usage') ?? this.getNestedRecord(info, 'last_token_usage'));
        if (!source) continue;
        return { usage: this.readUsageFields(source), terminal: false };
      }

      if (type === 'task_complete') {
        return {
          usage: parseState.pendingUsage ?? { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 },
          terminal: true,
        };
      }
    }
    return null;
  }

  private readUsageFields(record: Record<string, unknown>): CodexUsage {
    return {
      inputTokens: this.getNumber(record, 'input_tokens') ?? 0,
      outputTokens: this.getNumber(record, 'output_tokens') ?? 0,
      thinkingTokens: this.getNumber(record, 'reasoning_output_tokens') ?? 0,
    };
  }

  /** Transient model-stream failure (the CLI retries internally). Returns its message, or ''. */
  private extractStreamError(event: Record<string, unknown>): string {
    for (const candidate of this.unwrapCodexEvent(event)) {
      const type = (this.getString(candidate, 'type') ?? '').toLowerCase();
      if (type === 'stream_error') {
        return this.getString(candidate, 'message') ?? this.getString(candidate, 'msg') ?? 'stream error';
      }
    }
    return '';
  }

  /** Terminal error extraction — transient stream_error events are extractStreamError()'s job. */
  private extractError(event: Record<string, unknown>): string {
    for (const candidate of this.unwrapCodexEvent(event)) {
      const rawType = this.getString(candidate, 'type') ?? '';
      const type = rawType.toLowerCase();
      if (type === 'stream_error') continue;

      const level = this.getString(candidate, 'level') ?? '';
      const message = this.getString(candidate, 'message') ?? this.getString(candidate, 'msg');
      const error = candidate.error;

      if (typeof error === 'string') return error;
      if (this.isRecord(error)) {
        return this.getString(error, 'message') ?? this.getString(error, 'msg') ?? JSON.stringify(error);
      }
      if (type.includes('error') || level.toLowerCase() === 'error') {
        return message ?? rawType;
      }
      const item = candidate.item;
      if (this.isRecord(item)) {
        const itemType = this.getString(item, 'type') ?? '';
        if (itemType.toLowerCase().includes('error')) {
          return this.getString(item, 'message') ?? this.getString(item, 'text') ?? itemType;
        }
      }
    }
    return '';
  }

  private extractStatus(event: Record<string, unknown>): string {
    for (const candidate of this.unwrapCodexEvent(event)) {
      const type = this.getString(candidate, 'type');
      if (!type || this.looksLikeAssistantText(candidate)) continue;
      if (type.toLowerCase().includes('error')) continue; // SESSION-02 gives errors dedicated handling
      const msg = this.getString(candidate, 'message') ?? this.getString(candidate, 'msg');
      return msg ?? type;
    }
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

  private getNestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
    const value = record[key];
    return this.isRecord(value) ? value : null;
  }

  /**
   * Codex 0.27.0 wraps payloads as {"id":"0","msg":{...}}; some builds use
   * "event"/"data". Returns the event itself plus any nested envelope records,
   * outermost first, so callers can probe each candidate for a known shape.
   */
  private unwrapCodexEvent(event: Record<string, unknown>): Record<string, unknown>[] {
    return [
      event,
      this.getNestedRecord(event, 'msg'),
      this.getNestedRecord(event, 'event'),
      this.getNestedRecord(event, 'data'),
    ].filter((c): c is Record<string, unknown> => Boolean(c));
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

/** Result of one codex exec spawn, classified for the sendMessage() retry loop. */
type CodexAttemptOutcome =
  | { kind: 'success' }
  | { kind: 'failure'; message: string; retryable: boolean };

type CodexUsage = { inputTokens: number; outputTokens: number; thinkingTokens: number };

/** Per-sendMessage mutable parse state threaded through processOutputLine(). */
type CodexParseState = {
  deltaTextSeen: boolean;
  pendingUsage: CodexUsage | null;
};

type CodexLineResult = {
  parsedJson: boolean;
  eventSummary?: string;
  rawJsonSnippet?: string;
  nonJsonText?: string;
  statusMessage?: string;
  streamErrorMessage?: string;
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
