# ARCH-06 — Extract PitchRoomService from ChatService

> **Issue:** #1 (ChatService is a god object — 1,218 lines)
> **Severity:** High
> **Effort:** Medium
> **Depends on:** ARCH-03 (interfaces), ARCH-04 (StreamManager)

---

## Objective

Extract `handlePitchRoomMessage()` from ChatService into a new `PitchRoomService`. The pitch room has unique concerns: custom working directory, author profile loading, books path injection for scaffolding.

---

## What Moves

| Method | Lines | Purpose |
|--------|-------|---------|
| `handlePitchRoomMessage()` | ~140 | Pitch room conversation with Spark agent |

---

## Implementation Steps

### 1. Define IPitchRoomService in `src/domain/interfaces.ts`

Single method: `handleMessage(params)`. Read the actual parameter shape from ChatService lines 1081–1091.

### 2. Create `src/application/PitchRoomService.ts`

Dependencies: `IAgentService`, `IClaudeClient`, `IDatabaseService`, `IFileSystemService`, `IUsageService`, `StreamManager`.

Key specifics to preserve:
- Loads author profile from disk via dynamic `import('node:fs/promises')`
- Builds system prompt with `buildPitchRoomInstructions(booksPath)` or loads template if ARCH-01 has run
- Uses `fs.getPitchDraftPath(conversationId)` as working directory
- Creates draft directory with `mkdir({ recursive: true })`
- Uses `AGENT_REGISTRY.Spark.maxTurns`

### 3. Update ChatService

- Remove `handlePitchRoomMessage()`
- Add `private pitchRoom: IPitchRoomService` to constructor
- Delegate in `sendMessage()`:
  ```typescript
  if (conversation?.purpose === 'pitch-room') {
    await this.pitchRoom.handleMessage({ ... });
    return;
  }
  ```

### 4. Update main/index.ts

Wire PitchRoomService and inject into ChatService.

---

## Verification

1. `npx tsc --noEmit` passes
2. `src/application/PitchRoomService.ts` exists
3. `IPitchRoomService` exists in `interfaces.ts`
4. `grep 'handlePitchRoomMessage' src/application/ChatService.ts` returns zero hits

---

## State Update

After completing this prompt, update `prompts/arch/STATE.md`:
- Set ARCH-06 status to `done`
- Set Completed date
