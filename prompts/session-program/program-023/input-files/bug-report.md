# Bug Report — Query Manager "Research Targets" Silently Fails

**Date:** 2026-07-12
**Reporter:** John (via screenshots + console log)
**Model used:** claude-fable-5 ("fabled")

## Symptom

Clicking **Research Targets** in the Query Manager appears to run research, but:
- No targets are ever added (header stays at "0 targets")
- The user is left on the same empty screen
- No error message is shown anywhere in the UI

## Console Log Evidence

```
[ChatService] Routing: model=claude-fable-5, provider=claude-cli, toolUse=true, agent=Quill
[ClaudeCodeClient] Spawning CLI: model=claude-fable-5, cwd=.../books/open-channel, args=16 items, systemPromptBytes=25411
[ClaudeCodeClient] CLI spawned: pid=74617
[ChatService] Post-stream extraction: phase=query-agents, files=source/query-tracker.md, bufferLen=212
[ClaudeCodeClient] CLI exited: pid=74617, code=1
[ClaudeCodeClient] CLI failed: code=1, pid=74617, model=claude-fable-5, stdinBytes=1581, stderr=(empty), stdoutDiagnostics=(none)
[ChatService] Post-stream extraction (error fallback): phase=query-agents, files=source/query-tracker.md, bufferLen=212
[ChatService] Post-stream extraction skipped — source/query-tracker.md already populated
```

Also an earlier `FileSystemService.readFile` ENOENT stack trace from the renderer.

## Confirmed On-Disk Corruption

`books/open-channel/source/query-tracker.md` contains agent narration, not tracker entries:

> WebFetch isn't permitted in this session, so I'll work through WebSearch. Let me verify
> specific names and submission details.
>
> A few more verifications on the newer agents and one small press, then I'll compile.

## Root-Cause Chain (from code analysis)

1. `AGENT_REGISTRY.Quill.maxTurns = 8` (src/domain/constants.ts:62) — the research
   prompt requires ~20–40 turns (context reads + 5–10 WebSearches + verification + write).
   CLI hit `--max-turns 8` → `result` event with error subtype → exit code 1, empty stderr.
2. `ClaudeCodeClient.processStreamEvent` (src/infrastructure/claude-cli/ClaudeCodeClient.ts:461)
   emits `done` for ANY `result` event — never checks `is_error` / `subtype`. The error
   result's text was also emitted as a `textDelta`, landing in the response buffer.
3. `ChatService` `onDone` hook ran post-stream extraction on the "successful" done and
   auto-saved the 212-char narration buffer into `source/query-tracker.md`
   (src/application/ChatService.ts:687).
4. The CLI then exited 1 → error fallback extraction ran but was skipped
   ("already populated" — populated with the junk just written, src/application/ChatService.ts:677).
5. `QueryService.researchTargets` (src/application/QueryService.ts:213) reloads the tracker
   (parses to 0 targets), returns `addedTargets: 0` with no error. `queryStore` never sets
   `error`. UI shows nothing.

## Immediate Manual Remediation

```bash
rm "~/Library/Application Support/Novel Engine/books/open-channel/source/query-tracker.md"
```
