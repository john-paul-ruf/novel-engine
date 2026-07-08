# Release Notes — v0.8.0

**Previous release:** v0.7.0 (2026-03-29)
**This release:** v0.8.0 (2026-07-08)
**Commits:** 60 | **Files changed:** 386 | **Contributors:** the.phoenix, John Paul Ruf

---

## Highlights

> Novel Engine is no longer tied to a single AI backend: this release adds full support for local and alternative providers — Ollama (CLI-first, with a built-in agentic tool loop), llama-server, and the Codex CLI — alongside Claude, with model pickers that list exactly what's installed on your machine. The workspace itself has been completely redesigned around your book: a Library bookshelf, a pipeline spine showing every phase at a glance, a split chat + companion workbench, a dedicated Manuscript view, and a command palette. And for the first time you can edit chapters yourself — your edits are tracked against the agent's baseline, badged in the chapter rail, and fed to Verity so audits know what *you* changed. Version history is now one click away from everywhere your prose appears.

---

## Features

- **Ollama & llama-server providers** — Novel Engine can now run entirely on local models. A new `ollama-cli` infrastructure module implements a full agentic loop (tool definitions, tool executor, context compactor), a `llama-server` client targets any llama.cpp-compatible server, and a `MultiCallOrchestrator` coordinates multi-call agent runs across providers. (#f9b438c, #c74d279, #cdb4f33)
- **Codex CLI provider** — Detects an installed `codex` CLI at startup, registers it as a provider with model discovery, and adds provider-switching UI with onboarding copy. (#f3dc200, #7330c1d, #b25736e, #ed3eca1)
- **Ollama CLI-first experience** — Ollama availability and model discovery now route through the `ollama` CLI itself (new `OllamaCliRunner`), so no server configuration is needed to get started. (#c073bd8, #232dc68, #1e0719a, #a461a5c)
- **Streamlined workspace UI** — Complete 14-session redesign of the renderer: design-token + typography foundation, icon rail with breadcrumb title bar, command palette with an action registry, status bar + activity drawer, a Library bookshelf view, a pipeline spine panel, a workbench shell with phase header and split chat + companion panes, companion content tabs, a Manuscript view with read and edit modes, rerouted Exports/Statistics/Settings, a refreshed Pitch Room, and legacy-view removal with updated tours. (#7100018 … #fcdb3de)
- **Tracked chapter editing** — The chapter editor is unlocked: author edits are diffed against the agent baseline (new domain type, DB query, and `VersionService` API), surfaced as EDITED badges in the chapter rail with a discard-my-edits flow, injected into Verity's audit context, and guarded against agent activity with external-change reload. (#a765763, #cc9b37e, #c8099fa, #fda7e98, #f88ac8b, #efc73f1)
- **Version history everywhere** — A reusable `VersionHistoryModal` brings history buttons to all companion tabs and the Manuscript reader, with version-history surfaces rethemed to the new design tokens. (#2bbee05, #68f7521, #56674ed, #2e302c7)
- **Dual primary/secondary model picker** — Settings now hold a `secondaryModel` used by AuditService and HotTakeService, configurable from a dual picker in Settings. (#d244702, #07f9845, #fcd0437)
- **Claude Fable 5 support** — `claude-fable-5` is probed at startup and added to the Claude CLI model list when the CLI accepts it. (#b4d5fed)

## Improvements

- **Large-context models no longer break mid-task** — `MAX_CALL_CONTEXT_TOKENS` raised from 125K to 250K, the Ollama/llama-server context ceiling softened from 90% to 98%, and proactive compaction of old tool results now kicks in at 80% of the window, so the agent loop only stops if compaction fails. (#26420b0)
- **Unified installed-CLI model selection** — Primary and secondary model pickers share one implementation and list the models actually available from installed CLIs. (#98cac8d)
- **No more hardcoded model IDs** — Model IDs moved to a single source of truth in domain constants and removed from the application layer and UI components. (#62279ad, #6f77299, #763ffff)
- **Better Claude CLI failure diagnostics** — Non-JSON stdout lines are captured and combined with stderr to build the most informative error message when the CLI exits abnormally. (#3fbb4d7)
- **Revision queue hardening** — Multi-call retry with extra turns per attempt in `RevisionQueueService`, plus agent-pipeline tuning across AuditService, MotifLedgerService, and the Verity audit agent. (#39d47ba, #6af2212)
- **Sidebar bookshelf + 5-tab FilesView** — The sidebar gained a persistent bookshelf panel and FilesView moved to five category tabs (Source, Chapters, Agents, Explorer, Motif Ledger); this interim layout was later superseded by the Library and Workbench views in the streamlined UI. (see CHANGELOG 2026-03-29)

## Bug Fixes

- **Codex workspace launch failures** — Hardened how the Codex CLI is launched into a book workspace. (#0697e88)
- **Codex `add-dir` incompatibility** — Directory-access flags adjusted so Codex CLI sessions can read the book directory. (#4f71f20)
- **Revision queue used the wrong model** — `runSession` now uses `settings.model` instead of the secondary model ID. (#083ad65)

## Infrastructure

- **New dependencies** — `@fontsource-variable/fraunces`, `@fontsource/inter`, `@fontsource/jetbrains-mono` (streamlined-UI typography) and `undici`; `package.json` version bumped 0.1.0 → 0.2.0. (#7100018, #f9b438c)

## Documentation

- **Architecture docs refreshed** — All six `docs/architecture/*.md` files updated to reflect the provider and UI work. (#f9b438c, #fcdb3de)
- **Architecture Engine readme** — `prompts/meta/architecture-engine/readme.md` now explains what Forge does, its workflow, and output structure. (see CHANGELOG 2026-03-29)
- **README updates** — Post-0.7.0 README touch-ups. (#5cbffd1, #0677fb5)
- **v0.7.0 release notes archived** — Moved to `docs/releases/0.7.0-RELEASE_NOTES.md`. (#8d2e107, #e1374a7)

---

## Upgrade Notes

No special upgrade steps required — there are no database schema migrations and no renamed IPC channels in this release.

1. Pull the latest `main`.
2. Run `npm install` (new font and `undici` dependencies).
3. Rebuild and launch (`npm start` or `npm run build`).
4. Existing `settings.json` files are upgraded in place — new fields (`hasCodexCli`, `secondaryModel`, provider configs) are populated with defaults on first launch.
5. If you use Ollama or llama-server, open **Settings → Providers** to select your local models.

---

## Full Commit Log

<details>
<summary>All 60 commits since v0.7.0</summary>

- 2e302c7 feat(version-history-everywhere): SESSION-04 — History in Manuscript reader mode + final audit (the.phoenix, 2026-07-08)
- 56674ed feat(version-history-everywhere): SESSION-03 — History buttons in all companion tabs (the.phoenix, 2026-07-08)
- 68f7521 feat(version-history-everywhere): SESSION-02 — Reusable VersionHistoryModal (the.phoenix, 2026-07-08)
- 2bbee05 feat(version-history-everywhere): SESSION-01 — Retheme version-history surfaces to ne-* tokens (the.phoenix, 2026-07-08)
- efc73f1 feat(tracked-chapter-editing): SESSION-06 — Agent-activity guard + external-change reload (the.phoenix, 2026-07-08)
- fda7e98 feat(tracked-chapter-editing): SESSION-04 — Chapter rail EDITED badges + discard-my-edits flow (the.phoenix, 2026-07-08)
- c8099fa feat(tracked-chapter-editing): SESSION-03 — Unlock the chapter editor with tracked-edit mode (the.phoenix, 2026-07-08)
- f88ac8b feat(tracked-chapter-editing): SESSION-05 — Feed author edits to Verity (context injection) (the.phoenix, 2026-07-08)
- cc9b37e feat(tracked-chapter-editing): SESSION-02 — IPC handlers + preload bridge for edit-status queries (the.phoenix, 2026-07-08)
- a765763 feat(tracked-chapter-editing): SESSION-01 — Baseline-diff foundation: domain type, DB query, VersionService API (the.phoenix, 2026-07-08)
- fcdb3de feat(streamlined-ui): SESSION-14 — Legacy removal, tours, final audit (the.phoenix, 2026-07-07)
- a4286bf feat(streamlined-ui): SESSION-13 — Pitch Room + palette-launched actions (the.phoenix, 2026-07-07)
- e4f1110 feat(streamlined-ui): SESSION-12 — Exports, Statistics, Settings routing (the.phoenix, 2026-07-07)
- 250f163 feat(streamlined-ui): SESSION-11 — Manuscript view (read + edit) (the.phoenix, 2026-07-07)
- 74c3ad9 feat(streamlined-ui): SESSION-10 — Companion content tabs (the.phoenix, 2026-07-07)
- 5885b66 feat(streamlined-ui): SESSION-09 — Split pane: chat + companion shell (the.phoenix, 2026-07-07)
- 94fd5d4 feat(streamlined-ui): SESSION-08 — Workbench shell + phase header (the.phoenix, 2026-07-07)
- ff3ddc7 feat(streamlined-ui): SESSION-07 — Pipeline spine panel (the.phoenix, 2026-07-07)
- 5de753e feat(streamlined-ui): SESSION-06 — Library view (bookshelf) (the.phoenix, 2026-07-07)
- a030802 feat(streamlined-ui): SESSION-05 — Status bar + activity drawer (the.phoenix, 2026-07-07)
- 161edad feat(streamlined-ui): SESSION-04 — Command palette + action registry (the.phoenix, 2026-07-07)
- c20ee98 feat(streamlined-ui): SESSION-03 — Icon rail + title bar breadcrumb (the.phoenix, 2026-07-07)
- 09143ee feat(streamlined-ui): SESSION-02 — viewStore v5: new view routing (the.phoenix, 2026-07-07)
- 7100018 feat(streamlined-ui): SESSION-01 — Design tokens & typography foundation (the.phoenix, 2026-07-07)
- 26420b0 multi cli (the.phoenix, 2026-07-02)
- a461a5c feat(ollama-cli-first-experience): SESSION-04 — Documentation and verification (the.phoenix, 2026-07-02)
- 1e0719a feat(ollama-cli-first-experience): SESSION-03 — Update provider settings UX for CLI-first Ollama (the.phoenix, 2026-07-02)
- 232dc68 feat(ollama-cli-first-experience): SESSION-02 — Route Ollama availability and model discovery through CLI (the.phoenix, 2026-07-02)
- c073bd8 feat(ollama-cli-first-experience): SESSION-01 — Add Ollama CLI runner (the.phoenix, 2026-07-02)
- 0697e88 fix(codex-cli): SESSION-01 — Harden Codex workspace launch (the.phoenix, 2026-07-02)
- 4f71f20 fix(codex-add-dir-compatibility): SESSION-01 — Make Codex CLI add-dir Compatible (the.phoenix, 2026-07-02)
- 98cac8d feat(installed-cli-model-selection): SESSION-01 — Unify Primary and Secondary Model Pickers (the.phoenix, 2026-07-02)
- ed3eca1 feat(codex-provider-switching): SESSION-04 — Provider switching UI polish and onboarding copy (the.phoenix, 2026-07-02)
- b25736e feat(codex-provider-switching): SESSION-03 — Register Codex and model discovery at startup (the.phoenix, 2026-07-02)
- 7330c1d feat(codex-provider-switching): SESSION-02 — Codex CLI provider implementation (the.phoenix, 2026-07-02)
- f3dc200 feat(codex-provider-switching): SESSION-01 — Domain, settings, IPC surface for Codex detection (the.phoenix, 2026-07-02)
- b4d5fed $*$*ING FABLE IS BACK (the.phoenix, 2026-07-01)
- fcd0437 feat(claude-model-picker): SESSION-03 — Renderer: Dual primary/secondary model picker in SettingsView (the.phoenix, 2026-06-28)
- 07f9845 feat(claude-model-picker): SESSION-02 — Application: Wire secondaryModel into AuditService + HotTakeService (the.phoenix, 2026-06-28)
- d244702 feat(claude-model-picker): SESSION-01 — Domain: Add secondaryModel to AppSettings (the.phoenix, 2026-06-28)
- 083ad65 fix(revision-queue): use settings.model in runSession, not secondary model ID (the.phoenix, 2026-06-28)
- 763ffff feat(remove-model-hardcodes): SESSION-03 — Renderer: Remove Hardcoded Model IDs from UI Components (the.phoenix, 2026-06-28)
- 6f77299 feat(remove-model-hardcodes): SESSION-02 — Application Layer: Remove Runtime Model Hardcodes (the.phoenix, 2026-06-28)
- 62279ad feat(remove-model-hardcodes): SESSION-01 — Domain: Single Source of Truth for Model IDs (the.phoenix, 2026-06-28)
- 6af2212 wrangler (the.phoenix, 2026-06-27)
- cdb4f33 Merge pull request #9 from john-paul-ruf/llama/add-llama-and-ollama-support (John Paul Ruf, 2026-05-02)
- 3fbb4d7 wrangler (the.phoenix, 2026-04-30)
- 39d47ba wrangler (the.phoenix, 2026-04-28)
- a5fa552 llama - forge (the.phoenix, 2026-04-27)
- f59470e llama - sable (the.phoenix, 2026-04-27)
- 361b171 llama (the.phoenix, 2026-04-26)
- ba5ed4b llama (the.phoenix, 2026-04-25)
- afff38f llama (the.phoenix, 2026-04-25)
- c74d279 llama (the.phoenix, 2026-04-24)
- 64d68fd ollama (the.phoenix, 2026-04-24)
- f9b438c ollama (the.phoenix, 2026-04-24)
- 5cbffd1 Update README.md (John Paul Ruf, 2026-03-30)
- 0677fb5 Update README.md (John Paul Ruf, 2026-03-30)
- e1374a7 release 0.7.0 (the.phoenix, 2026-03-29)
- 8d2e107 release 0.7.0 (the.phoenix, 2026-03-29)

</details>
