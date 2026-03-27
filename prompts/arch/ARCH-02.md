# ARCH-02 — Extract Status Messages from constants.ts

> **Issue:** #2 (constants.ts is a junk drawer — 754 lines)
> **Severity:** Medium
> **Effort:** Trivial
> **Depends on:** Nothing (can run before or after ARCH-01)

---

## Objective

Move the fun status message arrays and their helper functions from `src/domain/constants.ts` into a new file `src/domain/statusMessages.ts`. These are ~150 lines of string arrays that clutter the constants file but are genuinely domain-level (used by both application and renderer layers).

---

## What to Extract

Move these to `src/domain/statusMessages.ts`:

- `STATUS_PREPARING` array (private)
- `STATUS_WAITING` array (private)
- `STATUS_RESPONDING` array (private)
- `PITCH_ROOM_FLAVOR` array (private)
- `pickRandom()` helper (private)
- `randomPreparingStatus()` (exported)
- `randomWaitingStatus()` (exported)
- `randomRespondingStatus()` (exported)
- `randomPitchRoomFlavor()` (exported)

---

## Implementation Steps

### 1. Create `src/domain/statusMessages.ts`

Move all the arrays and functions listed above. The file should have zero imports (pure functions operating on static data).

### 2. Update `src/domain/index.ts` barrel export

Add `export * from './statusMessages';` to the domain barrel.

### 3. Update constants.ts

Remove all status message arrays and functions. Remove the `pickRandom` helper.

### 4. Update all imports

Files that import status functions from `@domain/constants` need to import from `@domain/statusMessages` instead (or from the domain barrel):

- `src/application/ChatService.ts` — imports `randomPreparingStatus`, `randomWaitingStatus`
- `src/renderer/hooks/useRotatingStatus.ts` — imports `randomRespondingStatus`
- `src/renderer/stores/chatStore.ts` — imports `randomRespondingStatus`
- `src/renderer/stores/modalChatStore.ts` — imports `randomRespondingStatus`
- `src/renderer/stores/pitchRoomStore.ts` — imports `randomRespondingStatus`
- `src/renderer/components/PitchRoom/PitchRoomView.tsx` — imports `randomPitchRoomFlavor`

Update each import to pull from `@domain/statusMessages`.

---

## Verification

1. `npx tsc --noEmit` passes
2. `grep -r 'STATUS_PREPARING\|STATUS_WAITING\|STATUS_RESPONDING\|PITCH_ROOM_FLAVOR\|pickRandom\|randomPreparingStatus\|randomWaitingStatus\|randomRespondingStatus\|randomPitchRoomFlavor' src/domain/constants.ts` returns zero hits
3. `src/domain/statusMessages.ts` exists and has zero imports
4. All consumer files compile without errors

---

## State Update

After completing this prompt, update `prompts/arch/STATE.md`:
- Set ARCH-02 status to `done`
- Set Completed date
- Note the final line count of `constants.ts` after extraction
