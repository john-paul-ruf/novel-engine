# SESSION-01 — Domain types: signal max-turn exhaustion in StreamEvent

> **Program:** Novel Engine
> **Feature:** auto-resume-max-turns
> **Modules:** M01 (domain)
> **Depends on:** none
> **Estimated effort:** 10 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M01 | domain | `src/domain/types.ts` | StreamEvent union type — add `isMaxTurns` flag + new `maxTurnsResume` variant |

## Context

The `StreamEvent` union type in `src/domain/types.ts` defines all event types
that flow from providers through the application to the renderer. Currently,
when a provider hits the `maxTurns` limit, the signal is lost:
- Claude CLI emits an `error` event with a message like "Claude CLI run failed (error_max_turns)"
- Ollama/llama-server emit a regular `done` event (no distinction from natural completion)

We need providers to **signal** max-turn exhaustion so a central wrapper can
auto-resume. This session adds an optional `isMaxTurns` flag to the `error`
and `done` variants, plus a new `maxTurnsResume` event for the wrapper to notify
the UI when a resume happens.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/domain/types.ts` | Modify | Add `isMaxTurns?: boolean` to `error` and `done` variants; add `maxTurnsResume` variant |

## Implementation

### 1. Read `src/domain/types.ts` lines 256–271

The `StreamEvent` union is:

```typescript
export type StreamEvent =
  | { type: 'callStart'; agentName: AgentName; model: string; bookSlug: string }
  | { type: 'status'; message: string }
  | { type: 'blockStart'; blockType: StreamBlockType }
  | { type: 'thinkingDelta'; text: string }
  | { type: 'textDelta'; text: string }
  | { type: 'blockEnd'; blockType: StreamBlockType }
  | { type: 'toolUse'; tool: ToolUseInfo }
  | { type: 'filesChanged'; paths: string[] }
  | { type: 'done'; inputTokens: number; outputTokens: number; thinkingTokens: number; filesTouched: FileTouchMap }
  | { type: 'progressStage'; stage: ProgressStage }
  | { type: 'thinkingSummary'; summary: ThinkingSummary }
  | { type: 'toolDuration'; tool: TimestampedToolUse }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string }
  | { type: 'multiCallProgress'; step: number; totalSteps: number; label: string };
```

### 2. Add `isMaxTurns` to `done` and `error` variants, add `maxTurnsResume`

Change the `done` line to:

```typescript
  | { type: 'done'; inputTokens: number; outputTokens: number; thinkingTokens: number; filesTouched: FileTouchMap; isMaxTurns?: boolean }
```

Change the `error` line to:

```typescript
  | { type: 'error'; message: string; isMaxTurns?: boolean }
```

Add a new `maxTurnsResume` variant after `multiCallProgress`:

```typescript
  | { type: 'maxTurnsResume'; attempt: number; newMaxTurns: number };
```

### 3. Add JSDoc above the union explaining the new fields

Insert above the `StreamEvent` type (or update if one exists) a brief
description of the new fields:

```typescript
/**
 * Stream events emitted by model providers during a `sendMessage` call.
 *
 * Terminal events:
 * - `done` — the call completed. `isMaxTurns: true` means the provider's
 *   internal turn loop exited because the turn budget was exhausted (the model
 *   was still requesting tool calls when the limit hit). A wrapper can detect
 *   this and auto-resume with a higher budget.
 * - `error` — the call failed. `isMaxTurns: true` means the failure was
 *   specifically a max-turns exhaustion (e.g. Claude CLI `error_max_turns`),
 *   not a crash or timeout. A wrapper can swallow this and auto-resume.
 *
 * `maxTurnsResume` is emitted by the auto-resume wrapper to notify the UI
 * that a re-spawn is happening (attempt number + new turn budget).
 */
```

## Verification

1. `npx tsc --noEmit` — must pass. All existing code treating `done`/`error`
   events will still compile because `isMaxTurns` is optional.
2. Run the domain tests:
   ```bash
   npx vitest run src/domain/
   ```
3. Confirm the `maxTurnsResume` variant is accessible: the `streamHandler.ts`
   switch in the renderer does not have a default case and is not exhaustive
   (it falls through silently), so adding the new variant won't cause a TS error.
   Verify by running:
   ```bash
   npx vitest run src/renderer/stores/streamHandler.test.ts
   ```
4. Full type check is sufficient — no runtime behavior changes in this session.

## State Update

Update `prompts/session-program/program-030/STATE.md`:
- SESSION-01 status → `done`, completion date
- Handoff note: confirm `isMaxTurns` added to both `done` and `error` variants,
  `maxTurnsResume` variant added, `npx tsc --noEmit` passes.