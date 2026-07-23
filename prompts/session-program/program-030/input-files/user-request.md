# User Request — Auto-Resume on Max-Turns Error

## Problem

"I keep getting max turn errors and then stopping, when I just want the CLI call to continue."

The Claude Code CLI (`ClaudeCodeClient`) spawns `claude --print --max-turns 30`
(or whatever the agent's `maxTurns` is). When the model exhausts that turn budget
before finishing its task, the CLI emits a `result` event with subtype
`error_max_turns` (is_error: true) and exits non-zero. This surfaces as:

1. An `error` StreamEvent with message "Claude CLI run failed (error_max_turns): ..."
2. The `sendMessage` promise rejects
3. ChatService catches, emits a terminal `error`, and the conversation stops
4. The user sees the error in the UI and the stream is over

Similarly, the Ollama (`OllamaCodeClient`) and llama-server (`LlamaServerClient`)
providers run an internal multi-turn loop capped by `maxTurns`. When the loop
exits because `turn >= maxTurns` (while the model was still requesting tool
calls), they silently emit a `done` event — the task is incomplete but there's
no error signal at all.

## Desired Behavior

When the max-turns limit is reached (on any provider), the call should
**transparently auto-resume** by re-spawning with:

1. The full conversation so far — including the partial assistant output from
   the truncated call as a prior assistant turn
2. A higher turn budget (original + a bump, e.g. +10 turns per resume attempt)
3. A "please continue" instruction appended so the model picks up where it left off

**No cap on consecutive resumes** — keep going until the task finishes naturally
(model emits plain text / no tool calls, or `done` with subtype `success`).

This applies **everywhere** — all CLI providers (Claude CLI, Ollama, llama-server,
OpenAI-compatible) and all feature areas (Chat, Pipeline, Revision Queue, Pitch Room, etc.).

## Feature Areas Affected

All providers and all callers:
- Chat view (conversational agent chat)
- Pipeline (multi-step generation flows via MultiCallOrchestrator)
- Revision Queue
- Pitch Room
- Ad-hoc Revisions
- Hot Takes
- Helper
- Audit Service
- Motif Ledger
- Source Generation

## Scope

This is a cross-cutting change. The cleanest approach is a centralized
auto-resume layer that wraps the provider `sendMessage` call, detects
max-turn exhaustion, and re-spawns transparently — so every caller benefits
without individual changes.