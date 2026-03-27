# FIX-04 — lastChangedFiles Singleton Race in StreamManager

> **Issue(s):** 5.2, 5.3
> **Severity:** 🟠 High
> **Category:** Race Condition
> **Effort:** Medium
> **Depends on:** Nothing

---

## Objective

`StreamManager.lastChangedFiles` is a single `string[]` shared across all concurrent streams. When multiple streams run simultaneously, each `filesChanged` event overwrites the singleton. Additionally, `resetChangedFiles()` in `sendMessage()` clears files that another in-flight stream emitted.

The fix eliminates the `lastChangedFiles` singleton entirely. Instead, each stream tracks its own changed files locally, and the IPC handler reads from the stream result.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 5.2 | lastChangedFiles Is a Singleton — Concurrent Calls Overwrite | 🟠 High |
| 2 | 5.3 | resetChangedFiles() Called Before Stream Start — Clears Other Streams' Data | 🟡 Medium |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/application/StreamManager.ts` | Modify | Remove `lastChangedFiles` field, `resetChangedFiles()`, and `getLastChangedFiles()`; track changed files per-stream |
| `src/application/ChatService.ts` | Modify | Remove `resetChangedFiles()` call; return changed files from `sendMessage()` |
| `src/main/ipc/handlers.ts` | Modify | Read changed files from the `sendMessage()` return value |

---

## Implementation Steps

### 1. Read affected files

Read `src/application/StreamManager.ts`, `src/application/ChatService.ts`, and `src/main/ipc/handlers.ts` in full.

### 2. Add per-stream changedFiles tracking

In `StreamManager.startStream()`, add a per-stream `changedFiles: string[]` array to the stream's local state (next to `responseBuffer` and `thinkingBuffer`).

In the `streamOnEvent` callback, where `filesChanged` events are handled:

**Before:**
```typescript
} else if (event.type === 'filesChanged' && trackFilesChanged) {
  this.lastChangedFiles = event.paths;
```

**After:**
```typescript
} else if (event.type === 'filesChanged' && trackFilesChanged) {
  changedFiles = event.paths;
```

Where `changedFiles` is a local `let changedFiles: string[] = [];` in `startStream()`.

### 3. Expose changedFiles via the stream handle

The `startStream()` method returns `{ onEvent, getResponseBuffer, getThinkingBuffer }`. Add a `getChangedFiles` getter:

```typescript
return {
  onEvent: streamOnEvent,
  getResponseBuffer: () => responseBuffer,
  getThinkingBuffer: () => thinkingBuffer,
  getChangedFiles: () => changedFiles,
};
```

### 4. Remove the singleton

Remove from `StreamManager`:
- `private lastChangedFiles: string[] = [];`
- `resetChangedFiles(): void`
- `getLastChangedFiles(): string[]`

### 5. Update ChatService

In `ChatService.sendMessage()`:
- Remove the `this.streamManager.resetChangedFiles();` call (line 115)
- Store the stream handle returned by `this.streamManager.startStream()`
- Change the return type from `Promise<void>` to `Promise<{ changedFiles: string[] }>`
- After the CLI call completes, return `{ changedFiles: stream.getChangedFiles() }`

**Before:**
```typescript
async sendMessage(params: { ... }): Promise<void> {
```

**After:**
```typescript
async sendMessage(params: { ... }): Promise<{ changedFiles: string[] }> {
```

At the end of `sendMessage()`, after the CLI call resolves:

```typescript
return { changedFiles: stream.getChangedFiles() };
```

### 6. Update the interface

In `src/domain/interfaces.ts`, update the `IChatService.sendMessage` return type to match:

```typescript
sendMessage(params: { ... }): Promise<{ changedFiles: string[] }>;
```

### 7. Update the IPC handler

In `handlers.ts`, the `chat:send` handler currently reads from the singleton:

```typescript
const changedFiles = services.chat.getLastChangedFiles();
```

Change to read from the return value:

```typescript
const result = await services.chat.sendMessage({ ... });
const changedFiles = result.changedFiles;
```

### 8. Clean up any remaining references

Grep for `resetChangedFiles`, `getLastChangedFiles`, and `lastChangedFiles` across the codebase. Remove or update all references.

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `lastChangedFiles` in StreamManager.ts — should not exist
3. Grep for `resetChangedFiles` across the codebase — should not exist
4. Grep for `getLastChangedFiles` — should either not exist or be refactored to per-stream semantics
5. Each stream now tracks its own changed files independently — no shared mutable state

---

## State Update

After completing this prompt, update `prompts/arch/r003/STATE.md`:
- Set FIX-04 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
