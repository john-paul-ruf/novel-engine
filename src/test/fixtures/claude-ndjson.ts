/**
 * NDJSON fixtures matching the Claude Code CLI stream-json output that
 * ClaudeCodeClient.processStreamEvent parses (v2.1+ high-level events).
 */

type Json = Record<string, unknown>;

export const initEvent: Json = { type: 'system', subtype: 'init', session_id: 'cli-session' };

export function assistantThinking(thinking: string): Json {
  return { type: 'assistant', message: { content: [{ type: 'thinking', thinking }] } };
}

export function assistantText(text: string): Json {
  return { type: 'assistant', message: { content: [{ type: 'text', text }] } };
}

export function assistantToolUse(id: string, name: string, filePath?: string): Json {
  return {
    type: 'assistant',
    message: {
      content: [{ type: 'tool_use', id, name, input: filePath ? { file_path: filePath } : {} }],
    },
  };
}

export function toolResult(
  toolUseId: string,
  opts: { filePath?: string; isError?: boolean } = {}
): Json {
  return {
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: opts.isError ?? false }] },
    ...(opts.filePath ? { tool_use_result: { file: { filePath: opts.filePath } } } : {}),
  };
}

export function resultEvent(opts: {
  result?: string;
  inputTokens?: number;
  outputTokens?: number;
  subtype?: string;
  isError?: boolean;
}): Json {
  return {
    type: 'result',
    subtype: opts.subtype ?? 'success',
    is_error: opts.isError ?? false,
    result: opts.result ?? '',
    usage: { input_tokens: opts.inputTokens ?? 0, output_tokens: opts.outputTokens ?? 0 },
  };
}

/** Serialize events to an NDJSON string (trailing newline included). */
export function ndjson(events: Json[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}
