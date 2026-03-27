# FIX-09 — System prompt size guard

> **Issue(s):** 3.11
> **Severity:** 🟢 Low
> **Category:** Security
> **Effort:** Low
> **Depends on:** Nothing

---

## Objective

The system prompt is passed to the Claude CLI via `--system-prompt` as a command-line argument with no size check. An extremely large agent `.md` file could cause spawn failure with `E2BIG` (argument list too long). The CLI would fail to spawn, the error handler would fire, but the user would see an unhelpful OS-level error message.

This fix adds a size check before spawning the CLI, emitting a clear error message if the system prompt exceeds a safe limit.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 3.11 | System prompt size has no explicit guard | 🟢 Low |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Modify | Add system prompt size check before spawn |

---

## Implementation Steps

### 1. Add size guard before CLI spawn

Read `src/infrastructure/claude-cli/ClaudeCodeClient.ts`. The `systemPrompt` is used at line 155 (`'--system-prompt', systemPrompt`). The spawn happens at line 177. Add a guard between args construction and the `new Promise` block.

**Insert after the args array (after line 158) and before `new Promise` (line 176):**

```typescript
// Guard against system prompts that would exceed the OS argument size limit.
// Most systems support 128KB-2MB for total argv. We cap the system prompt at
// 500KB to leave room for other arguments.
const MAX_SYSTEM_PROMPT_BYTES = 500_000;
const promptBytes = Buffer.byteLength(systemPrompt, 'utf-8');
if (promptBytes > MAX_SYSTEM_PROMPT_BYTES) {
  const message = `System prompt exceeds ${MAX_SYSTEM_PROMPT_BYTES / 1000}KB limit (actual: ${Math.round(promptBytes / 1000)}KB). Check the agent .md file for excessive content.`;
  params.onEvent({ type: 'error', message });
  return;
}
```

Note: Use `Buffer.byteLength` rather than `.length` since the OS argument limit is byte-based, not character-based. Since `sendMessage` returns `Promise<void>`, the early return from an async function resolves to `undefined`, which is correct.

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `MAX_SYSTEM_PROMPT_BYTES` in `ClaudeCodeClient.ts` — should appear once
3. The error message should clearly indicate the system prompt is too large and suggest checking the agent file

---

## State Update

After completing this prompt, update `prompts/arch/r002/STATE.md`:
- Set FIX-09 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
