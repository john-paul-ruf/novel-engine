# Input — Codex File-Only Completion Still Reported as Error

Date: 2026-07-08
Program: Novel Engine
Feature: codex-file-only-completion

## User Report

A screenshot from Novel Engine's First Draft workspace shows an error bubble after starting auto draft with Codex CLI:

```text
Error: Codex CLI exited without assistant output or usage.
exitCode=0
signal=null
elapsedMs=8031
workspaceMode=book-with-books-root-config
jsonEvents=9
eventTail=unknown > unknown > unknown > unknown > unknown > unknown > unknown > unknown > unknown
stderr=Warning: no last agent message; wrote empty content to
/var/folders/.../T/novel-engine-codex-BJCfnD/last-message.txt
```

Visible app context:

- Book: `open-channel`
- Phase: `first-draft`
- Agent: Verity
- Active provider/model visible from prior work: Codex CLI
- UI command: `Start Auto Draft`
- Right manuscript pane shows a newly drafted chapter (`Ch 17 — The Resonance`) while the chat pane shows the error.

## Current Code Context

Recent `program-016` work added:

1. `--output-last-message` fallback in `./src/infrastructure/codex-cli/CodexCliClient.ts`.
2. Codex tool/file event parsing for completed `file_change` items.
3. Provider model-resolution guardrails.

The new screenshot shows that `--output-last-message` can legitimately be empty because Codex wrote files but did not create a final agent message. It also shows all parsed JSON summaries as `unknown`, meaning current event summaries are not useful enough for future parser fixes.

## Likely Root Cause

`./src/infrastructure/codex-cli/CodexCliClient.ts` still classifies clean exit code `0` as an error when both are true:

- no `done`/usage event was parsed, and
- no assistant text was streamed or recovered from `--output-last-message`.

That is correct for a no-op/no-output CLI failure, but wrong for a successful **file-only** Codex run where the requested task was to write files and not necessarily respond in chat.

If Codex's JSON file-change shape is not recognized, `StreamSessionTracker` has no file touches, so `ChatService` cannot distinguish file-only success from no-op failure.

## Goal

Make Codex file-writing runs deterministic:

1. On clean exit `0`, if Codex touched files but emitted no assistant text/usage, emit a synthetic success instead of an error.
2. Detect file touches even when Codex JSON event shapes are unknown by comparing a bounded workspace file snapshot before and after the run.
3. Improve JSON diagnostics so future failures do not show only `unknown` event tails.
4. Keep no-output/no-file clean exits as errors.
