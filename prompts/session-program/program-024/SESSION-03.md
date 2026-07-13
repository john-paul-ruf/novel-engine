# SESSION-03 — Reliable filesTouched Tracking in Claude CLI Client

> **Program:** Novel Engine
> **Feature:** query-tracker-parse-resilience
> **Modules:** M06 (claude-cli)
> **Depends on:** none (parallel-safe with SESSION-01/02)
> **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M06 | claude-cli | `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Event parsing, `touchFile` call sites |
| M06 | claude-cli | `src/infrastructure/claude-cli/StreamSessionTracker.ts` | `touchFile`, `currentToolName`/`currentToolId` state |

## Context

In the bug run, the agent successfully wrote `source/query-tracker.md` via the Write
tool, yet `doneEvent.filesTouched` was empty — which made ChatService believe no files
were written and fire the post-stream extraction fallback (see `input-files/bug-report.md`).

Two defects in `ClaudeCodeClient.ts`:

1. **NDJSON path (`eventType === 'user'`, ~line 612):** `touchFile` fires only when the
   `tool_result` carries `event.tool_use_result.file.filePath` metadata (~line 627–633).
   Some CLI versions/tools omit that metadata. Meanwhile the `tool_use` handler
   (~line 580–604) ALREADY extracts the path from the tool input via
   `this.extractFilePath(toolName, input)` (line 584) — but never records it.
2. **Single-slot tool state:** `tracker.setCurrentToolName/Id` (~line 602–603) holds only
   the LAST tool of an assistant message. With parallel tool calls, earlier Write/Edit
   results are matched against the wrong tool name and their paths are lost.

The raw-streaming fallback path (`content_block_stop`, ~line 742–776) already touches
from parsed input — use it as the reference behavior.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/infrastructure/claude-cli/StreamSessionTracker.ts` | Modify | Add `toolId → {toolName, filePath}` map |
| `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Modify | Record tool meta at `tool_use`; resolve by `tool_use_id` at `tool_result` |

## Implementation

### 1. Add a pending-tool map to `StreamSessionTracker.ts`

Read the class first. Alongside the existing `currentToolName`/`currentToolId` state
(keep them — the raw-streaming path and stage inference still use them), add:

```typescript
private pendingTools = new Map<string, { toolName: string; filePath?: string }>();

registerTool(toolId: string, toolName: string, filePath?: string): void {
  if (toolId) this.pendingTools.set(toolId, { toolName, filePath });
}

resolveTool(toolId: string): { toolName: string; filePath?: string } | undefined {
  const meta = this.pendingTools.get(toolId);
  if (meta) this.pendingTools.delete(toolId);
  return meta;
}
```

### 2. Record at `tool_use` in `ClaudeCodeClient.ts` (~line 580–604)

After `const filePath = this.extractFilePath(toolName, input);` add:

```typescript
tracker.registerTool(toolId, toolName, filePath);
```

Keep the existing `setCurrentToolName/Id` calls for backward compatibility.

### 3. Resolve at `tool_result` (~line 619–659)

Replace the current-tool-slot lookup with map resolution, falling back to the old
behavior when the map has no entry:

```typescript
const toolUseId = block.tool_use_id as string ?? tracker.getCurrentToolId();
const registered = tracker.resolveTool(toolUseId);
const currentToolName = registered?.toolName ?? tracker.getCurrentToolName();

// Prefer result metadata path; fall back to the path captured from tool input
const toolResultMeta = event.tool_use_result as Record<string, unknown> | undefined;
const fileMeta = toolResultMeta?.file as Record<string, unknown> | undefined;
const filePath = (fileMeta?.filePath as string | undefined) ?? registered?.filePath;

if (filePath && (currentToolName === 'Write' || currentToolName === 'Edit')) {
  tracker.touchFile(filePath);
}
```

Important: touch on RESULT (not at tool start) so a rejected/failed tool call is not
counted as a written file. Check whether the `tool_result` block has an `is_error`
flag — if `block.is_error === true`, skip `touchFile` but still emit the toolUse
complete event. Leave the rest of the handler (toolInfo, endTool, inferStage, state
clearing) intact, using the resolved `currentToolName`.

### 4. Sanity-check other providers (read-only)

`CodexCliClient.ts` (~lines 524, 689), `OllamaCodeClient.ts` (~482), and
`LlamaServerClient.ts` (~377) touch from their own event shapes — do NOT modify them;
just confirm they are unaffected by the `StreamSessionTracker` additions
(new methods are additive; constructor signature unchanged).

## Verification

1. `npx tsc --noEmit` — clean.
2. Manual run: `npm start`, open a book, run any pipeline phase where the agent writes a
   file with Claude CLI. Confirm the log line `[ChatService] Post-stream extraction:`
   does NOT appear when a file was actually written, and the done event lists the file.
3. Architecture compliance: all changes inside M06; no imports beyond domain/Node builtins.

## State Update

Update `prompts/session-program/program-024/STATE.md`: set SESSION-03 to `done`, add
completion date, note in Handoff Notes whether `is_error` exists on tool_result blocks
in the CLI's NDJSON (affects failed-write filtering).
