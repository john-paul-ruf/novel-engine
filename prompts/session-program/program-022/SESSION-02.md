# SESSION-02 — Codex CLI: enable standalone_web_search + parse web_search events

> **Program**: Novel Engine
> **Feature**: web-search-all-providers
> **Modules**: M05 (codex-cli)
> **Depends on**: —
> **Estimated effort**: 15 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M05 | `src/infrastructure/codex-cli/CodexCliClient.ts` | `runCodexAttempt` method (line ~317), `processOutputLine` (line ~626), `extractToolInfo` (line ~822) | Add `--enable standalone_web_search` CLI arg, parse `web_search` item events |

## Context

The Codex CLI (`codex exec`) manages its own tool arsenal — we do not pass `--allowedTools` like we do for Claude CLI. Web search is a CLI feature gated behind the `standalone_web_search` feature flag (verified via `codex features list`). When enabled with `--enable standalone_web_search`, the CLI offers its native `web_search` tool to the model. When the model decides to search, the CLI emits JSON events of type `item.started` and `item.completed` with `item.type === 'web_search'`.

Today the `CodexCliClient` ignores these events — they don't match `extractToolInfo`'s filter (which only recognizes `file_change`, `read`, `write`, `edit`, `ls`-like names). The search happens silently from the user's perspective.

This session:
1. Adds `--enable standalone_web_search` to the spawn args.
2. Teaches `extractToolInfo` (or the surrounding loop in `processOutputLine`) to recognize `web_search` items so we emit `toolUse` StreamEvents for them — no silent searches.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/infrastructure/codex-cli/CodexCliClient.ts` | Modify | Add `--enable standalone_web_search` arg, add `web_search` event parsing in `extractToolInfo` |

## Implementation

### 1. Read `src/infrastructure/codex-cli/CodexCliClient.ts` fully

Pay attention to:
- The args array at line ~387-397 (where `--json`, `--model`, `--sandbox`, `--cd`, `--skip-git-repo-check`, `--output-last-message`, `-` are built).
- The `extractToolInfo` method at line ~822-851 — what it currently matches.
- The `processOutputLine` method at line ~626-761 — where `extractToolInfo` is called (line ~680).
- The `StreamEvent` type for `toolUse` (from `src/domain/types.ts`): `{ type: 'toolUse'; tool: ToolUseInfo }` where `ToolUseInfo = { toolName, toolId, filePath?, status: 'started' | 'running' | 'complete' | 'error' }`.

### 2. Add `--enable standalone_web_search` to the spawn args

In the `runCodexAttempt` method, find the `args` array (lines ~387-397):

```typescript
const args = [
  'exec',
  '--json',
  '--model', model,
  '--sandbox', 'workspace-write',
  '--skip-git-repo-check',
  '--cd', workspacePlan.argsCwd,
  ...workspacePlan.extraArgs,
  '--output-last-message', outputLastMessagePath,
  '-',
];
```

Add `'--enable', 'standalone_web_search',` anywhere in the literal portion of the array (keep the relative order of the existing entries). Cleanest is to place it right after `'--json',`:

```typescript
const args = [
  'exec',
  '--json',
  '--enable', 'standalone_web_search',
  '--model', model,
  '--sandbox', 'workspace-write',
  '--skip-git-repo-check',
  '--cd', workspacePlan.argsCwd,
  ...workspacePlan.extraArgs,
  '--output-last-message', outputLastMessagePath,
  '-',
];
```

Do NOT gate this on a setting or a feature flag — always enable. The CLI only activates its `web_search` tool when the model decides to search (prompted by the agent prompt), so enabling globally is harmless and means Quill's research flow "just works" without configuration.

### 3. Handle `web_search` items in `extractToolInfo`

The `extractToolInfo` method (line ~822-851) does this:

```typescript
private extractToolInfo(event, workspaceCwd): { toolName; filePath?; toolId } | null {
  const item = event.item;
  if (!this.isRecord(item)) return null;
  if (!this.isCompletedCodexItem(event, item)) return null;
  // ... handles file_change + tool-like items (read/write/edit/ls)
}
```

There are two issues:
- It's gated on `isCompletedCodexItem` (only fires when event type includes `completed` or item status includes `complete`). We want to emit `toolUse` events for **both** `item.started` and `item.completed` for web_search — showing starts gives the user a "search is happening" signal while in progress.
- Even when an `item.completed` event with `type: 'web_search'` arrives, the `isToolLike` filter at line ~843 won't match `'web_search'` (it only checks for `read`/`write`/`edit`/`ls` substrings). So today these events are silently dropped.

**Solution**: Add a dedicated web_search handler BEFORE the `isCompletedCodexItem` gate. Insert it right after the `item` shape check at line ~824.

New code to insert (right after the `if (!this.isRecord(item)) return null;` line in `extractToolInfo`):

```typescript
    // ── Codex native web_search tool (standalone_web_search feature) ──
    // These items have type "web_search" and are NOT gated on
    // isCompletedCodexItem — we emit toolUse events for both the
    // item.started and item.completed variants so the UI shows the
    // search happening live.
    const itemType = this.getString(item, 'type') ?? '';
    if (itemType === 'web_search') {
      const toolId = this.getString(item, 'id') ?? `web_search:${Date.now()}`;
      const action = this.isRecord(item.action) ? item.action : null;
      const query = this.getString(action ?? {}, 'query') ?? this.getString(item, 'query') ?? '';
      const eventType = this.getString(event, 'type') ?? '';
      const isCompleted = eventType.includes('completed') || (this.getString(item, 'status') ?? '').includes('complete');
      return {
        toolName: 'WebSearch',
        filePath: query || undefined,
        toolId,
      };
      // Note: the caller (processOutputLine) emits the toolUse event with
      // status 'complete' unconditionally. That's fine — for started events
      // the query may be empty (Codex emits a started event with empty
      // query then a completed event with the actual query). The UI will
      // flash a "WebSearch: started → complete" pair which collapses into
      // a single visible entry.
    }
    // (isCompletedCodexItem gate still applies to all other tool kinds)
```

Actually the comment above overstates the caller's behavior — re-check: in `processOutputLine` at line ~680-708, when `extractToolInfo` returns non-null, the caller emits a `toolUse` with `status: 'complete'` and a `toolDuration` event, and calls `tracker.touchFile` only if `isFileWriteTool(toolName)` returns true. For `WebSearch`, `isFileWriteTool` is false (not Write/Edit), so no spurious file touch happens — good.

The concern with emitting `complete` for a `started` event is minor — the UI will show a search completed when it actually just started, then another "complete" when the completed event comes in. But since the timing between started and completed is typically a few seconds (the actual HTTP search happens server-side in the CLI), and since the second event will have the actual query, the net effect is the user sees a search flash in the tool list. This is acceptable for a first pass — the chunked flow still reads correctly.

If the started/completed distinction matters, the cleaner solution is to make `extractToolInfo` return both the name and the intended status, but that's a bigger refactor. Acceptable first pass: both events produce `WebSearch` toolUse events; the completed event is the one with the query string. We'll handle the status in step 4 by only emitting for completed events (skip started).

**Revised approach** — gate web_search on completed events only:

After re-reading, simpler is better. Just handle the completed case (which carries the query) by relying on the existing `isCompletedCodexItem` gate for ALL tools. Add the `web_search` branch AFTER the `isCompletedCodexItem` check, alongside the `file_change` branch:

```typescript
    if (!this.isCompletedCodexItem(event, item)) return null;

    const itemType = this.getString(item, 'type') ?? '';

    if (itemType === 'web_search') {
      const toolId = this.getString(item, 'id') ?? `web_search:${Date.now()}`;
      const action = this.isRecord(item.action) ? item.action : null;
      const query = (action ? this.getString(action, 'query') : undefined) ?? this.getString(item, 'query') ?? '';
      return { toolName: 'WebSearch', filePath: query || undefined, toolId };
    }

    if (itemType === 'file_change') {
      // existing code
    }
```

This means we miss the `item.started` event for web_search — the search happens, then a completed event with the query arrives and the UI shows "WebSearch complete (query: ...)". Fine for a first pass. If the user wants live-start indicator, that's a follow-up session.

### 4. Modify `extractToolInfo`

Concretely, the current code is (lines ~822-851):

```typescript
private extractToolInfo(event: Record<string, unknown>, workspaceCwd: string): { toolName: string; filePath?: string; toolId: string } | null {
  const item = event.item;
  if (!this.isRecord(item)) return null;
  if (!this.isCompletedCodexItem(event, item)) return null;

  const itemType = this.getString(item, 'type') ?? '';
  if (itemType === 'file_change') {
    const filePath = this.extractFileChangePath(item, workspaceCwd);
    if (!filePath) return null;
    const toolName = this.getFileChangeToolName(item);
    const toolId = this.getString(item, 'id') ?? `${toolName}:${filePath}`;
    return { toolName, filePath, toolId };
  }

  const rawToolName = this.getString(item, 'name')
    ?? this.getString(item, 'tool_name')
    ?? this.getString(item, 'toolName')
    ?? itemType;
  const toolName = this.normalizeToolName(rawToolName);
  // ... tool-like filter ...
}
```

Insert the `web_search` branch between the `isCompletedCodexItem` check and the `file_change` branch, exactly as shown in the revised approach above.

Note: `filePath` is repurposed as the search query string for the UI. This is consistent with how the existing `toolUse` StreamEvent surfaces a "what is this operating on" field — `ToolUseInfo.filePath` is optional and used here as a human-readable label. The renderer shows it as the file path area; it'll show the query string there, which reads as "WebSearch on 'literary agents romance'". That's perfectly legible.

### 5. No changes to `isFileWriteTool`

`isFileWriteTool` (line ~908) returns true only for `'Write'` and `'Edit'`. It stays `false` for `'WebSearch'`, so the `processOutputLine` caller will NOT call `tracker.touchFile` for web searches. Correct — web search doesn't touch local files.

### 6. No changes to `normalizeToolName`

`normalizeToolName` (line ~899-906) maps `read`/`write`/`edit`/`ls`/`list` substrings to `Read`/`Write`/`Edit`/`LS`. It returns the raw name if it doesn't match. For web_search items, we bypass this entirely (step 4 returns before reaching this code), so `normalizeToolName` is unchanged.

## Verification

1. Run `npm run lint` (tsc --noEmit) — must compile with zero errors.
2. Grep `'--enable'` in `src/infrastructure/codex-cli/CodexCliClient.ts` — should show `'--enable', 'standalone_web_search',` in the args array.
3. Grep `'web_search'` in `src/infrastructure/codex-cli/CodexCliClient.ts` — should show the new branch in `extractToolInfo`.
4. Live test (optional, if Codex CLI is installed): run the app with Codex CLI as the active provider, invoke Quill's "Research Targets" in the Query Manager. Confirm a `toolUse` StreamEvent with `toolName: 'WebSearch'` appears in the UI while/after the search runs.

## State Update

Update `prompts/session-program/program-022/STATE.md`:
- Set Session 02 status → `done`
- Add completion date
- Add handoff note: "Session 02 complete. `--enable standalone_web_search` added to `codex exec` spawn args. `extractToolInfo` now recognizes `web_search` items and emits `WebSearch` toolUse StreamEvents."