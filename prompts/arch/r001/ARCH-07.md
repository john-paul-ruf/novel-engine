# ARCH-07 — Extract HotTakeService from ChatService

> **Issue:** #1 (ChatService is a god object — 1,218 lines)
> **Severity:** High
> **Effort:** Low-Medium
> **Depends on:** ARCH-03 (interfaces), ARCH-04 (StreamManager)

---

## Objective

Extract `handleHotTake()` from ChatService into a new `HotTakeService`. The hot take flow always uses Opus, does a cold read, and writes no files — distinct from general pipeline chat.

---

## What Moves

| Method | Lines | Purpose |
|--------|-------|---------|
| `handleHotTake()` | ~110 | Ghostlight hot take: full manuscript cold read, gut reaction |

---

## Implementation Steps

### 1. Define IHotTakeService in `src/domain/interfaces.ts`

Single method: `handleMessage(params)`. Read the actual parameter shape from ChatService lines 510–519.

### 2. Create `src/application/HotTakeService.ts`

Dependencies: `IClaudeClient`, `IDatabaseService`, `IFileSystemService`, `IUsageService`, `StreamManager`.

Key specifics:
- Always uses `HOT_TAKE_MODEL` (Opus) regardless of global settings
- Appends `HOT_TAKE_INSTRUCTIONS` to system prompt (or loads from file if ARCH-01 has run)
- Builds chapter listing from project manifest
- Synthetic first message: "Read the full manuscript and give me your honest reaction."
- Uses `AGENT_REGISTRY.Ghostlight.maxTurns`

### 3. Update ChatService

- Remove `handleHotTake()`
- Add `private hotTake: IHotTakeService` to constructor
- Delegate in `sendMessage()`

### 4. Update main/index.ts

Wire HotTakeService and inject into ChatService.

---

## Verification

1. `npx tsc --noEmit` passes
2. `src/application/HotTakeService.ts` exists
3. `IHotTakeService` exists in `interfaces.ts`
4. `grep 'handleHotTake' src/application/ChatService.ts` returns zero hits

---

## State Update

After completing this prompt, update `prompts/arch/STATE.md`:
- Set ARCH-07 status to `done`
- Set Completed date
