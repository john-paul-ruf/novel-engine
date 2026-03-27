# FIX-07 — Add Type-Safe Source Discriminator to Stream Events

> **Issue(s):** 5.8
> **Severity:** 🟡 Medium
> **Category:** Architecture
> **Effort:** Medium
> **Depends on:** Nothing

---

## Objective

The codebase uses string prefix conventions for callIds (`rev:`, `audit:`, `fix:`, `motif-audit:`, `recovered:`) to discriminate event sources. The streamHandler filters on `startsWith('rev:')` — adding a new prefix requires knowing about and updating this filter. This is fragile.

The fix adds a type-safe `source` field to the enriched stream event payload, eliminating the need to parse string prefixes for routing decisions.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 5.8 | callId Convention Inconsistency — String Prefixes | 🟡 Medium |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | Modify | Add `StreamEventSource` type and `source` field to enriched stream event |
| `src/main/ipc/handlers.ts` | Modify | Inject `source` field into `broadcastStreamEvent` calls |
| `src/renderer/stores/streamHandler.ts` | Modify | Use `source` field instead of `callId.startsWith('rev:')` for filtering |

---

## Implementation Steps

### 1. Read affected files

Read `src/domain/types.ts` (search for `StreamEvent` and `EnrichedStreamEvent`), `src/main/ipc/handlers.ts`, and `src/renderer/stores/streamHandler.ts`.

### 2. Add StreamEventSource type

In `src/domain/types.ts`, add:

```typescript
export type StreamEventSource = 'chat' | 'auto-draft' | 'hot-take' | 'adhoc-revision' | 'revision' | 'audit' | 'fix' | 'motif-audit';
```

Add `source?: StreamEventSource` to `EnrichedStreamEvent` (or wherever the callId/conversationId enrichment lives). Keep it optional for backwards compatibility — events without `source` are treated as `'chat'`.

### 3. Inject `source` in IPC handlers

In `src/main/ipc/handlers.ts`, update each `broadcastStreamEvent` call to include the `source` field:

- `chat:send` handler → `source: 'chat'`
- `hot-take:start` handler → `source: 'hot-take'`
- `adhoc-revision:start` handler → `source: 'adhoc-revision'`
- Verity audit handler → `source: 'audit'`
- Verity fix handler → `source: 'fix'`
- Motif audit handler → `source: 'motif-audit'`
- Revision queue event forwarding → `source: 'revision'`
- Auto-draft (if it has its own handler, or if it reuses `chat:send`) → `source: 'auto-draft'` or inherited from chat

Check how `broadcastStreamEvent` constructs the event object. If it spreads additional fields, adding `source` to the spread should work:

```typescript
broadcastStreamEvent({ ...event, callId, conversationId, source: 'chat' });
```

### 4. Update the streamHandler filter

In `src/renderer/stores/streamHandler.ts`, replace:

```typescript
if (callId && callId.startsWith('rev:')) return;
```

With:

```typescript
if (enriched.source === 'revision') return;
// Fallback for backwards compatibility (e.g., events from before this change)
if (!enriched.source && callId && callId.startsWith('rev:')) return;
```

The fallback ensures any in-flight events without `source` (e.g., during a hot reload mid-stream) are still correctly filtered.

### 5. Update cliActivityStore if it uses callId prefixes

Check `src/renderer/stores/cliActivityStore.ts` for any callId prefix parsing. If it uses prefixes to determine event source for display purposes, migrate those to use `enriched.source` as well.

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `StreamEventSource` in types.ts — should exist with all source variants
3. Grep for `source:` in handlers.ts — each broadcast site should inject the correct source
4. Grep for `startsWith('rev:')` in streamHandler.ts — should have the `enriched.source` check as the primary guard, with the string check as fallback only
5. All existing callId prefix conventions continue to work (backwards compatible)

---

## State Update

After completing this prompt, update `prompts/arch/r003/STATE.md`:
- Set FIX-07 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
