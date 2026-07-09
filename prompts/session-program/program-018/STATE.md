# State Tracker — Novel Engine / codex-stream-error-hardening

## Program
Novel Engine

## Feature
codex-stream-error-hardening

## Intent
Fix the Codex CLI provider so 0.27.0-envelope events are parsed (text/status/usage/errors),
real stream-failure reasons reach the user instead of a diagnostic dump, and fully-empty
transient stream failures are retried automatically with bounded backoff.

## Sessions
3

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Unwrap the Codex 0.27.0 `msg` envelope (text, status, usage) | M11 | done | 2026-07-09 | Built per spec; envelope + echo-line shapes confirmed against live codex-cli 0.27.0 |
| 02 | Surface real Codex errors (stream_error vs terminal error) | M11 | done | 2026-07-09 | Built per spec; only 3 `buildCodexExitMessage` call sites exist (spec said 4) — all updated |
| 03 | Bounded retry on transient stream failure | M01, M11 | done | 2026-07-09 | Built per spec; attempt-level error events withheld so give-up emits exactly one |

(Status: pending | in-progress | done | blocked | skipped)

## Dependency Graph

```
SESSION-01 ──> SESSION-02 ──> SESSION-03
```

Strictly sequential — all three touch `CodexCliClient.ts`; 02 uses 01's `unwrapCodexEvent()`;
03's retry classification consumes 02's `lastStreamErrorMessage`.

## Architecture Reference (feature-specific)

- All parsing/retry logic stays in `M11` (`src/infrastructure/codex-cli/CodexCliClient.ts`).
- New constants (`CODEX_STREAM_RETRY_MAX`, `CODEX_STREAM_RETRY_DELAY_MS`) go in `M01`
  (`src/domain/constants.ts`) — infrastructure imports domain, never the reverse.
- No `StreamEvent` union changes: transient stream errors ride the existing `status` event;
  terminal failures ride the existing `error` event.
- `ChatService`/`PipelineService` (M08) remain untouched — retry is a provider concern.
- Full config: `FORGE-CONFIG.md` at project root (module M11 registered there).

## Scope Summary

| Module | Files | Nature of change |
|--------|-------|------------------|
| M11 codex-cli | `src/infrastructure/codex-cli/CodexCliClient.ts` | Envelope unwrapping, error classification, retry loop, abort tracking |
| M01 domain | `src/domain/constants.ts` | Two new retry constants (additive) |

## Design Decisions

1. **Unwrap, don't version-detect.** Candidate iteration (`event`, `event.msg`, `event.event`,
   `event.data`) handles 0.27.0 and newer flat protocols with one code path — no CLI version
   sniffing. Rationale: `summarizeCodexEvent()` already proved the pattern.
2. **`stream_error` is transient, `error` is terminal.** Transient → `status` event + recorded
   message; terminal → `error` event + rejection. Rationale: the CLI retries streams internally;
   emitting `error` per blip would spam the UI and break runs that recover.
3. **Retry only fully-empty failures.** If any text streamed or any file was touched, never
   respawn. Rationale: `codex exec` has no session resume; a respawn replays the whole prompt
   and could double-write chapter files in the book workspace.
4. **Retry lives in the provider (M11), not ChatService (M08).** Rationale: transport failure
   semantics are codex-specific; the application layer stays provider-agnostic.
5. **Linear backoff 2s/4s, max 2 retries.** Rationale: matches the lightweight
   `MULTI_CALL_MAX_RETRIES` precedent; long waits belong to the CLI's own internal retry.

## Handoff Notes

(Agents append here after each session: what was done, deviations from the session spec,
final signatures of `CodexParseState` / `CodexAttemptOutcome`, anything the next session
must know.)

### SESSION-01 (2026-07-09)

**Built:** `unwrapCodexEvent()` (next to `getNestedRecord()`); envelope-aware
`extractText()` / `extractStatus()` / `extractUsage()`; `summarizeCodexEvent()` refactored
onto the helper and now labels type-less lines as `prompt-echo` / `config-echo`;
`processOutputLine()` defers `done` for non-terminal usage; the `!doneEmitted` close
fallback prefers `parseState.pendingUsage` over `CHARS_PER_TOKEN` estimates.

**Final signatures (file-local, bottom of `CodexCliClient.ts`):**
```typescript
type CodexUsage = { inputTokens: number; outputTokens: number; thinkingTokens: number };
type CodexParseState = { deltaTextSeen: boolean; pendingUsage: CodexUsage | null };
```
`extractText(event, parseState)`; `extractUsage(event, parseState)` returns
`{ usage: CodexUsage; terminal: boolean } | null` (helper `readUsageFields(record)`).
`processOutputLine(..., workspaceCwd, parseState)` — `parseState` is the new 7th param,
created once per `sendMessage()` call.

**Runtime observations (live codex-cli 0.27.0, this machine):** envelope
`{"id":"0","msg":{...}}`, config-echo line (`approval/model/workdir/provider/sandbox` keys),
`{"prompt":...}` echo, and `task_started` all confirmed. Both `gpt-5` and `gpt-5-codex`
are rejected by this ChatGPT account on 0.27.0 with
`stream_error` ×5 (internal retries) → terminal `msg.type === 'error'` — exactly the
sequence SESSION-02/03 classify, and very likely the user's original failure. Observed
lines match SESSION-02's expected shapes verbatim.

**Warnings (out of scope, not fixed):**
- Pre-existing behavior: the close handler emits the `--output-last-message` fallback text
  before checking `doneEmitted`, so a `task_complete`-emitted `done` can now precede that
  fallback text in the rare no-`agent_message` case. Harmless today (text only emitted when
  `outputTextLength === 0`), noting for awareness.
- Found program-017 (codex-file-only-completion, sessions 01+02) complete but uncommitted
  in the working tree; committed it separately as `6849254` before this session's commit so
  SESSION-01's diff stays honest.
- Unrelated dirty worktree files left untouched: `.DS_Store`, edits to
  `prompts/session-program/program-002|003|014` files.

### SESSION-02 (2026-07-09)

**Built:** `extractStreamError()` (transient, returns message or `''`); `extractError()`
rewritten envelope-aware and skips `type === 'stream_error'`; `processOutputLine()` checks
stream errors first and emits `status` `"Model stream error (Codex retrying): <msg>"`;
`CodexLineResult.streamErrorMessage?: string` added; `buildCodexExitMessage()` gained
`lastStreamErrorMessage: string` and appends `streamError=<msg>` after `lastStatus`.

**How `lastStreamErrorMessage` is exposed (for SESSION-03):** closure `let` in
`sendMessage()` (declared next to `lastStatusMessage`), populated by `applyLineResult()`
from `result.streamErrorMessage`. Empty-output exit-0 summary is
`Codex CLI stream failed after retries: <msg>` when set (and no `terminalErrorMessage`);
nonzero-exit preference order is `terminalErrorMessage` → `lastStreamErrorMessage` → generic.

**Deviation:** spec said "all four `buildCodexExitMessage` call sites" — only three exist
(exit-0 terminal-error, exit-0 empty-output, nonzero-exit); all three pass the new param.

**Desk-check:** incident trace `task_started > stream_error ×5 > error` (exit 0) →
5 retry `status` events, terminal envelope error sets `terminalErrorMessage`, rejection
begins `Codex CLI reported an error: <real reason>`. Matches live 0.27.0 lines captured
in SESSION-01's runtime observation.

### SESSION-03 (2026-07-09) — program complete

**Built:** `CODEX_STREAM_RETRY_MAX` / `CODEX_STREAM_RETRY_DELAY_MS` in M01;
`sendMessage()` restructured into retry loop + `runCodexAttempt(options)`;
`private abortedStreams: Set<string>`; `private delay(ms)`.

**Final `CodexAttemptOutcome` shape (file-local, bottom of `CodexCliClient.ts`):**
```typescript
type CodexAttemptOutcome =
  | { kind: 'success' }
  | { kind: 'failure'; message: string; retryable: boolean };
```
`runCodexAttempt(options)` takes `{ model, prompt, bookSlug?, conversationId,
workspacePlan, tracker, wrappedOnEvent, flushBatch, isDoneEmitted }`. Per-call state
(tracker sequence, event batching, `doneEmitted`, workspace plan) stays in `sendMessage()`;
per-attempt state (parse state, buffers, tails, snapshot, temp dir, text-block flags)
resets each spawn.

**Design refinements (spirit of the spec, noted as minor deviations):**
1. ALL attempt-level `error` StreamEvents are withheld inside `runCodexAttempt()` (via
   `onAttemptEvent` filter), not just the close-handler ones — `processOutputLine()` emits
   a line-level `error` for terminal envelopes which would otherwise paint a banner before
   a successful retry. The give-up path in `sendMessage()` emits exactly one `error`.
   Non-retryable failures therefore also surface their single error at give-up (loop exits
   immediately for them, so timing is equivalent).
2. `abortStream()` adds to `abortedStreams` *before* the live-process lookup (spec said
   "before killing") — otherwise a Stop during backoff (no live process, early return)
   would never set the flag and the pending re-spawn would proceed.

**Whole-feature summary (for Final Report):** M11 now parses the 0.27.0 envelope
(text/status/usage), classifies `stream_error` (transient → status) vs `error` (terminal →
real reason in the rejection), and re-spawns fully-empty transient failures up to 2× with
2s/4s backoff, one terminal error event, abort-safe. M01 gained two additive constants.
`npx tsc --noEmit` clean after every session. Runtime note: this machine's ChatGPT account
rejects `gpt-5`/`gpt-5-codex` on codex-cli 0.27.0 (400 → stream_error ×5 → error) — likely
the user's original failure; upgrading the global CLI is strongly recommended.
