# SESSION-02 — Full Codebase Analysis for README

> **Program:** Novel Engine
> **Feature:** deployment-prep
> **Modules:** none modified (reads M01–M10)
> **Depends on:** SESSION-01
> **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M01 | domain | `src/domain/types.ts`, `interfaces.ts`, `constants.ts` | Catalog agents, pipeline phases, pricing, service interfaces |
| M02 | settings | `src/infrastructure/settings/SettingsService.ts` | Settings managed, CLI detection |
| M03 | database | `src/infrastructure/database/schema.ts`, `DatabaseService.ts` | Tables, persisted data |
| M04 | agents | `src/infrastructure/agents/AgentService.ts` | Agent prompt loading |
| M05 | filesystem | `FileSystemService.ts`, `BookWatcher.ts`, `BooksDirWatcher.ts` | Book CRUD, watchers, userData layout |
| M06 | claude-cli | `ClaudeCodeClient.ts`, `StreamSessionTracker.ts` | CLI invocation, streaming |
| M07 | pandoc | `src/infrastructure/pandoc/index.ts` | Binary resolution |
| M08 | application | every file in `src/application/` | Services, ContextBuilder vs Wrangler, pipeline detection, build formats |
| M09 | main/ipc | `src/main/index.ts`, `bootstrap.ts`, `ipc/handlers.ts`, `notifications.ts`, `src/preload/index.ts` | IPC channels, bridge API, bootstrap |
| M10 | renderer | all `stores/*.ts`, scan every component dir, `hooks/`, `App.tsx` | Views, widgets, undocumented features |

## Context

This is the first half of **Phase 2** (README Deep Update), split because the full analysis + rewrite exceeds one session. This session performs Analysis Steps 1–8 of `readme-deep-update.md` and persists the findings as a handoff artifact. SESSION-03 rewrites the README from that artifact. **No repo files are modified in this session** — the only output is the artifact.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `prompts/session-program/program-013/artifacts/readme-analysis.md` | Create | Structured findings from Analysis Steps 1–8 |

## Implementation

### 1. Execute Analysis Steps 1–8

Read `prompts/session-program/program-013/input-files/readme-deep-update.md` (canonical: `prompts/meta/readme-deep-update.md`) and perform its **Analysis Steps 1–8** completely: Domain, Infrastructure, Application, Main Process, Renderer, Configuration & Build, Agent Prompts, Additional Files (`AGENTS.MD`, `CHAPTER_VALIDATION.md`, `LICENSE`). Also read `RELEASE_NOTES.md` (SESSION-01 output) — recent changes it catalogs must be reflected in the README.

### 2. Write the analysis artifact

Write `prompts/session-program/program-013/artifacts/readme-analysis.md` with these sections:

```markdown
# README Analysis — {date}
## Agents (verified against constants.ts)        — name, slug, model, thinking budget per agent
## Pipeline Phases (verified against detection)  — every phase + completion gate
## Preload Bridge API                            — full window.novelEngine surface
## IPC Channels                                  — every channel + purpose
## Database Schema                               — tables + purposes
## Application Services                          — each service, what it actually does
## Context Assembly                              — Wrangler two-call pattern vs ContextBuilder: what is ACTUALLY implemented
## Renderer Views & Widgets                      — every view, sidebar widget, onboarding steps
## npm Scripts & Dependencies                    — verified against package.json (with versions)
## New Features Not in Current README            — investigated list (PitchRoom, CliActivity, modal chat, auto-draft, stream routing, watchers, thinking budget, chapter validation, notifications, error boundaries, ...)
## Phantom Features in Current README            — claims with no corresponding code
## Preserved Sections (copied verbatim)          — exact current text of Heads Up, Dedication, Questions/rants
## src/ Tree & userData Tree                     — actual structure
## License                                       — verified type
```

Every claim must cite the file it was verified against. Copy the three preserved README sections into the artifact **verbatim** so SESSION-03 cannot lose them.

## Verification

- [ ] `artifacts/readme-analysis.md` exists and contains all sections above
- [ ] Agent list matches `src/domain/constants.ts` exactly
- [ ] Pipeline phases match actual detection logic in `PipelineService.ts`
- [ ] Context-assembly section states what is implemented, not what AGENTS.md describes
- [ ] The three preserved sections are captured verbatim from the current `README.md`
- [ ] `git status` shows no modified repo files (artifact only)

## State Update

Set SESSION-02 to `done`. Handoff Notes: artifact path, count of new features discovered, count of phantom features found, and any surprises (e.g., Wrangler pattern not implemented as documented).
