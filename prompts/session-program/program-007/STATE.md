# State Tracker — Novel Engine / Codex CLI Workspace Compatibility

## Program
Novel Engine

## Feature
Codex CLI Workspace Compatibility

## Intent
Make Codex CLI book-scoped workspace setup reliable and observable when the installed CLI does not support `--add-dir`, preventing opaque stalls after the current compatibility warning.

## Sessions
| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 01 | Harden Codex workspace launch | `M06`, `M08` | done | 2026-07-02 | Updated `./src/infrastructure/codex-cli/CodexCliClient.ts`, `./docs/architecture/INFRASTRUCTURE.md`, and `./CHANGELOG.md`; `npx tsc --noEmit` passed. |

## Dependency Graph
```mermaid
flowchart TD
  S01["01 Harden launch"]
```

## Architecture Reference
- Full config: `./FORGE-CONFIG.md`
- Source input: `./prompts/session-program/program-007/input-files/bug-report.md`
- Relevant modules:
  - `M06` — `./src/infrastructure/codex-cli/`
  - `M08` — `./src/application/`

## Scope Summary
| Module | Paths | Expected Change |
|--------|-------|-----------------|
| `M06` | `./src/infrastructure/codex-cli/CodexCliClient.ts` | Command/workspace planning, status event, early validation, clearer logging. |
| `M08` | `./src/application/ChatService.ts` | Read for context. Modify only if file guidance needs provider-aware wording after the infrastructure fix. |
| Docs | `./CHANGELOG.md`, `./docs/architecture/INFRASTRUCTURE.md` | Mandatory changelog and Codex CLI behavior docs. |

## Design Decisions
- **Book-local fallback**: If `--add-dir` is unavailable, treat active-book `cwd` as the intentional workspace root instead of a degraded error state.
- **No source tree access from agent**: Do not grant Codex access to the app repository for manuscript requests. The CLI should operate only on the active book unless a caller passes a different `workingDir`.
- **Observable fallback**: Emit a `status` stream event when the fallback is used so the CLI Activity panel can show why the workspace is limited.
- **Early path validation**: Missing working directories should fail before spawning `codex`, producing a clear error event.

## Handoff Notes
- 2026-07-02 — `./src/infrastructure/codex-cli/CodexCliClient.ts` now builds and validates a workspace plan before spawning Codex, emits status for the older-CLI active-book fallback, and logs `workspaceMode`; `./docs/architecture/INFRASTRUCTURE.md` and `./CHANGELOG.md` were updated. Verification: `npx tsc --noEmit` passed.
