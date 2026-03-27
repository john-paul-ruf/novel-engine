# FIX-03 — lastDiagnostics Singleton Race — Key by conversationId

> **Issue(s):** 5.1
> **Severity:** 🟠 High
> **Category:** Race Condition
> **Effort:** Low
> **Depends on:** Nothing

---

## Objective

`ChatService.lastDiagnostics` is a single field. When multiple CLI calls run concurrently (main chat + auto-draft + hot take), each `sendMessage()` overwrites `this.lastDiagnostics`. The `context:getLastDiagnostics` IPC handler returns whichever was written last, which may be diagnostics from the wrong call.

The fix replaces the singleton with a `Map<string, ContextDiagnostics>` keyed by `conversationId`, with pruning to prevent unbounded growth.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 5.1 | lastDiagnostics Is a Singleton — Concurrent Calls Overwrite | 🟠 High |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/application/ChatService.ts` | Modify | Replace `lastDiagnostics` field with a Map; update write and read methods |
| `src/main/ipc/handlers.ts` | Modify | Pass `conversationId` to `getLastDiagnostics()` |
| `src/domain/interfaces.ts` | Modify | Update `IChatService.getLastDiagnostics` signature to accept `conversationId` |
| `src/preload/index.ts` | Modify | Update bridge method signature if needed |
| `src/renderer/stores/cliActivityStore.ts` | Modify | Pass `conversationId` when calling `loadDiagnostics()` |

---

## Implementation Steps

### 1. Read affected files

Read `src/application/ChatService.ts`, `src/domain/interfaces.ts`, `src/main/ipc/handlers.ts`, `src/preload/index.ts`, and `src/renderer/stores/cliActivityStore.ts`.

### 2. Update the ChatService field

In `ChatService`, replace:

```typescript
private lastDiagnostics: ContextDiagnostics | null = null;
```

With:

```typescript
private diagnosticsMap: Map<string, ContextDiagnostics> = new Map();
private static readonly MAX_DIAGNOSTICS_ENTRIES = 20;
```

### 3. Update the write site

Where `this.lastDiagnostics = assembled.diagnostics;` is set (around line 248), replace with:

```typescript
this.diagnosticsMap.set(conversationId, assembled.diagnostics);

// Prune old entries to prevent unbounded growth
if (this.diagnosticsMap.size > ChatService.MAX_DIAGNOSTICS_ENTRIES) {
  const oldest = this.diagnosticsMap.keys().next().value;
  if (oldest) this.diagnosticsMap.delete(oldest);
}
```

### 4. Update `getLastDiagnostics()`

Change the method signature and implementation:

**Before:**
```typescript
getLastDiagnostics(): ContextDiagnostics | null {
  return this.lastDiagnostics;
}
```

**After:**
```typescript
getLastDiagnostics(conversationId?: string): ContextDiagnostics | null {
  if (conversationId) {
    return this.diagnosticsMap.get(conversationId) ?? null;
  }
  // Fallback: return the most recently added entry
  let last: ContextDiagnostics | null = null;
  for (const diag of this.diagnosticsMap.values()) {
    last = diag;
  }
  return last;
}
```

### 5. Update the interface

In `src/domain/interfaces.ts`, update `IChatService`:

```typescript
getLastDiagnostics(conversationId?: string): ContextDiagnostics | null;
```

### 6. Update the IPC handler

In `src/main/ipc/handlers.ts`, find the `context:getLastDiagnostics` handler and pass the `conversationId` argument:

```typescript
ipcMain.handle('context:getLastDiagnostics', (_event, conversationId?: string) => {
  return services.chat.getLastDiagnostics(conversationId);
});
```

### 7. Update the preload bridge

If the preload bridge exposes `getLastDiagnostics`, update its signature to accept an optional `conversationId` parameter.

### 8. Update the renderer caller

In `src/renderer/stores/cliActivityStore.ts` (or wherever `loadDiagnostics` is called), pass the relevant `conversationId`:

```typescript
const diagnostics = await window.novelEngine.context.getLastDiagnostics(conversationId);
```

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `lastDiagnostics` in ChatService.ts — should no longer exist as a field (replaced by `diagnosticsMap`)
3. Grep for `diagnosticsMap` — should appear in field declaration, `sendMessage()` write, `getLastDiagnostics()` read, and pruning logic
4. The `getLastDiagnostics` method should accept an optional `conversationId` in both the interface and implementation

---

## State Update

After completing this prompt, update `prompts/arch/r003/STATE.md`:
- Set FIX-03 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
