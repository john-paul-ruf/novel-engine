import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'node:path';
import { nanoid } from 'nanoid';

import type { IClaudeClient, IDatabaseService } from '@domain/interfaces';
import type { MessageRole, StreamEvent } from '@domain/types';
import { CHARS_PER_TOKEN } from '@domain/constants';
import { StreamSessionTracker } from './StreamSessionTracker';

const execFileAsync = promisify(execFile);

const CLI_NOT_FOUND_MESSAGE =
  'Claude Code CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-code';

export class ClaudeCodeClient implements IClaudeClient {
  /** Cached availability result — CLI presence doesn't change during a session. */
  private _available: boolean | null = null;

  constructor(
    private booksDir: string,
    private db: IDatabaseService,
  ) {}

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
    workingDir?: string;
    sessionId?: string;
    conversationId?: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void> {
    const { model, systemPrompt, messages, bookSlug, workingDir } = params;

    // Use caller-provided sessionId or generate one
    const sessionId = params.sessionId || nanoid();
    const conversationId = params.conversationId ?? '';

    // Create tracker for this stream session
    const tracker = new StreamSessionTracker(sessionId);

    // Wrap onEvent to persist every emitted event
    const wrappedOnEvent = (streamEvent: StreamEvent) => {
      try {
        this.db.persistStreamEvent({
          sessionId,
          conversationId,
          sequenceNumber: tracker.nextSequence(),
          eventType: streamEvent.type,
          payload: JSON.stringify(streamEvent),
          timestamp: new Date().toISOString(),
        });
      } catch {
        // Event persistence is best-effort — don't fail the stream
      }
      params.onEvent(streamEvent);
    };

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
    ];

    // The Claude Code CLI uses --effort to control thinking depth.
    // When the caller requests extended thinking (thinkingBudget > 0),
    // we set --effort high to enable deep reasoning.
    if (params.thinkingBudget && params.thinkingBudget > 0) {
      args.push('--effort', 'high');
    }

    // Set working directory: explicit workingDir takes priority, then bookSlug-derived path
    const cwd = workingDir
      ? workingDir
      : bookSlug
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
        settle(() => reject(new Error(message)));
      });

      // Guard against EPIPE — the CLI process may exit before we finish writing
      // to stdin (e.g. invalid args, immediate crash). Without this handler the
      // error bubbles up as an uncaught exception and crashes the app.
      child.stdin.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
          return;
        }
        const message = `CLI stdin error: ${err.message}`;
        wrappedOnEvent({ type: 'error', message });
        settle(() => reject(new Error(message)));
      });

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            this.processStreamEvent(event, tracker, wrappedOnEvent);
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
            this.processStreamEvent(event, tracker, wrappedOnEvent);
          } catch {
            // Skip unparseable remainder
          }
        }

        // Emit filesChanged using the tracker's file touch map
        const touchedPaths = Object.keys(tracker.getFileTouches());
        if (touchedPaths.length > 0) {
          wrappedOnEvent({ type: 'filesChanged', paths: touchedPaths });
        }

        if (code === 0) {
          settle(() => resolve());
        } else {
          const message = stderrBuffer.trim() || `Claude CLI exited with code ${code}`;
          wrappedOnEvent({ type: 'error', message });
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
   * Extract a file path from a tool input object for Write/Read/Edit tools.
   */
  private extractFilePath(toolName: string, input: Record<string, unknown>): string | undefined {
    if (toolName === 'Write' || toolName === 'Read' || toolName === 'Edit') {
      return input.file_path as string | undefined;
    }
    return undefined;
  }

  /**
   * Process a parsed CLI stream-json event using the StreamSessionTracker.
   *
   * The Claude Code CLI (v2.1+) outputs high-level JSON events:
   *   - { type: "system", subtype: "init", ... }
   *   - { type: "assistant", message: { content: [...] }, ... }
   *   - { type: "user", message: { content: [{ type: "tool_result", ... }] }, ... }
   *   - { type: "result", result: "...", usage: {...}, ... }
   *
   * Each "assistant" event carries a complete message with one or more content
   * blocks (thinking, text, tool_use). We translate these into the StreamEvent
   * types that the renderer expects.
   */
  private processStreamEvent(
    event: Record<string, unknown>,
    tracker: StreamSessionTracker,
    onEvent: (event: StreamEvent) => void,
  ): void {
    const eventType = event.type as string;

    // === result — final summary with token usage ===
    if (eventType === 'result') {
      // Fallback: if no textDelta events were received, emit the full result text
      const resultText = event.result as string | undefined;
      if (resultText && !tracker.getHasEmittedText()) {
        onEvent({ type: 'blockStart', blockType: 'text' });
        onEvent({ type: 'textDelta', text: resultText });
        onEvent({ type: 'blockEnd', blockType: 'text' });
      }

      // Extract token usage from the result's usage summary
      const usage = event.usage as Record<string, number> | undefined;
      const inputTokens = usage?.input_tokens ?? 0;
      const outputTokens = usage?.output_tokens ?? 0;
      const thinkingTokens = Math.ceil(tracker.getThinkingBuffer().length / CHARS_PER_TOKEN);

      // Infer final stage
      const stageChange = tracker.inferStage('result');
      if (stageChange) {
        onEvent({ type: 'progressStage', stage: stageChange });
      }

      onEvent({
        type: 'done',
        inputTokens,
        outputTokens,
        thinkingTokens,
        filesTouched: tracker.getFileTouches(),
      });
      return;
    }

    // === assistant — contains content blocks (thinking, text, tool_use) ===
    if (eventType === 'assistant') {
      const message = event.message as Record<string, unknown> | undefined;
      if (!message) return;

      const contentBlocks = message.content as Array<Record<string, unknown>> | undefined;
      if (!contentBlocks || !Array.isArray(contentBlocks)) return;

      for (const block of contentBlocks) {
        const blockType = block.type as string | undefined;
        if (!blockType) continue;

        if (blockType === 'thinking') {
          const thinking = block.thinking as string ?? '';
          if (!thinking) continue;

          // Emit thinking block as a complete unit
          tracker.setCurrentBlockType('thinking');
          onEvent({ type: 'blockStart', blockType: 'thinking' });

          // Infer thinking progress stage
          const stageChange = tracker.inferStage('blockStart');
          if (stageChange) {
            onEvent({ type: 'progressStage', stage: stageChange });
          }

          tracker.appendThinkingBuffer(thinking);
          onEvent({ type: 'thinkingDelta', text: thinking });
          onEvent({ type: 'blockEnd', blockType: 'thinking' });

          // Extract thinking summary
          const summary = tracker.extractThinkingSummary();
          if (summary) {
            onEvent({ type: 'thinkingSummary', summary });
          }
          tracker.resetThinkingBuffer();
          tracker.setCurrentBlockType(null);
          continue;
        }

        if (blockType === 'text') {
          const text = block.text as string ?? '';
          if (!text) continue;

          // Emit text block as a complete unit
          tracker.setCurrentBlockType('text');
          tracker.markTextEmitted();
          onEvent({ type: 'blockStart', blockType: 'text' });
          onEvent({ type: 'textDelta', text });
          onEvent({ type: 'blockEnd', blockType: 'text' });
          tracker.setCurrentBlockType(null);
          continue;
        }

        if (blockType === 'tool_use') {
          const toolName = block.name as string ?? 'unknown';
          const toolId = block.id as string ?? '';
          const input = block.input as Record<string, unknown> ?? {};
          const filePath = this.extractFilePath(toolName, input);

          // Start tool timestamp
          tracker.startTool(toolId);

          // Emit tool started event
          onEvent({
            type: 'toolUse',
            tool: { toolName, toolId, filePath, status: 'started' },
          });

          // Infer progress stage from tool use
          const stageChange = tracker.inferStage('toolUse', toolName, filePath);
          if (stageChange) {
            onEvent({ type: 'progressStage', stage: stageChange });
          }

          // Track the current tool for matching with the tool_result
          tracker.setCurrentToolName(toolName);
          tracker.setCurrentToolId(toolId);
          continue;
        }
      }

      return;
    }

    // === user — contains tool_result blocks (agent loop feedback) ===
    if (eventType === 'user') {
      const message = event.message as Record<string, unknown> | undefined;
      if (!message) return;

      const contentBlocks = message.content as Array<Record<string, unknown>> | undefined;
      if (!contentBlocks || !Array.isArray(contentBlocks)) return;

      for (const block of contentBlocks) {
        const blockType = block.type as string | undefined;
        if (blockType !== 'tool_result') continue;

        const toolUseId = block.tool_use_id as string ?? tracker.getCurrentToolId();
        const currentToolName = tracker.getCurrentToolName();

        // Extract file path from the tool_use_result metadata if available
        const toolResultMeta = event.tool_use_result as Record<string, unknown> | undefined;
        const fileMeta = toolResultMeta?.file as Record<string, unknown> | undefined;
        const filePath = fileMeta?.filePath as string | undefined;

        // Track files written by Write or Edit tools
        if (filePath && (currentToolName === 'Write' || currentToolName === 'Edit')) {
          tracker.touchFile(filePath);
        }

        const toolInfo = {
          toolName: currentToolName,
          toolId: toolUseId,
          filePath,
          status: 'complete' as const,
        };

        // Emit tool complete event
        onEvent({ type: 'toolUse', tool: toolInfo });

        // End tool timestamp and emit duration
        const timestamped = tracker.endTool(toolInfo);
        onEvent({ type: 'toolDuration', tool: timestamped });

        // Infer updated stage after tool completion
        const stageChange = tracker.inferStage('toolUse', currentToolName, filePath);
        if (stageChange) {
          onEvent({ type: 'progressStage', stage: stageChange });
        }

        // Clear tool state
        tracker.setCurrentToolName('');
        tracker.setCurrentToolId('');
      }

      return;
    }

    // === system — CLI initialization info (useful for diagnostics) ===
    if (eventType === 'system') {
      // We don't emit a stream event for system init, but it confirms the CLI is running
      return;
    }

    // === Fallback for raw API streaming events (content_block_*) ===
    // Some CLI versions or configurations may emit raw streaming events.
    // Handle them for backward compatibility.

    if (eventType === 'content_block_start') {
      const contentBlock = event.content_block as Record<string, unknown> | undefined;
      const cbType = contentBlock?.type as string | undefined;

      if (cbType === 'tool_use') {
        const toolName = contentBlock?.name as string ?? 'unknown';
        const toolId = contentBlock?.id as string ?? '';
        tracker.setCurrentBlockType('tool_use');
        tracker.setCurrentToolName(toolName);
        tracker.setCurrentToolId(toolId);
        tracker.setToolInputBuffer('');
        tracker.startTool(toolId);
        onEvent({ type: 'toolUse', tool: { toolName, toolId, status: 'started' } });
        return;
      }

      if (cbType === 'tool_result') {
        tracker.setCurrentBlockType('tool_result');
        return;
      }

      const streamBlockType = cbType === 'thinking' ? 'thinking' as const : 'text' as const;
      tracker.setCurrentBlockType(streamBlockType);
      onEvent({ type: 'blockStart', blockType: streamBlockType });

      if (streamBlockType === 'thinking') {
        const stageChange = tracker.inferStage('blockStart');
        if (stageChange) {
          onEvent({ type: 'progressStage', stage: stageChange });
        }
      }
      return;
    }

    if (eventType === 'content_block_delta') {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (!delta) return;
      const deltaType = delta.type as string | undefined;

      if (deltaType === 'input_json_delta') {
        tracker.appendToolInput(delta.partial_json as string ?? '');
        return;
      }
      if (deltaType === 'thinking_delta' || deltaType === 'thinking') {
        const text = (delta.thinking as string) ?? '';
        tracker.appendThinkingBuffer(text);
        onEvent({ type: 'thinkingDelta', text });
        return;
      }
      if (deltaType === 'text_delta' || deltaType === 'text') {
        const text = (delta.text as string) ?? '';
        tracker.markTextEmitted();
        onEvent({ type: 'textDelta', text });
        return;
      }
      return;
    }

    if (eventType === 'content_block_stop') {
      const currentBlockType = tracker.getCurrentBlockType();

      if (currentBlockType === 'tool_use') {
        const currentToolName = tracker.getCurrentToolName();
        const currentToolId = tracker.getCurrentToolId();
        const toolInputBuffer = tracker.getToolInputBuffer();

        let filePath: string | undefined;
        try {
          const input = JSON.parse(toolInputBuffer) as Record<string, unknown>;
          filePath = this.extractFilePath(currentToolName, input);
        } catch {
          // Incomplete JSON — ignore
        }

        if (filePath && (currentToolName === 'Write' || currentToolName === 'Edit')) {
          tracker.touchFile(filePath);
        }

        const toolInfo = { toolName: currentToolName, toolId: currentToolId, filePath, status: 'complete' as const };
        onEvent({ type: 'toolUse', tool: toolInfo });
        const timestamped = tracker.endTool(toolInfo);
        onEvent({ type: 'toolDuration', tool: timestamped });

        const stageChange = tracker.inferStage('toolUse', currentToolName, filePath);
        if (stageChange) {
          onEvent({ type: 'progressStage', stage: stageChange });
        }

        tracker.setToolInputBuffer('');
        tracker.setCurrentBlockType(null);
        tracker.setCurrentToolName('');
        tracker.setCurrentToolId('');
        return;
      }

      if (currentBlockType === 'tool_result') {
        tracker.setCurrentBlockType(null);
        return;
      }

      const blockType = currentBlockType || 'text';
      onEvent({ type: 'blockEnd', blockType });

      if (currentBlockType === 'thinking') {
        const summary = tracker.extractThinkingSummary();
        if (summary) {
          onEvent({ type: 'thinkingSummary', summary });
        }
        tracker.resetThinkingBuffer();
      }

      tracker.setCurrentBlockType(null);
      return;
    }
  }
}
