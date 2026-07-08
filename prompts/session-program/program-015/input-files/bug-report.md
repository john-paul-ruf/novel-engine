# Bug Report — Codex CLI Quits Quickly with No Error

**Reported:** 2026-07-08
**Reporter:** User (inline)
**Symptom:** "the novel engine uses the codex cli, but quits before ten seconds and with no error"

---

## Core Intent

Fix the Codex CLI provider path so a premature Codex process exit is surfaced as an actionable error instead of silently completing or leaving the user with no explanation.

## Source Observations

- `./src/infrastructure/codex-cli/CodexCliClient.ts` launches `codex exec --json --sandbox workspace-write` and streams JSONL from stdout.
- On `close` with exit code `0`, `./src/infrastructure/codex-cli/CodexCliClient.ts` currently emits a synthetic `done` when Codex did not emit usage, even if `outputTextLength === 0`.
- On non-zero exit, it reports `stderr || Codex CLI exited with code ...`, but does not include duration, signal, stdout tail, last status event, workspace mode, or argument summary.
- `./src/infrastructure/codex-cli/CodexCliClient.ts` treats non-JSON stdout as assistant text, which can hide CLI diagnostics in `--json` mode.
- `./src/application/StreamManager.ts` already handles `error` events by ending the stream session and forwarding the error to the renderer.

## Relevant Local Environment Check

`codex --version` returned `codex-cli 0.142.4` on 2026-07-08.
`codex exec --help` includes `--add-dir`, `--json`, `--sandbox`, `--cd`, and `--skip-git-repo-check`.

## Likely Failure Mode

Codex exits successfully or near-successfully before producing assistant text/usage. The app maps that process lifecycle to `done` rather than `error`, so the UI appears to stop with no useful message.

## Expected Outcome

When Codex exits before producing meaningful output, Novel Engine should show an error that includes enough diagnostics to act on it: exit code/signal, elapsed time, workspace mode, stderr tail, stdout tail/non-JSON diagnostics, and last parsed Codex status/error.
