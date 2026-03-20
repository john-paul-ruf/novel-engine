import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';

import type { IClaudeClient } from '@domain/interfaces';
import type { MessageRole, StreamEvent, StreamBlockType } from '@domain/types';
import { CHARS_PER_TOKEN } from '@domain/constants';

const execFileAsync = promisify(execFile);

const CLI_NOT_FOUND_MESSAGE =
  'Claude Code CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-code';

export class ClaudeCodeClient implements IClaudeClient {
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('claude', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  async sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void> {
    const { model, systemPrompt, messages, onEvent } = params;

    // Build conversation prompt from message history
    const conversationPrompt = this.buildConversationPrompt(messages);

    // Build CLI args
    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--model', model,
      '--system-prompt', systemPrompt,
    ];

    return new Promise<void>((resolve, reject) => {
      const child = spawn('claude', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let thinkingBuffer = '';
      let currentBlockType: StreamBlockType | null = null;
      let settled = false;

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

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer
        stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            this.mapStreamEvent(event, onEvent, thinkingBuffer, currentBlockType, (tb) => {
              thinkingBuffer = tb;
            }, (bt) => {
              currentBlockType = bt;
            });
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
            this.mapStreamEvent(event, onEvent, thinkingBuffer, currentBlockType, (tb) => {
              thinkingBuffer = tb;
            }, (bt) => {
              currentBlockType = bt;
            });
          } catch {
            // Skip unparseable remainder
          }
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

  async sendOneShot(params: {
    model: string;
    systemPrompt: string;
    userMessage: string;
    maxTokens: number;
  }): Promise<string> {
    const { model, systemPrompt, userMessage } = params;

    const args = [
      '--print',
      '--output-format', 'json',
      '--model', model,
      '--system-prompt', systemPrompt,
    ];

    return new Promise<string>((resolve, reject) => {
      const child = spawn('claude', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
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
        settle(() => reject(new Error(message)));
      });

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          const message = stderrBuffer.trim() || `Claude CLI exited with code ${code}`;
          settle(() => reject(new Error(message)));
          return;
        }

        try {
          const response = JSON.parse(stdoutBuffer.trim());
          const text = this.extractOneShotText(response);
          settle(() => resolve(text));
        } catch (err) {
          settle(() => reject(new Error(
            `Failed to parse Claude CLI JSON response: ${err instanceof Error ? err.message : String(err)}`
          )));
        }
      });

      // Write user message to stdin and close
      child.stdin.write(userMessage);
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
   * Map a parsed CLI stream-json event to our StreamEvent type and emit it.
   */
  private mapStreamEvent(
    event: Record<string, unknown>,
    onEvent: (event: StreamEvent) => void,
    thinkingBuffer: string,
    currentBlockType: StreamBlockType | null,
    setThinkingBuffer: (tb: string) => void,
    setCurrentBlockType: (bt: StreamBlockType | null) => void,
  ): void {
    const subtype = event.subtype as string | undefined;
    const content = event.content as string | undefined;
    const isBlockStart = event.content_block_start === true;
    const isBlockStop = event.content_block_stop === true;
    const eventType = event.type as string;

    // Result event — final summary with token usage
    if (eventType === 'result') {
      const inputTokens = (event.input_tokens as number) || 0;
      const outputTokens = (event.output_tokens as number) || 0;
      const thinkingTokens = Math.ceil(thinkingBuffer.length / CHARS_PER_TOKEN);
      onEvent({ type: 'done', inputTokens, outputTokens, thinkingTokens });
      return;
    }

    // Block start events
    if (isBlockStart && subtype === 'thinking') {
      setCurrentBlockType('thinking');
      onEvent({ type: 'blockStart', blockType: 'thinking' });
      return;
    }

    if (isBlockStart && subtype === 'text') {
      setCurrentBlockType('text');
      onEvent({ type: 'blockStart', blockType: 'text' });
      return;
    }

    // Block stop events
    if (isBlockStop) {
      const blockType = currentBlockType || (subtype as StreamBlockType) || 'text';
      onEvent({ type: 'blockEnd', blockType });
      setCurrentBlockType(null);
      return;
    }

    // Content delta events (have content but no block start/stop flags)
    if (content !== undefined && subtype === 'thinking') {
      setThinkingBuffer(thinkingBuffer + content);
      onEvent({ type: 'thinkingDelta', text: content });
      return;
    }

    if (content !== undefined && subtype === 'text') {
      onEvent({ type: 'textDelta', text: content });
      return;
    }
  }

  /**
   * Extract text from the one-shot JSON response.
   * The `json` output format returns a single JSON object with a `result` field.
   */
  private extractOneShotText(response: Record<string, unknown>): string {
    // The response may have a `result` field containing the text
    if (typeof response.result === 'string') {
      return response.result;
    }

    // Or it may be a content array with text blocks
    if (Array.isArray(response.content)) {
      const textBlocks = (response.content as Array<Record<string, unknown>>)
        .filter((block) => block.type === 'text')
        .map((block) => block.text as string);
      if (textBlocks.length > 0) {
        return textBlocks.join('');
      }
    }

    // Fallback: if the response itself is a string-like structure
    if (typeof response.text === 'string') {
      return response.text;
    }

    throw new Error('Unable to extract text from Claude CLI response');
  }
}
