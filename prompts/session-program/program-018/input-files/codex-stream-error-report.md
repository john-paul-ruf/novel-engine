# Input — Codex CLI Stream Failure Report

Captured 2026-07-09 from a Novel Engine run ("expand the chapters with lore and scene expansion")
against book `open-channel`, provider `codex-cli`, installed CLI `codex-cli 0.27.0`.

## Raw error surfaced to the user

```
Error: Codex CLI exited without assistant output or usage.
exitCode=0
signal=null
elapsedMs=7843
workspaceMode=book-with-books-root-config
jsonEvents=9
eventTail=unknown{reasoning summaries,workdir,provider,approval,model,reasoning effort} > unknown{prompt} > task_started > stream_error > stream_error > stream_error > stream_error > stream_error > error
unknownJsonTail={"reasoning summaries":"auto","workdir":".../books/open-channel","provider":"openai","approval":"never","model":"gpt-5.4","reasoning effort":"medium","sandbox":"workspace-write [...]"} | {"prompt":"SYSTEM:\n# Fiction Ghostwriter Agent — Core Instructions\n..."}
stderr=Warning: no last agent message; wrote empty content to .../novel-engine-codex-BKbRHA/last-message.txt
```

## Diagnosis

1. **Upstream cause:** Codex CLI 0.27.0's model stream failed 5 consecutive times
   (`stream_error` ×5 → terminal `error`) in ~7.8s, then exited with code 0 and no output.
   Likely CLI/model mismatch (old CLI streaming `gpt-5.4`) or transient API failure.
2. **Bug A — real error message dropped:** Codex 0.27.0 wraps every event in an envelope:
   `{"id":"0","msg":{"type":"stream_error","message":"<real reason>"}}`.
   `extractError()` / `extractText()` / `extractStatus()` / `extractUsage()` in
   `src/infrastructure/codex-cli/CodexCliClient.ts` only read **top-level** keys, so the
   real reason inside `msg.message` was never surfaced — the user got a cryptic diagnostic
   dump with `summary: "exited without assistant output"` instead of the actual error.
3. **Bug B — assistant text also missed on 0.27.0:** nested `agent_message` events are not
   parsed; output only survives via the `--output-last-message` fallback file.
4. **Bug C — no app-level retry:** a transient stream failure kills the whole run even
   though the app has retry precedent (`MULTI_CALL_MAX_RETRIES` pattern in
   `src/application/MultiCallOrchestrator.ts`).
5. **Cosmetic:** the two leading `unknown{...}` events are 0.27.0's config/prompt echo
   lines, unrecognized by `summarizeCodexEvent()`.
