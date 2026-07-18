/**
 * Fixtures matching the `codex exec --json` output that CodexCliClient parses.
 * Codex 0.27.0 wraps payloads as {"id":"0","msg":{...}} — wrap() mirrors that.
 */

type Json = Record<string, unknown>;

/** Wrap a payload in the 0.27.0 envelope. */
export function wrap(msg: Json): Json {
  return { id: '0', msg };
}

export function agentDelta(delta: string): Json {
  return wrap({ type: 'agent_message_delta', delta });
}

export function agentMessage(message: string): Json {
  return wrap({ type: 'agent_message', message });
}

export function tokenCount(inputTokens: number, outputTokens: number): Json {
  return wrap({ type: 'token_count', input_tokens: inputTokens, output_tokens: outputTokens });
}

export function turnCompleted(opts: {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
}): Json {
  return wrap({
    type: 'turn.completed',
    usage: {
      input_tokens: opts.inputTokens,
      output_tokens: opts.outputTokens,
      reasoning_output_tokens: opts.reasoningTokens ?? 0,
    },
  });
}

export function taskComplete(): Json {
  return wrap({ type: 'task_complete' });
}

export function streamError(message: string): Json {
  return wrap({ type: 'stream_error', message });
}

export function terminalError(message: string): Json {
  return wrap({ type: 'error', message });
}

export function fileChangeCompleted(absPath: string, kind: 'add' | 'update'): Json {
  return {
    type: 'item.completed',
    item: { type: 'file_change', id: 'fc-1', status: 'completed', changes: [{ path: absPath, kind }] },
  };
}

export function webSearchCompleted(query: string): Json {
  return {
    type: 'item.completed',
    item: { type: 'tool_call', name: 'web_search', status: 'completed', query },
  };
}

export function unknownTyped(type: string): Json {
  return wrap({ type });
}

export const configEcho: Json = { provider: 'openai', model: 'gpt-5.3-codex', sandbox: 'workspace-write' };

export function ndjson(events: Json[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}
