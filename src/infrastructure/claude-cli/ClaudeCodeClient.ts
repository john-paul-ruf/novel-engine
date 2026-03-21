import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'node:path';

import type { IClaudeClient } from '@domain/interfaces';
import type { MessageRole, StreamEvent, StreamBlockType } from '@domain/types';
import { CHARS_PER_TOKEN } from '@domain/constants';

const execFileAsync = promisify(execFile);

const CLI_NOT_FOUND_MESSAGE =
  'Claude Code CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-code';

export class ClaudeCodeClient implements IClaudeClient {
  /** Cached availability result — CLI presence doesn't change during a session. */
  private _available: boolean | null = null;

  constructor(private booksDir: string) {}

  async isAvailable(): Promise<boolean> {
    if (this._available !== null) return this._available;
    try {
      await execFileAsync('claude', ['--version']);
      this._available = true;
      return true;
    } catch {
      this._available = false;
      return false;
    }
  }

  /** Force re-check on next isAvailable() call (e.g. after user installs the CLI). */
  invalidateAvailabilityCache(): void {
    this._available = null;
  }

  async sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    bookSlug?: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void> {
    const { model, systemPrompt, messages, maxTokens, thinkingBudget, bookSlug, onEvent } = params;

    // Build conversation prompt from message history
    const conversationPrompt = this.buildConversationPrompt(messages);

    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      '--max-turns', '15',
      '--system-prompt', systemPrompt,
      '--allowedTools', 'Read,Write,Edit,LS',
      '--max-tokens', String(maxTokens),
    ];

    if (thinkingBudget && thinkingBudget > 0) {
      args.push('--thinking-budget', String(thinkingBudget));
    }

    // Set working directory to book root if bookSlug is provided
    const cwd = bookSlug
      ? path.join(this.booksDir, bookSlug)
      : undefined;

    return new Promise<void>((resolve, reject) => {
      const child = spawn('claude', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        cwd,
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let thinkingBuffer = '';
      let currentBlockType: StreamBlockType | null = null;
      let hasEmittedText = false;
      let settled = false;

      // Tool use tracking
      let currentToolName = '';
      let currentToolId = '';
      let toolInputBuffer = '';
      const changedFiles: string[] = [];

      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      child.on('error', (err: NodeJS.ErrnoException) => {
        const message = err.code === 'ENOENT' ? CLI_NOT_FOUND_MESSAGE : err.message;
        onEvent({ type: 'error', message });
        settle(() => reject(new Error(message)));
      });

      // Guard against EPIPE — the CLI process may exit before we finish writing
      // to stdin (e.g. invalid args, immediate crash). Without this handler the
      // error bubbles up as an uncaught exception and crashes the app.
      child.stdin.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
          // The child process is already dead — the 'close' handler will
          // capture the exit code and emit a proper error event.
          return;
        }
        const message = `CLI stdin error: ${err.message}`;
        onEvent({ type: 'error', message });
        settle(() => reject(new Error(message)));
      });

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer
        stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            this.mapStreamEvent(
              event, onEvent, thinkingBuffer, currentBlockType, hasEmittedText,
              currentToolName, currentToolId, toolInputBuffer, changedFiles,
              (tb) => { thinkingBuffer = tb; },
              (bt) => { currentBlockType = bt; },
              () => { hasEmittedText = true; },
              (name) => { currentToolName = name; },
              (id) => { currentToolId = id; },
              (input) => { toolInputBuffer = input; },
            );
          } catch {
            // Skip unparseable lines
          }
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
      });

      child.on('close', (code) => {
        // Process any remaining data in the stdout buffer
        if (stdoutBuffer.trim()) {
          try {
            const event = JSON.parse(stdoutBuffer.trim());
            this.mapStreamEvent(
              event, onEvent, thinkingBuffer, currentBlockType, hasEmittedText,
              currentToolName, currentToolId, toolInputBuffer, changedFiles,
              (tb) => { thinkingBuffer = tb; },
              (bt) => { currentBlockType = bt; },
              () => { hasEmittedText = true; },
              (name) => { currentToolName = name; },
              (id) => { currentToolId = id; },
              (input) => { toolInputBuffer = input; },
            );
          } catch {
            // Skip unparseable remainder
          }
        }

        // Emit filesChanged before resolving (done is emitted by mapStreamEvent on result event)
        if (changedFiles.length > 0) {
          onEvent({ type: 'filesChanged', paths: [...changedFiles] });
        }

        if (code === 0) {
          settle(() => resolve());
        } else {
          const message = stderrBuffer.trim() || `Claude CLI exited with code ${code}`;
          onEvent({ type: 'error', message });
          settle(() => reject(new Error(message)));
        }
      });

      // Write conversation prompt to stdin and close
      child.stdin.write(conversationPrompt);
      child.stdin.end();
    });
  }

  /**
   * Reconstruct conversation history as a single prompt string.
   * The last message is always the latest user message.
   */
  private buildConversationPrompt(messages: { role: MessageRole; content: string }[]): string {
    if (messages.length === 0) return '';
    if (messages.length === 1) return messages[0].content;

    const parts: string[] = [];
    for (const msg of messages) {
      const roleLabel = msg.role === 'user' ? 'Human' : 'Assistant';
      parts.push(`${roleLabel}: ${msg.content}`);
    }
    return parts.join('\n\n');
  }

  /**
   * Extract a file path from the tool input JSON for Write/Read/Edit tools.
   */
  private extractFilePathFromToolInput(toolName: string, jsonStr: string): string | undefined {
    try {
      const input = JSON.parse(jsonStr) as Record<string, unknown>;
      if (toolName === 'Write' || toolName === 'Read' || toolName === 'Edit') {
        return input.file_path as string | undefined;
      }
    } catch {
      // Partial JSON may not parse — that's fine
    }
    return undefined;
  }

  /**
   * Map a parsed CLI stream-json event to our StreamEvent type and emit it.
   *
   * The Claude CLI `--output-format stream-json` emits events following the
   * Anthropic streaming API convention. In full agent mode, it also emits
   * tool_use and tool_result content blocks for file operations.
   */
  private mapStreamEvent(
    event: Record<string, unknown>,
    onEvent: (event: StreamEvent) => void,
    thinkingBuffer: string,
    currentBlockType: StreamBlockType | null,
    hasEmittedText: boolean,
    currentToolName: string,
    currentToolId: string,
    toolInputBuffer: string,
    changedFiles: string[],
    setThinkingBuffer: (tb: string) => void,
    setCurrentBlockType: (bt: StreamBlockType | null) => void,
    markTextEmitted: () => void,
    setCurrentToolName: (name: string) => void,
    setCurrentToolId: (id: string) => void,
    setToolInputBuffer: (input: string) => void,
  ): void {
    const eventType = event.type as string;

    // Result event — final summary with token usage
    if (eventType === 'result') {
      // Fallback: if no textDelta events were received, emit the full result text
      const resultText = event.result as string | undefined;
      if (resultText && !hasEmittedText) {
        onEvent({ type: 'blockStart', blockType: 'text' });
        onEvent({ type: 'textDelta', text: resultText });
        onEvent({ type: 'blockEnd', blockType: 'text' });
      }

      const usage = event.usage as Record<string, number> | undefined;
      const inputTokens = usage?.input_tokens ?? 0;
      const outputTokens = usage?.output_tokens ?? 0;
      const thinkingTokens = Math.ceil(thinkingBuffer.length / CHARS_PER_TOKEN);
      onEvent({ type: 'done', inputTokens, outputTokens, thinkingTokens });
      return;
    }

    // content_block_start — detect block type (thinking, text, tool_use, tool_result)
    if (eventType === 'content_block_start') {
      const contentBlock = event.content_block as Record<string, unknown> | undefined;
      const blockType = contentBlock?.type as string | undefined;

      if (blockType === 'tool_use') {
        const toolName = contentBlock?.name as string ?? 'unknown';
        const toolId = contentBlock?.id as string ?? '';
        setCurrentBlockType('tool_use');
        setCurrentToolName(toolName);
        setCurrentToolId(toolId);
        setToolInputBuffer('');
        onEvent({
          type: 'toolUse',
          tool: { toolName, toolId, status: 'started' },
        });
        return;
      }

      if (blockType === 'tool_result') {
        setCurrentBlockType('tool_result');
        return;
      }

      const streamBlockType: StreamBlockType = blockType === 'thinking' ? 'thinking' : 'text';
      setCurrentBlockType(streamBlockType);
      onEvent({ type: 'blockStart', blockType: streamBlockType });
      return;
    }

    // content_block_delta — extract text or tool input
    if (eventType === 'content_block_delta') {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (!delta) return;

      const deltaType = delta.type as string | undefined;

      // Tool use input JSON accumulation
      if (deltaType === 'input_json_delta') {
        const partialJson = delta.partial_json as string ?? '';
        setToolInputBuffer(toolInputBuffer + partialJson);
        return;
      }

      if (deltaType === 'thinking_delta' || deltaType === 'thinking') {
        const text = (delta.thinking as string) ?? '';
        setThinkingBuffer(thinkingBuffer + text);
        onEvent({ type: 'thinkingDelta', text });
        return;
      }

      if (deltaType === 'text_delta' || deltaType === 'text') {
        const text = (delta.text as string) ?? '';
        markTextEmitted();
        onEvent({ type: 'textDelta', text });
        return;
      }

      return;
    }

    // content_block_stop — close the current block
    if (eventType === 'content_block_stop') {
      if (currentBlockType === 'tool_use') {
        // Parse accumulated tool input to extract file path
        const filePath = this.extractFilePathFromToolInput(currentToolName, toolInputBuffer);

        // Track files written by Write or Edit tools
        if (filePath && (currentToolName === 'Write' || currentToolName === 'Edit')) {
          changedFiles.push(filePath);
        }

        onEvent({
          type: 'toolUse',
          tool: {
            toolName: currentToolName,
            toolId: currentToolId,
            filePath,
            status: 'complete',
          },
        });

        setToolInputBuffer('');
        setCurrentBlockType(null);
        setCurrentToolName('');
        setCurrentToolId('');
        return;
      }

      if (currentBlockType === 'tool_result') {
        setCurrentBlockType(null);
        return;
      }

      const blockType = currentBlockType || 'text';
      onEvent({ type: 'blockEnd', blockType });
      setCurrentBlockType(null);
      return;
    }
  }


}
