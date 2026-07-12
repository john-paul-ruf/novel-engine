# SESSION-01 — Add WebSearch to Claude CLI Allowed Tools

> **Program:** Novel Engine
> **Feature:** query-auto-populate
> **Modules:** M-CLI (ClaudeCodeClient)
> **Depends on:** Nothing
> **Estimated effort:** 15–20 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M-CLI | `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Lines 226–235 (args array) | Add `WebSearch` to `--allowedTools` string |

## Context

The Claude Code CLI is spawned with a whitelist of tools: `Read,Write,Edit,LS,Bash(mkdir:*),...`. Quill needs `WebSearch` to look up agent databases, MSWL pages, and publisher submission guidelines. This is a one-line change to the `--allowedTools` argument.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/infrastructure/claude-cli/ClaudeCodeClient.ts` | Modify | Add `WebSearch` to the `--allowedTools` argument string on line 233 |

## Implementation

### 1. Add WebSearch to allowedTools

Read `src/infrastructure/claude-cli/ClaudeCodeClient.ts` around line 233. The current `--allowedTools` value is:

```
'Read,Write,Edit,LS,Bash(mkdir:*),Bash(cat:*),Bash(mv:*),Bash(cp:*),Bash(ls:*),Bash(find:*),Bash(wc:*),Bash(rm:*),Bash(rmdir:*)'
```

Add `WebSearch` to the end:

```
'Read,Write,Edit,LS,WebSearch,Bash(mkdir:*),Bash(cat:*),Bash(mv:*),Bash(cp:*),Bash(ls:*),Bash(find:*),Bash(wc:*),Bash(rm:*),Bash(rmdir:*)'
```

Also update `src/infrastructure/ollama-cli/tools.ts` comment (line 5) that documents the allowed tools, and `src/infrastructure/ollama-cli/BashEmulator.ts` comment (line 14) if it mentions the whitelist. These are documentation comments that should stay in sync — but only if they explicitly list the tools. If they just say "the whitelist ClaudeCodeClient grants," skip them.

## Verification

1. `npx tsc --noEmit` — type check passes
2. Grep for `allowedTools` in `src/infrastructure/claude-cli/ClaudeCodeClient.ts` — confirm `WebSearch` is in the string
3. `npm run lint` — no lint errors introduced

## State Update

Update `prompts/session-program/program-021/STATE.md`:
- Set SESSION-01 status to `done`
- Add completion date
- Handoff: `WebSearch` now available to all agents via the CLI. SESSION-02 can proceed with domain types.