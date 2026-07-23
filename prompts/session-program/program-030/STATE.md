# State Tracker — Novel Engine / auto-resume-max-turns

## Program
Novel Engine

## Feature
auto-resume-max-turns

## Intent
When any provider's CLI call hits the max-turns limit (Claude CLI `error_max_turns`, Ollama/llama-server loop exhaustion), transparently auto-resume by re-spawning with the full conversation so far (including partial assistant output) plus a higher turn budget. No cap on resumes — keep going until the task finishes naturally. Applies to every provider and every feature area.

## Sessions
5 total

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Domain types: signal max-turn exhaustion in StreamEvent | M01 | done | 2026-07-23 | Added `isMaxTurns?` to `done` and `error` variants; added `maxTurnsResume` variant. `npx tsc --noEmit` passes. Domain + streamHandler tests pass. |
| 02 | Claude CLI: flag `error_max_turns` with `isMaxTurns` | M06 | done | 2026-07-23 | Set `isMaxTurns: subtype === 'error_max_turns'` on error events. Tests updated + new test for non-max error. All 19 tests pass. |
| 03 | Ollama & llama-server: flag max-turn exhaustion | M12, M13 | done | 2026-07-23 | Added `exitReason` tracker (`natural`/`context-ceiling`/`max-turns`) to both clients. `isMaxTurns: exitReason === 'max-turns'` on `done` event. Both test suites pass (26 tests total). |
| 04 | AutoTurnResumer class + composition-root wiring | M08, M09, M15 | pending | | |
| 05 | Renderer: handle `maxTurnsResume` event + integration tests | M10, M16 | pending | | |

(Status: pending | in-progress | done | blocked | skipped)

## Dependency Graph

```
SESSION-01 (domain types)
  ├── SESSION-02 (claude-cli) ──────────────┐
  ├── SESSION-03 (ollama + llama-server) ──┤
  └── SESSION-04 (AutoTurnResumer + wiring) ─┘
                                              └── SESSION-05 (renderer + tests)
```

SESSION-01 → SESSION-02, SESSION-03, SESSION-04 (all depend on the new StreamEvent fields).
SESSION-04 → SESSION-05 (renderer handler + integration tests need the full pipeline).

SESSION-02 and SESSION-03 are independent of each other and can run in parallel.

## Architecture Reference (feature-specific)

- **New StreamEvent variants:**
  - `{ type: 'error'; message: string; isMaxTurns?: boolean }` — extended
  - `{ type: 'done'; ...; isMaxTurns?: boolean }` — extended
  - `{ type: 'maxTurnsResume'; attempt: number; newMaxTurns: number }` — new
- **New module:** `AutoTurnResumer` in `src/application/` — implements `IProviderRegistry`, wraps the real registry, intercepts max-turn terminal events, re-spawns transparently.
- **Wiring change:** Composition root (`src/main/index.ts`) wraps `ProviderRegistry` in `AutoTurnResumer` before injecting into services.
- **Provider behavior change:** `ClaudeCodeClient`, `OllamaCodeClient`, `LlamaServerClient` set `isMaxTurns: true` on their terminal event when the turn limit is the exit reason.
- Full architecture config: `FORGE-CONFIG.md` (project root).

## Scope Summary

| Module | Files | Change |
|--------|-------|--------|
| M01 domain | `src/domain/types.ts` | Add `isMaxTurns` to `error`/`done` variants; add `maxTurnsResume` variant |
| M06 claude-cli | `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Set `isMaxTurns: true` on `error_max_turns` result events |
| M12 ollama-cli | `src/infrastructure/ollama-cli/OllamaCodeClient.ts` | Track exit reason; set `isMaxTurns: true` on `done` when loop exhausted at maxTurns |
| M13 llama-server | `src/infrastructure/llama-server/LlamaServerClient.ts` | Same as Ollama |
| M08 application | `src/application/AutoTurnResumer.ts` (new), `src/application/index.ts` | New decorator class implementing `IProviderRegistry` |
| M15 providers | — | No code change (ProviderRegistry stays as-is; wrapper is in application layer) |
| M09 main/ipc | `src/main/index.ts` | Wrap `ProviderRegistry` in `AutoTurnResumer` before passing to services |
| M10 renderer | `src/renderer/stores/streamHandler.ts` | Handle `maxTurnsResume` event type |
| M16 test | Various test files | Co-located tests for all changed files |

## Design Decisions

1. **Centralized wrapper over per-provider changes** — Rather than adding resume logic
   to each provider (Claude, Ollama, Llama, OpenAI), a single `AutoTurnResumer` class wraps
   the `IProviderRegistry` and intercepts max-turn terminal events. All 18+ call sites
   benefit without individual modifications.

2. **Providers signal, wrapper acts** — Providers set `isMaxTurns: true` on their
   terminal `error`/`done` event when the turn limit is the exit reason. The
   `AutoTurnResumer` detects this, suppresses the terminal event, and re-spawns.
   This keeps the signal close to the detection point and the orchestration centralized.

3. **Application layer, not infrastructure** — `AutoTurnResumer` lives in
   `src/application/` (orchestration layer) and implements `IProviderRegistry`.
   The composition root wraps the real `ProviderRegistry` before injecting it into
   services. This respects the DOMAIN ← INFRA ← APP ← IPC ← RENDERER layering.

4. **No resume cap (per user request)** — The auto-resume loop has no maximum attempt
   count. If the model keeps exhausting turns, it keeps getting resumed. A configurable
   cap can be added later if needed (not in this feature).

5. **Token/file accumulation across attempts** — The AutoTurnResumer accumulates
   `inputTokens`, `outputTokens`, `thinkingTokens`, and `filesTouched` across all
   resume attempts and emits a single merged `done` event at the end. Intermediate
   `done`/`error` events are suppressed (never forwarded to the caller).

6. **Fresh sessionId per attempt** — Each re-spawn gets a new `sessionId` so the DB
   tracks each CLI process independently for orphan recovery. The `conversationId` stays
   the same across resumes so conversation context is preserved.

7. **Resume message strategy** — On resume, the AutoTurnResumer appends:
   - The partial assistant text from the truncated call as an `assistant` message
   - A `user` message: "Continue where you left off. You had more work to do."
   This gives the model full context of what it already produced.

8. **Turn budget bump: +10 per attempt** — Each resume attempt adds 10 turns to the
   budget (30 → 40 → 50 → ...). Tunable via a constant; can be made configurable later.

## Handoff Notes

### SESSION-01 — 2026-07-23

Added `isMaxTurns?: boolean` to the `done` and `error` variants of `StreamEvent`, and
added a new `maxTurnsResume` variant `{ attempt: number; newMaxTurns: number }`. Also
added JSDoc above the `StreamEvent` union documenting all three new fields.

All fields are optional, so existing code that constructs `done`/`error` events without
`isMaxTurns` still compiles. The `streamHandler.ts` switch in the renderer has no
exhaustive check, so the new `maxTurnsResume` variant is safely ignored until SESSION-05
adds a case for it.

Verification: `npx tsc --noEmit` ✅, `npx vitest run src/domain/` ✅ (39 tests),
`npx vitest run src/renderer/stores/streamHandler.test.ts` ✅ (7 tests).

### SESSION-02 — 2026-07-23

Modified `ClaudeCodeClient.processStreamEvent` to emit `isMaxTurns: subtype === 'error_max_turns'`
on the error event. Other error subtypes (`error_during_execution`, etc.) get `isMaxTurns: false`.

Tests:
- Updated the existing `error_max_turns` test to assert `isMaxTurns: true`.
- Added a new test for `error_during_execution` asserting `isMaxTurns: false`.

Verification: `npx tsc --noEmit` ✅, `npx vitest run ClaudeCodeClient.test.ts` ✅ (19 tests).

### SESSION-03 — 2026-07-23

Both `OllamaCodeClient` and `LlamaServerClient` now track an `exitReason` variable
(default `'max-turns'`) before the agent loop. On the context-ceiling break path,
`exitReason` is set to `'context-ceiling'`. On natural completion (no tool calls),
`exitReason` is set to `'natural'`. After the loop, the `done` event carries
`isMaxTurns: exitReason === 'max-turns'`.

The catch-block `done` events (AbortError path) do NOT set `isMaxTurns` — those are
user-initiated aborts, not max-turn exhaustion.

Tests updated:
- Ollama: maxTurns test asserts `isMaxTurns: true`; happy-path test asserts `isMaxTurns: false`.
- Llama: maxTurns test asserts `isMaxTurns: true`; happy-path test asserts `isMaxTurns: false`.

Verification: `npx tsc --noEmit` ✅, `npx vitest run OllamaCodeClient.test.ts LlamaServerClient.test.ts` ✅ (26 tests).