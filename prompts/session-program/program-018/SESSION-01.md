# SESSION-01 — Unwrap the Codex 0.27.0 `msg` Envelope (Text, Status, Usage)

> **Program:** Novel Engine
> **Feature:** codex-stream-error-hardening
> **Modules:** M11 (codex-cli)
> **Depends on:** none
> **Estimated effort:** ~30 minutes

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M11 | codex-cli | `src/infrastructure/codex-cli/CodexCliClient.ts` | All changes land here |
| M01 | domain | `src/domain/types.ts` (StreamEvent union only) | Event types emitted by the parser |

## Context

Codex CLI 0.27.0 (`codex exec --json`) wraps every event in an envelope:

```json
{"id":"0","msg":{"type":"agent_message","message":"…assistant text…"}}
{"id":"0","msg":{"type":"task_started"}}
{"id":"0","msg":{"type":"token_count","input_tokens":123,"output_tokens":456,"reasoning_output_tokens":0}}
{"id":"0","msg":{"type":"task_complete","last_agent_message":"…"}}
```

Newer CLIs emit flat events (`{"type":"turn.completed",…}`, `{"type":"item.completed","item":{…}}`).
`CodexCliClient` currently reads only **top-level** keys in `extractText()`, `extractStatus()`,
and `extractUsage()`, so with 0.27.0 assistant text is never streamed (it only survives via the
`--output-last-message` fallback file) and usage is never captured. `summarizeCodexEvent()`
(line ~653) already demonstrates the correct unwrap pattern — reuse it.

This session makes text/status/usage extraction envelope-aware. Error handling is SESSION-02.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/infrastructure/codex-cli/CodexCliClient.ts` | Modify | Add `unwrapCodexEvent()` helper; rewrite `extractText()`, `extractStatus()`, `extractUsage()` to iterate candidates; defer `done` for 0.27.0 `token_count`/`task_complete`; label config/prompt echo lines in `summarizeCodexEvent()` |

## Implementation

Read `CodexCliClient.ts` fully before editing. Key landmarks (line numbers approximate):
`sendMessage()` ~187, `processOutputLine()` ~535, `summarizeCodexEvent()` ~653,
`extractText()` ~832, `extractUsage()` ~854, `extractStatus()` ~891, `looksLikeAssistantText()` ~898.

### 1. Add the unwrap helper

Place next to `getNestedRecord()`:

```typescript
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
```

Refactor `summarizeCodexEvent()` to build its candidate list via this helper (behavior unchanged).

### 2. Make `extractText()` envelope-aware

Iterate `this.unwrapCodexEvent(event)`; run the existing per-record logic (direct
`text`/`delta`/`message` guarded by `looksLikeAssistantText(candidate)`, then `item`, then
`content[]`) against each candidate; return the first non-empty result. The existing
`looksLikeAssistantText()` already matches `agent_message` and `*_delta` types — no change needed there.

**Duplicate-text guard:** if the CLI streams `agent_message_delta` events and then a final full
`agent_message`, naive extraction emits the text twice. Add a per-call mutable parse state and
thread it through:

```typescript
type CodexParseState = { deltaTextSeen: boolean };
```

- Create `const parseState: CodexParseState = { deltaTextSeen: false };` inside `sendMessage()`
  and pass it to every `processOutputLine()` call (both the `data` handler and the `close` handler flush).
- In `extractText(event, parseState)`: when a candidate's `type` includes `delta` and text is
  returned, set `parseState.deltaTextSeen = true`. When a candidate's `type` is exactly
  `agent_message` and `parseState.deltaTextSeen` is `true`, skip that candidate (deltas already
  carried the content); reset `deltaTextSeen = false` after skipping.

### 3. Make `extractStatus()` envelope-aware

Iterate candidates; return the first candidate's status using the existing logic
(`type` present and not `looksLikeAssistantText(candidate)`). Exclude `stream_error` /
`error` types here — SESSION-02 gives them dedicated handling; for this session simply
`continue` past candidates whose lowercased `type` contains `error`.

### 4. Capture 0.27.0 usage without ending the turn early

Replace the `extractUsage()` contract:

```typescript
private extractUsage(event: Record<string, unknown>):
  | { usage: { inputTokens: number; outputTokens: number; thinkingTokens: number }; terminal: boolean }
  | null
```

- `type === 'turn.completed'` (any candidate): read `usage.input_tokens` / `output_tokens` /
  `reasoning_output_tokens` as today → `terminal: true`.
- `type === 'token_count'` (any candidate): read the same three fields directly off the candidate,
  falling back to `info.total_token_usage` / `info.last_token_usage` nested records if the direct
  fields are absent → `terminal: false` (0.27.0 can emit `token_count` mid-task; emitting `done`
  there would end the UI turn while the process keeps running).
- `type === 'task_complete'` (any candidate): terminal — emit `done` using the last recorded
  non-terminal usage (see below) or zeros.

In `processOutputLine()` / `sendMessage()`:

- Extend the parse state: `type CodexParseState = { deltaTextSeen: boolean; pendingUsage: { inputTokens: number; outputTokens: number; thinkingTokens: number } | null }`.
- Non-terminal usage → store in `parseState.pendingUsage`, do **not** emit `done`.
- Terminal usage → emit the existing `done` event using the terminal usage values, or
  `parseState.pendingUsage` for `task_complete`, or zeros. Keep `emittedUsageDone: true` in the
  returned `CodexLineResult` only for the terminal case.
- The existing `close`-handler fallbacks (~lines 442–499) already synthesize `done` when none was
  emitted — leave them; improvement: in the `!doneEmitted` fallback at ~line 485, prefer
  `parseState.pendingUsage` over the `CHARS_PER_TOKEN` estimate when it is non-null.

### 5. Label the config/prompt echo lines

In `summarizeCodexEvent()`, before falling through to `unknown{…}`: if the record has no `type`
but has a `prompt` key → return `'prompt-echo'`; if it has ≥2 of
`provider` / `model` / `sandbox` / `workdir` / `approval` → return `'config-echo'`.
This turns the leading `unknown{reasoning summaries,workdir,…} > unknown{prompt}` diagnostic
noise into `config-echo > prompt-echo`.

## Verification

1. `npx tsc --noEmit` — zero errors.
2. Grep checks: `unwrapCodexEvent` referenced by `summarizeCodexEvent`, `extractText`,
   `extractStatus`, `extractUsage`; no remaining top-level-only reads in those four methods.
3. Architecture compliance: no new imports beyond `@domain/*`; no renderer/application imports;
   `CodexParseState` stays file-local (not exported from `index.ts`).
4. Manual (if `codex` CLI is installed): `npm start`, select Codex provider, send a short chat
   message — assistant text must stream as `textDelta` events (visible incrementally in the UI),
   not appear only after process exit via the fallback file.

## State Update

In `prompts/session-program/program-018/STATE.md`: set SESSION-01 to `done`, record date,
note any deviation (e.g. actual 0.27.0 `token_count` shape observed), and add a Handoff Note
naming the final signature of `CodexParseState` for SESSION-02/03.
