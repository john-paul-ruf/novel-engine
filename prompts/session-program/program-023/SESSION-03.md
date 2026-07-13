# SESSION-03 — Give Query Research Enough Turns (Per-Call maxTurns Override)

> **Program:** Novel Engine
> **Feature:** query-research-failure-handling
> **Modules:** M01 (domain), M08 (application)
> **Depends on:** none (parallel-safe with SESSION-01/02)
> **Estimated effort:** 25 minutes

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M01 | domain | `src/domain/interfaces.ts` (`IChatService.sendMessage`, `IProvider.sendMessage` ~line 311) | Extend the contract |
| M08 | application | `src/application/ChatService.ts` (`sendMessage` params ~line 114, provider call ~line 432) | Thread the override |
| M08 | application | `src/application/QueryService.ts` (`researchTargets` ~line 192, `fillTargetField` ~line 223, `generateQueryLetter` ~line 97) | Consume the override |
| M01 | domain | `src/domain/constants.ts` (`AGENT_REGISTRY.Quill` ~line 62) | Context only — do NOT change |

## Context

`AGENT_REGISTRY.Quill.maxTurns` is **8**. The `researchTargets` prompt instructs the
agent to read `about.json`, `source/story-bible.md`, `source/pitch-card.md`, run
multiple WebSearches (targets 5–10 entries, each needing search + verification), and
write `source/query-tracker.md`. That is 20–40 turns of work. The CLI is spawned with
`--max-turns 8` (`ClaudeCodeClient.ts:231`), so the run is killed mid-research —
this is the direct trigger of the reported bug (exit code 1, `error_max_turns`,
empty stderr).

Raising Quill's registry-wide budget would also affect the `publish` phase and chat
usage; instead, add a **per-call override** so turn-hungry flows request what they need.
`IClaudeClient`/`IProvider.sendMessage` already accept `maxTurns?` — only
`IChatService.sendMessage` lacks the pass-through (it hardcodes `agent.maxTurns` at
`ChatService.ts:438`).

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/domain/interfaces.ts` | Modify | Add `maxTurnsOverride?: number` to `IChatService.sendMessage` params |
| `src/application/ChatService.ts` | Modify | Accept + apply the override when calling the provider |
| `src/application/QueryService.ts` | Modify | Pass overrides: research=40, fillTargetField=16, generateQueryLetter=16 |

## Implementation

### 1. Extend `IChatService.sendMessage` in `src/domain/interfaces.ts`

Find the `IChatService` interface's `sendMessage` params (mirrors
`ChatService.sendMessage` at ~line 114 — has `thinkingBudgetOverride?`). Add:

```typescript
/** Per-call turn budget. Overrides the agent's registry maxTurns —
 *  used by turn-hungry pipeline flows (e.g. web research). */
maxTurnsOverride?: number;
```

### 2. Apply it in `src/application/ChatService.ts`

- Add `maxTurnsOverride?: number;` to the `sendMessage` params type (~line 114).
- At the provider call (~line 432–443), replace:

```typescript
maxTurns: agent.maxTurns,
```

with:

```typescript
maxTurns: params.maxTurnsOverride ?? agent.maxTurns,
```

### 3. Consume it in `src/application/QueryService.ts`

Pass the override in the three `this.chat.sendMessage({...})` calls:

| Method | Call site | Override | Rationale |
|--------|-----------|----------|-----------|
| `researchTargets` | ~line 205 | `maxTurnsOverride: 40` | 3 context reads + 5–10 searches + verifications + tracker write |
| `fillTargetField` | ~line 244 | `maxTurnsOverride: 16` | 1–3 searches + 1 read + 1 edit |
| `generateQueryLetter` | ~line 118 | `maxTurnsOverride: 16` | context reads + letter write |

### 4. Check other IChatService implementers/mocks

`grep -rn "implements IChatService" src/` — if any test doubles or secondary
implementations exist, ensure the added optional param compiles everywhere (optional
params should be non-breaking).

## Verification

```bash
npx tsc --noEmit
grep -n "maxTurnsOverride" src/domain/interfaces.ts src/application/ChatService.ts src/application/QueryService.ts
```

- Architecture compliance: M08 depends only on the M01 interface change — correct flow.
- `AGENT_REGISTRY.Quill.maxTurns` remains 8 (chat + publish phases unchanged).

## State Update

Update `prompts/session-program/program-023/STATE.md`: set SESSION-03 status to `done`,
completion date, note chosen turn budgets in Handoff Notes.
