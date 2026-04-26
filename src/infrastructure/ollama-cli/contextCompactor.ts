import { CHARS_PER_TOKEN, MAX_CALL_CONTEXT_TOKENS } from '@domain/constants';

/**
 * Estimate the token count of a message array (Ollama or OpenAI format).
 *
 * Uses the same chars-per-token heuristic as TokenEstimator.
 * Counts all string content in messages (role, content, tool_call arguments, etc.).
 */
export function estimateMessageTokens(
  messages: { role: string; content?: string | null; tool_calls?: unknown[] }[],
): number {
  let totalChars = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length;
    }
    if (Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        const call = tc as { function?: { arguments?: unknown } };
        if (call.function?.arguments) {
          const args = typeof call.function.arguments === 'string'
            ? call.function.arguments
            : JSON.stringify(call.function.arguments);
          totalChars += args.length;
        }
      }
    }
  }
  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

/**
 * Compact a tool-loop conversation to stay under MAX_CALL_CONTEXT_TOKENS.
 *
 * Trims oldest tool results first (they are typically Read results with
 * full file content). Preserves the system message, initial user message,
 * and the most recent 4 messages for continuity.
 *
 * @param messages  The mutable messages array (modified in place)
 * @param budgetTokens  Maximum token budget (defaults to MAX_CALL_CONTEXT_TOKENS)
 * @returns true if compaction occurred
 */
export function compactToolHistory(
  messages: { role: string; content?: string | null; tool_calls?: unknown[] }[],
  budgetTokens: number = MAX_CALL_CONTEXT_TOKENS,
): boolean {
  const currentTokens = estimateMessageTokens(messages);
  if (currentTokens <= budgetTokens) return false;

  const PROTECTED_HEAD = 2;
  const PROTECTED_TAIL = 4;

  if (messages.length <= PROTECTED_HEAD + PROTECTED_TAIL) {
    return false;
  }

  const compactableEnd = messages.length - PROTECTED_TAIL;
  let compacted = false;

  for (let i = PROTECTED_HEAD; i < compactableEnd; i++) {
    const msg = messages[i];

    if (msg.role === 'tool' && typeof msg.content === 'string' && msg.content.length > 200) {
      msg.content = '[content truncated to stay within context budget]';
      compacted = true;
    }

    if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.length > 2000) {
      msg.content = msg.content.slice(0, 500) + '\n\n[...truncated]';
      compacted = true;
    }

    if (compacted && estimateMessageTokens(messages) <= budgetTokens) {
      break;
    }
  }

  if (compacted) {
    const newTokens = estimateMessageTokens(messages);
    console.log(
      '[contextCompactor] Compacted: ' + currentTokens.toLocaleString() + ' -> ' +
      newTokens.toLocaleString() + ' tokens (budget: ' + budgetTokens.toLocaleString() + ')',
    );
  }

  return compacted;
}
