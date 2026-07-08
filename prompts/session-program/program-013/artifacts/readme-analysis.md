# README Analysis — 2026-07-08

> SESSION-02 artifact. Every claim verified against source (cited per line). Consumed by SESSION-03 (README rewrite) and SESSION-07 (By The Numbers).
> Analysis method: 6 parallel research passes (domain / infrastructure / application / main+IPC / renderer / config+docs), critical claims re-verified directly against `src/domain/constants.ts` and `src/application/`.

---

## Agents (verified against constants.ts)

Verified directly against `src/domain/constants.ts:55-65` (`AGENT_REGISTRY`). **Nine agents total**: 7 creative (`CREATIVE_AGENT_NAMES`, constants.ts:74) + 2 internal (Wrangler, Helper). Models are NOT hardcoded per agent — every agent runs on `AppSettings.model` / `secondaryModel` (types.ts:349-351).

| Name | Filename | Role | Color | Thinking Budget | Max Turns |
|---|---|---|---|---|---|
| Spark | `SPARK.md` | Story Pitch | `#F59E0B` | 4000 | 5 |
| Verity | `VERITY-CORE.md` | Ghostwriter | `#8B5CF6` | 10000 | 30 |
| Ghostlight | `GHOSTLIGHT.md` | First Reader | `#06B6D4` | 6000 | 50 |
| Lumen | `LUMEN.md` | Developmental Editor | `#10B981` | 16000 | 50 |
| Sable | `SABLE.md` | Copy Editor | `#EF4444` | 4000 | 20 |
| Forge | `FORGE.md` | Task Master | `#F97316` | 8000 | 10 |
| Quill | `QUILL.md` | Publisher | `#6366F1` | 4000 | 8 |
| Wrangler *(internal)* | `WRANGLER.md` † | Revision Plan Parser | `#71717A` | 4000 | 3 |
| Helper *(internal)* | `HELPER.md` | Help & FAQ | `#3B82F6` | 2000 | 5 |

† Quirk: registry names `WRANGLER.md` but no such file exists in `agents/`; the actual revision-plan parse loads `WRANGLER-PARSE.md` via `agents.loadRaw()` (`RevisionQueueService.ts:357`).

- Verity phase sub-prompts (`VERITY_PHASE_FILES`, constants.ts:460-465): scaffold→`VERITY-SCAFFOLD.md`, first-draft→`VERITY-DRAFT.md`, revision→`VERITY-REVISION.md`, mechanical-fixes→`VERITY-MECHANICAL.md`; plus `VERITY-LEDGER.md` (motif integration), `VERITY-AUDIT.md` (audit pass, runs on secondary model, `VERITY_AUDIT_MODEL = CLAUDE_CLI_SECONDARY_MODEL`, constants.ts:476), `VERITY-FIX.md` (fix pass).
- `AGENT_READ_GUIDANCE` (constants.ts:16-52): per-creative-agent alwaysRead/readIfRelevant/neverRead file lists injected into context.
- `AGENT_QUICK_ACTIONS` (constants.ts:278-352): pre-built prompt shortcuts per creative agent.
- Default global thinking budget setting: 5000 (constants.ts:257); Settings slider range 1024–32000 step 1024 (SettingsView.tsx:287-372).

## Pipeline Phases (verified against detection)

`PIPELINE_PHASES` verified directly at `src/domain/constants.ts:78-91`; detection logic in `PipelineService.isPhaseComplete` (`src/application/PipelineService.ts:563-712`). 14 phases. A phase is `complete` only when detection passes AND the user confirms (`confirmPhaseAdvancement`); statuses: `complete | pending-completion | active | locked` (types.ts:110).

| # | id | Label | Agent | Detection (actual code) |
|---|---|---|---|---|
| 1 | `pitch` | Story Pitch | Spark | `source/pitch.md` ≥50 words |
| 2 | `scaffold` | Story Scaffold | Verity | `source/scene-outline.md` ≥200 words |
| 3 | `first-draft` | First Draft | Verity | chapters exist, total >1000 words, AND book status advanced beyond `first-draft` |
| 4 | `first-read` | First Read | Ghostlight | `source/reader-report.md` ≥50 words |
| 5 | `first-assessment` | Structural Assessment | Lumen | `source/dev-report.md` ≥50 words |
| 6 | `revision-plan-1` | Revision Plan | Forge | `project-tasks.md` + `revision-prompts.md` both ≥50 words (word counts must differ from v1 archives if those exist) |
| 7 | `revision` | Revision | Verity | `source/reader-report-v1.md` exists (archived by `completeRevision`) |
| 8 | `second-read` | Second Read | Ghostlight | `reader-report.md` + `reader-report-v1.md` exist, word counts differ |
| 9 | `second-assessment` | Second Assessment | Lumen | `dev-report.md` + `dev-report-v1.md` exist, word counts differ |
| 10 | `copy-edit` | Copy Edit | Sable | `source/audit-report.md` ≥50 words |
| 11 | `revision-plan-2` | Fix Planning | Forge | tasks/prompts ≥50 words + `audit-report.md` + `project-tasks-v1.md` exist + live files differ from v1 |
| 12 | `mechanical-fixes` | Mechanical Fixes | Verity | `audit-report.md` exists AND status ∈ {copy-edit, final, published} |
| 13 | `build` | Build | — (null) | `dist/{bookSlug}.md` exists |
| 14 | `publish` | Publish & Audit | Quill | `source/metadata.md` ≥50 words |

⚠ Phase 13's *description* in constants says "Generate DOCX, EPUB, and PDF" but `BuildService` produces **MD + DOCX + EPUB3 only — no PDF** (BuildService.ts:172-205). README must not claim PDF.

User actions: Advance → (`pipeline:confirmAdvancement`), Mark done (`pipeline:markPhaseComplete`), Revert (`pipeline:revertPhase`) — handlers.ts:516-536; UI in PhaseHeader.tsx:43-359.

## Preload Bridge API

Full `window.novelEngine` surface (`src/preload/index.ts`, exposed at :500). 27 namespaces:

- **settings**: load, detectClaudeCli, detectCodexCli, detectOllamaCli, update, saveAuthorProfile, loadAuthorProfile
- **agents**: list, get
- **books**: list, getActiveSlug, setActive, create, getMeta, updateMeta, wordCount, uploadCover, getCoverImagePath, getAbsolutePath, archive, unarchive, listArchived, assembleManuscript, onChanged
- **import**: selectFile, preview, commit, generateSources, onGenerationProgress
- **seriesImport**: selectFiles, preview, commit
- **files**: read, write, exists, listDir, delete
- **versions**: getHistory, getVersion, getDiff, revert, getCount, snapshot, getUserEdits, getChapterEditStatuses
- **chat**: createConversation, getConversations, getMessages, deleteConversation, send, abort, isCliIdle, getActiveStream, getActiveStreamForBook, getOrphanedSessions, deepDive, onStreamEvent, onFilesChanged
- **pipeline**: detect, getActive, markPhaseComplete, completeRevision, confirmAdvancement, revertPhase
- **build**: run, isPandocAvailable, onProgress, exportZip
- **catalog**: exportZip
- **pitches**: list, read, delete, shelve, restore
- **pitchRoom**: listDrafts, getDraft, readContent, promote, shelve, discard
- **verity**: auditChapter, fixChapter, runMotifAudit
- **hotTake**: start · **adhocRevision**: start
- **usage**: summary, byConversation · **context**: getLastDiagnostics
- **revision**: loadPlan, clearCache, runSession, runAll, respondToGate, approveSession, rejectSession, skipSession, pause, setMode, getPlan, getQueueStatus, startVerification, onEvent
- **motifLedger**: load, save, getUnauditedChapters, onNormalizing
- **shell**: openPath, openExternal · **window**: minimize, maximize, close, isMaximized, onMaximizeChange
- **models**: getAvailable · **providers**: list, getConfig, add, update, remove, checkStatus, setDefault
- **series**: list, get, create, update, delete, addVolume, removeVolume, reorderVolumes, getForBook, readBible, writeBible
- **findReplace**: preview, apply · **dashboard**: getData · **statistics**: get, recordSnapshot
- **helper**: getOrCreateConversation, getMessages, send, abort, reset

## IPC Channels

All in `src/main/ipc/handlers.ts` (window controls in `src/main/index.ts:374-392`). ~115 invoke channels across namespaces: `settings:` (8), `providers:` (7), `agents:` (2), `books:` (14), `import:` (7 incl. series), `files:` (5), `versions:` (8), `chat:` (11), `pipeline:` (6), `build:` (3), `catalog:` (1), `usage:` (2), `context:` (1), `pitches:` (5), `pitchRoom:` (6), `hot-take:` (1), `adhoc-revision:` (1), `verity:` (4), `revision:` (13), `motifLedger:` (3), `series:` (11), `helper:` (5), `findReplace:` (2), `dashboard:` (1), `statistics:` (2), `shell:` (2), `window:` (4).

Main→renderer event channels: `chat:streamEvent` (all agent streams, tagged callId/conversationId/source), `chat:filesChanged` (BookWatcher + post-stream), `books:changed` (BooksDirWatcher), `revision:event`, `build:progress`, `import:generationProgress`, `motifLedger:normalizing`, `window:maximized`/`window:unmaximized` (index.ts:354-359, 625, 694, 723; handlers.ts:276, 461, 545, 1005).

## Database Schema

`src/infrastructure/database/schema.ts` + `migrations.ts` (better-sqlite3, WAL, foreign keys ON; forward-only migrations v0–v3 tracked in `schema_version`). **Eight tables**:

| Table | Purpose |
|---|---|
| `conversations` | Per-book agent conversations (agent, phase, purpose, timestamps) — schema.ts:9-18 |
| `messages` | Chat turns incl. thinking text — schema.ts:20-27 |
| `token_usage` | Per-call input/output/thinking tokens by model — schema.ts:29-37 |
| `stream_events` | Persisted stream-event replay log — schema.ts:50-58 |
| `stream_sessions` | One row per CLI invocation; orphan detection via `ended_at IS NULL` partial index — schema.ts:63-77 |
| `file_versions` | SHA-256-deduped content snapshots (source: user/agent/revert) — migrations.ts v2 |
| `word_count_snapshots` | Word-count history for statistics — migrations.ts v3 |
| `schema_version` | Migration tracking — migrations.ts:80-118 |

Pruning: stream events >7 days and file versions beyond 50/file/book pruned at startup, always pinning the latest `agent` version as diff baseline (DatabaseService.ts:564-583; main/index.ts:638-658).

## Application Services

26 files in `src/application/` (incl. `context/`, `import/`). Verified one-by-one:

- **ChatService** — central orchestrator: validates provider, saves user msg, routes by purpose (pitch-room/hot-take/adhoc-revision/multi-call/standard), builds context, streams, then post-stream `ChapterValidator` + response-to-file fallback for non-tool providers (ChatService.ts:114-448). Also `deepDive`: scoped Lumen single-chapter craft critique (:771-901).
- **ContextBuilder** — single-pass deterministic context assembly + turn compaction (see Context Assembly).
- **MultiCallOrchestrator** — splits heavy agents (Sable/Lumen/Ghostlight/Forge) into sequential bounded-context calls with scratch files in `source/.scratch/`; dynamic read batches ~20K words, ≤8 batches; retries bump maxTurns +5, ≤2 retries (MultiCallOrchestrator.ts:49-805).
- **PipelineService** — phase detection (see Pipeline table) + confirmation gates persisted to `pipeline-state.json`.
- **BuildService** — assembles `dist/{slug}.md`, then Pandoc → DOCX + EPUB3 (with cover); per-format independence; no PDF (BuildService.ts:72-219).
- **AuditService** — Verity audit (VERITY-AUDIT.md on secondary model, 4096 max tokens, 120s timeout) → fix pass (VERITY-FIX.md, threshold `moderate`) → Lumen motif audit (single-call on Claude CLI, multi-call batched elsewhere) (AuditService.ts:62-652).
- **RevisionQueueService** — Wrangler-parse (WRANGLER-PARSE.md) of Forge's plan into sessions, content-hash cached in `source/revision-plan-cache.json`; 4 queue modes; approval-gate keyword detection; checkbox ticking; state in `source/revision-queue-state.json`; cycle-1/2 auto-detection (RevisionQueueService.ts:253-896).
- **HotTakeService** — Ghostlight cold-read; single call on Claude CLI, batched multi-call (≤8 batches, scratch trackers) on other providers; chat-only, no files (HotTakeService.ts:35-478). ⚠ Model = `HOT_TAKE_MODEL = CLAUDE_CLI_PRIMARY_MODEL` (constants.ts:429) — README's old "always runs on Claude Opus" claim is now wrong (it runs the primary Claude model, and other providers use the multi-call path).
- **AdhocRevisionService** — direct feedback → Forge plan; runs motif-audit pre-step; Forge writes tasks/prompts itself (AdhocRevisionService.ts:16-104).
- **VersionService** — snapshot/diff/revert; `getUserEditsSinceAgentBaseline`, `getChapterEditStatuses`, `buildAuthorEditsSection` (≤120-line unified diff injected into Verity context as "Author Edits Since Your Last Draft") (VersionService.ts:20-325).
- **ChapterValidator** — pure FS: moves/renames misplaced chapter files to `chapters/NN-slug/draft.md|notes.md`; never throws (ChapterValidator.ts:20-236).
- **ManuscriptImportService** / **SeriesImportService** — MD/TXT/DOCX (Pandoc) import, chapter detection via `import/ChapterDetector.ts` (regex: Chapter-N/headings/single-chapter fallback); series = batch + longest-common-prefix name detection.
- **SourceGenerationService** — 4 sequential agent calls post-import: Spark→pitch, Verity→outline+bible, Verity→voice-profile, Verity→motif-ledger; per-step failure tolerance (SourceGenerationService.ts:25-171).
- **MotifLedgerService** — load/save `source/motif-ledger.json`; brace-repair then single-call CLI normalization of non-canonical agent JSON (maxTurns 1) (MotifLedgerService.ts:307-404).
- **HelperService** — Helper agent + bundled `USER_GUIDE.md` as system prompt; single persistent conversation (HelperService.ts:28-164).
- **PitchRoomService** — Spark + PITCH-ROOM.md, workingDir = per-conversation draft dir (PitchRoomService.ts:22-109).
- **StreamManager** — shared stream lifecycle: buffers, saves assistant msg, records usage, ends DB session (StreamManager.ts:40-255).
- **UsageService** — records raw tokens only; **no cost calc** ("billing handled by CLI subscription", UsageService.ts:5-9).
- **StatisticsService** — usage/word-count aggregation; cost estimate uses first `MODEL_PRICING` entry generically (StatisticsService.ts:77-87).
- **DashboardService** — read-only aggregation (meta, phases, word counts, recent files, last conversation, task checkboxes) (DashboardService.ts:20-97). Feeds Library view's "Recent" line post-redesign.
- **FindReplaceService** — literal/regex preview (≤20 samples/file) + apply with pre-write snapshots (FindReplaceService.ts:17-172).
- **thinkingBudget.ts** — priority: per-message override → global override → per-agent default → disabled (thinkingBudget.ts:12-27).
- **context/TokenEstimator** — `ceil(len/4)`, no tokenizer (TokenEstimator.ts:1-8).

## Context Assembly

**The "Wrangler two-call pattern" described in AGENTS.md-era docs is NOT implemented for chat context.** Verified: no `ContextWrangler` class exists. What IS implemented:

1. **ContextBuilder** (ContextBuilder.ts:41-109): deterministic single-pass system prompt = agent prompt + file manifest (paths + word counts, NO content) + static `AGENT_READ_GUIDANCE` + optional author-edits diff + file-writing instructions + series-bible pointer. Agents read files themselves via tools.
2. **Turn compaction** (ContextBuilder.ts:217-314): budget = 200K − (system + thinking + reserve 14K); buckets generous(>40%)/moderate(8 turns)/tight(4)/critical(2) — pure arithmetic, no LLM call.
3. **MultiCallOrchestrator**: fixed sequential call pipeline for heavy agents (not a cheap-selector pattern).
4. **The only Wrangler call** is `RevisionQueueService.loadPlan` parsing Forge's plan into session JSON (cached by content hash) — plan *structure* parsing, not context selection.

## Renderer Views & Widgets

**Post-redesign (streamlined UI) structure** — verified against viewStore.ts / AppLayout.tsx:

- **Views** (`ViewId`, viewStore.ts:4-6): `library`, `workspace`, `manuscript`, `exports`, `settings`, `statistics`, `pitch-room` (+ onboarding gate in App.tsx:19-26). Legacy views (`dashboard`, `chat`, `reading`, `build`, `files`, `motif-ledger`, `revision-queue`) are **migrated** to new ones via a map (viewStore.ts:15-23) — they no longer exist as screens.
- All views stay mounted, toggled via `hidden` class (AppLayout.tsx:120-148) — state/scroll survive navigation.
- **Chrome**: TitleBar (custom, hiddenInset/hidden titleBarStyle), IconRail (56px: Library/Workspace/Manuscript/Exports + Statistics/Settings/Help), StatusBar (28px: live task indicator + session tokens + Activity drawer toggle), ActivityDrawer (resizable terminal-style drawer hosting CLI activity), CommandPalette (⌘K).
- **Library**: card-grid bookshelf + series sections + ghost cards (New Book / Pitch with Spark) + Archived/Manage-series/Import actions + Recent line (LibraryView.tsx:337-616).
- **Workspace**: PipelineSpine (left, resizable) + PhaseHeader (agent identity, artifact chips, quick actions, Mark done / Revert) + SplitPane: ChatPane ‖ CompanionPane with 5 tabs — **Chapter, Sources, Reports, Motifs, Explorer** (CompanionPane.tsx:10-16); lazy-mount, kept alive.
- **Manuscript**: ChapterRail (Front Matter/Story/Back Matter; badges AUTO/EDITED/DRAFT/EMPTY; Notes/Deep-Dive/Delete context menu; add back matter `zN-slug`) + reader (chapter/book scope w/ IntersectionObserver scroll tracking) / editor (tracked-edit banner, agent-activity lock, external-change reload bar, UserEditsDiffModal w/ discard-my-edits) + History + Find&Replace (ManuscriptView.tsx, ChapterRail.tsx, UserEditsDiffModal.tsx).
- **Exports**: format chips, build button, Pandoc warning, streaming log, output list, Download-All ZIP (ExportsView.tsx:44-172).
- **Statistics**: Recharts — tokens over time, by agent, by phase, word-count history, words/chapter, cost cards.
- **Settings**: 4 tabs — Writing (primary/secondary model pickers grouped by provider; thinking toggles + budget slider 1024–32000), Providers (built-in CLI status dots + provider cards + add OpenAI-compatible), Appearance (theme, notifications), Profile (author profile w/ "Refine with Verity", tours replay, usage, catalog export) (SettingsView.tsx).
- **Pitch Room**: PitchRail (sessions + shelved pitches) + Spark chat + Shelve action.
- **Command palette** (paletteStore.ts): groups Actions → Phases → Chapters → Books → Navigate; built-ins + dynamic providers registered by Library/Manuscript/Exports.
- **Onboarding wizard** — 5 steps: welcome → claude-setup (detects Claude AND Codex CLIs) → model-select → author-profile → ready (launch + optional first book + auto welcome tour) (OnboardingWizard.tsx:439-464).
- **Tours** (tourDefinitions.ts): `welcome` (5 steps — post-redesign targets), `first-book` (3), `pipeline-intro` (7). Spotlight overlay w/ keyboard nav (GuidedTourOverlay.tsx:90-308).
- **Other**: ChatModal (modal chat for voice-setup/author-profile/hot-take/adhoc/helper), HelperPanel (floating Help & FAQ), ErrorBoundary wrapping app, CliActivityPanel (filterable calls, phases, tools, context diagnostics, Kill button), MotifLedgerView (7 tabs, ⌘S), Series modal (volumes + bible + archive series), Import wizards, VersionHistoryModal reused across Manuscript + companion tabs.
- **25 Zustand stores** in `src/renderer/stores/` (list in renderer analysis; includes new `paletteStore`, `workspaceStore`; `rightPanelStore` is GONE).

## npm Scripts & Dependencies

Verified against `package.json` (name `novel-engine`, version `0.2.0`, license `AGPL-3.0-only`, author the.phoenix).

Scripts: `start`, `package`, `make`, `publish`, `download-pandoc`, `generate-icons`, `ci-build`, `lint` (= `tsc --noEmit`), `clean`.

Key deps (exact ranges): react ^18.3.0, zustand ^5.0.0, better-sqlite3 ^11.0.0, recharts ^3.8.1, diff ^8.0.4, marked ^15.0.0, archiver ^7.0.1, nanoid 3, undici ^7.25.0, @fontsource-variable/fraunces ^5.2.9, @fontsource/inter ^5.2.8, @fontsource/jetbrains-mono ^5.2.8, @tailwindcss/typography ^0.5.0. Dev: electron 33.4.0, electron-forge ^7.11.1 (+ makers zip/dmg/squirrel/deb/rpm, fuses, auto-unpack-natives, vite plugin), typescript ~5.5.0, vite ^5.4.21, tailwindcss ^4.0.0.

Forge config: asar, bundle id `com.novel-engine.app`; extraResource: `./resources/pandoc`, `./agents`, `./docs`; macOS notarization via APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID; Windows signing via WINDOWS_CERTIFICATE_FILE/PASSWORD; makers ZIP+DMG (macOS), Squirrel (Win), Deb+Rpm (Linux).

Path aliases: `@domain/*`, `@infra/*`, `@app/*` (tsconfig + all 3 vite configs). vite.main externals: better-sqlite3, archiver, undici.

Utility scripts: `scripts/build.js` (standalone book build MD/DOCX/EPUB/PDF w/ KDP post-processing — NOT the in-app path), `ci-build.js` (forge make + installer collection + SHA-256 checksums), `cover.js` (sharp resize 1600×2384), `download-pandoc.js` (Pandoc 3.6.4 per-platform), `generate-icons.js`, `epub.css`.

## New Features Not in Current README (investigated)

1. **Multi-provider AI backends** — Ollama CLI-first (OllamaCliRunner detect/list/serve; OllamaCodeClient agentic loop with Read/Write/Edit/LS tools, path-traversal guard, malformed-arg tolerance, 80% compaction/98% ceiling, per-model context lookup, undici no-timeout, 90s watchdog); llama-server (SSE, `<think>` tag parsing for reasoning models, fragmented tool-call accumulation); Codex CLI (`codex exec --json --sandbox workspace-write`, `--add-dir` feature detection with graceful degradation); ProviderRegistry model-index routing + settings persistence + endpoint hot-swap. (src/infrastructure/{ollama-cli,llama-server,codex-cli,providers}/)
2. **Streamlined workspace UI** — entire new shell: Library, Workspace (spine + split pane + companion tabs), Manuscript, command palette, icon rail, status bar + activity drawer, Fraunces/Inter/JetBrains Mono typography. Replaces Dashboard/Chat/Files/Build/Reading/RightPanel views.
3. **Tracked chapter editing** — editor unlocked; EDITED badges; UserEditsDiffModal + discard-my-edits; author-edits diff injected into Verity context (`buildAuthorEditsSection`); agent-activity editing lock; external-change reload bar.
4. **Version history everywhere** — reusable VersionHistoryModal from Manuscript toolbar + Chapter/Sources/Reports/Explorer tabs.
5. **Chapter Deep Dive** — Lumen single-chapter craft critique from chapter rail (`chat:deepDive`, ChatService.ts:771-901; useChapterDeepDive.ts).
6. **Dual primary/secondary model pickers** — secondary model drives audit passes; picker never switches active provider (SettingsView.tsx:115-285).
7. **Claude Fable 5 probe** — `probeFableModel()` at startup adds `claude-fable-5` if the CLI accepts it (main/index.ts:300-333).
8. **Multi-call orchestration** — heavy agents batched for non-Claude providers (hot take, motif audit, Sable/Lumen/Ghostlight/Forge pipeline steps).
9. **Back matter chapters** — `zN-slug` folders creatable from chapter rail.
10. **Build ZIP export** — `build:exportZip` (dist output), distinct from catalog export.
11. **Context diagnostics** — `context:getLastDiagnostics` surfaced in CLI activity panel.
12. Existing-but-undocumented odds: PATH fix via login shell (main/index.ts:19-34), `novel-asset://` cover protocol, orphaned-session recovery, `.scratch` trackers.

## Phantom Features in Current README (claims with no/changed code)

1. **"Sidebar Bookshelf" (BookPanel)** — component deleted; Library view replaced it (no `src/renderer/components/Sidebar/BookPanel.tsx` post-redesign; viewStore migration map).
2. **"Five-Tab Files View"** — FilesView no longer a routed view; companion tabs are Chapter/Sources/Reports/Motifs/Explorer (CompanionPane.tsx:10-16).
3. **"Book Overview Dashboard" view** — `dashboard` view removed (migrated to `library`); DashboardService only feeds Library "Recent" line + ChapterTab heuristics.
4. **"Reading Mode" view** — merged into Manuscript reader (book scope); no ReadingModeView.
5. **Hot Take "always runs on Claude Opus"** — actually `HOT_TAKE_MODEL = CLAUDE_CLI_PRIMARY_MODEL` and non-Claude providers use a multi-call path (constants.ts:429; HotTakeService.ts:35-478).
6. **"Revision Queue... Wrangler call (Claude Sonnet)"** — Wrangler runs via the provider registry on the configured model; not pinned to Sonnet (RevisionQueueService.ts:357-503).
7. **"passes `--effort high` to the Claude CLI"** — still true (ClaudeCodeClient.ts:226-242) but framed under the old UI; keep, reworded.
8. **Screenshots** — all 12 referenced `screenshots/Screenshot 2026-03-29 ...` files were deleted; 9 new `Screenshot 2026-07-08 at 3.2*.png` files exist (git status; screenshots/).
9. **"170 TypeScript/TSX files"** — actual count now **187** (find src -name '*.ts' -o -name '*.tsx').
10. **"23 stores"** — actually **25** stores; `rightPanelStore` gone, `paletteStore`/`workspaceStore` added.
11. **src/ tree** — outdated: missing `codex-cli/`, `ollama-cli/`, `llama-server/`, `MultiCallOrchestrator.ts`, `Workbench/`, `Library/`, `Manuscript/`, `Palette/`, `PipelineSpine/`, `Rail/`, `StatusBar/`, `Exports/`; lists removed `Build/`, `Dashboard/`, `Reading/`, `RightPanel/`, `StructuredBrowser` etc.
12. **Prerequisites "Node.js 18+ / Claude Code CLI required"** — reframe: at least one provider (Claude CLI, Codex CLI, Ollama, llama-server, or OpenAI-compatible endpoint) is needed; Claude CLI is the flagship path.
13. **`AGENTS.md` described as "full architecture documentation"** — AGENTS.MD is actually a documentation/changelog maintenance role; the architecture docs live in `docs/architecture/*.md` (AGENTS.MD:1-9).
14. **CHAPTER_VALIDATION.md** — does not exist at repo root (referenced by the readme-deep-update prompt's Step 8; do not link it).
15. **Database "Seven SQLite tables"** — now **eight** (word_count_snapshots added by migration v3).

## Preserved Sections (copied verbatim)

⚠ **Discrepancy vs prompt**: the prompt says preserve `# Heads up`, `# Dedication`, `# Questions, comments, or rants?` — but the current README contains **no "Heads up" and no "Questions..." section**. It has `# Dedication` and `# Foreword`. Preserve those two verbatim (below), in current order, before `# Novel Engine`.

### # Dedication (README.md:1-5, verbatim)

```markdown
# Dedication
*To everyone who has an idea for a good book but doesn't know how to craft it, this is for you...*

*For everyone else who may be impacted by this work, or whose sensibilities I have offended.*
*I am so sorry.  I just wanted to write my memoir and found out it is easier to write fiction than fact. This is the result.*
```

### # Foreword (README.md:7-20, verbatim)

```markdown
# Foreword
Books created in this engine
- [The Last Compiler](https://www.amazon.com/dp/B0GTPJWFQ7)
- [The Lien](https://www.amazon.com/dp/B0GT13J22M)
- [Cleartext](https://www.amazon.com/dp/B0GTN8DRM8)
- [Project Sephirot](https://www.amazon.com/dp/B0GJ6S4N9G)
- [The Recursive Archivist](https://www.amazon.com/dp/B0GTP2KB7Q)
- [Day One](https://www.amazon.com/dp/B0GTQKZQSY)
- [Reset](https://www.amazon.com/dp/B0GT6Z8T7Y)
- [The Empty Orbit](https://www.amazon.com/dp/B0GT2JP9D5)
- [The Keeper's Frequency](https://www.amazon.com/dp/B0GTF4H6F8)
- [Junk Souls](https://www.amazon.com/dp/B0GTMGN843)

I asked Claude and ChatGPT to audit ten books made in the MVP and this product with extended thinking on - [here are the results](https://john-paul-ruf.github.io/novel-engine/evaluation.html)
```

Also worth carrying forward (author-voice content, not in the preservation list): the "🧪 Testers Needed!" blockquote (README.md:35-46) — email link `john.paul.ruf@gmail.com` lives here; this fills the role of the missing "Questions, comments, or rants?" section.

## src/ Tree & userData Tree

**src/** (actual, 187 .ts/.tsx: domain 5, application 26, infrastructure 31, main 4, preload 1, renderer 120):

```
src/
├── domain/            types.ts, interfaces.ts, constants.ts, statusMessages.ts, index.ts
├── infrastructure/
│   ├── settings/      SettingsService.ts
│   ├── database/      schema.ts, migrations.ts, DatabaseService.ts
│   ├── agents/        AgentService.ts
│   ├── filesystem/    FileSystemService.ts, BookWatcher.ts, BooksDirWatcher.ts
│   ├── claude-cli/    ClaudeCodeClient.ts, StreamSessionTracker.ts
│   ├── codex-cli/     CodexCliClient.ts
│   ├── ollama-cli/    OllamaCliRunner.ts, OllamaCodeClient.ts, ToolExecutor.ts, tools.ts, contextCompactor.ts
│   ├── llama-server/  LlamaServerClient.ts
│   ├── providers/     ProviderRegistry.ts, OpenAiCompatibleProvider.ts
│   ├── series/        SeriesService.ts
│   └── pandoc/        index.ts
├── application/       ChatService, ContextBuilder, MultiCallOrchestrator, PipelineService,
│                      BuildService, AuditService, RevisionQueueService, HotTakeService,
│                      AdhocRevisionService, PitchRoomService, VersionService, ChapterValidator,
│                      MotifLedgerService, ManuscriptImportService, SeriesImportService,
│                      SourceGenerationService, HelperService, DashboardService, StatisticsService,
│                      FindReplaceService, StreamManager, UsageService, thinkingBudget.ts,
│                      context/TokenEstimator.ts, import/ChapterDetector.ts
├── main/              index.ts (composition root), bootstrap.ts, notifications.ts, ipc/handlers.ts
├── preload/           index.ts (window.novelEngine bridge)
└── renderer/          App.tsx, main.tsx, stores/ (25), hooks/ (7), tours/,
                       components/ {Chat, CliActivity, ErrorBoundary, Exports, Files, Helper,
                       Import, Layout, Library, Manuscript, MotifLedger, Onboarding, Palette,
                       PipelineSpine, PitchRoom, Rail, RevisionQueue, Series, Settings, Sidebar,
                       Statistics, StatusBar, Workbench, common}
```

**userData/** (verified against FileSystemService.ts + bootstrap.ts):

```
{userData}/
├── .initialized  settings.json  novel-engine.db  active-book.json  author-profile.md  USER_GUIDE.md
├── custom-agents/           # editable agent .md prompts, restored (never overwritten) at startup
├── series/{slug}/           # series.json + series-bible.md
└── books/
    ├── _archived/{slug}/
    ├── _pitches/{slug}.md
    ├── __pitch-room__/drafts/{convId}/source/pitch.md
    └── {slug}/
        ├── about.json  cover.{jpg|png|webp|gif}  pipeline-state.json
        ├── source/     # pitch, scene-outline, story-bible, voice-profile, reports, tasks/prompts,
        │               # metadata, style-sheet, motif-ledger.json, revision-plan-cache.json,
        │               # revision-queue-state.json, .scratch/ (multi-call trackers)
        ├── chapters/00-0-copyright/ 00-1-dedication/ NN-slug/{draft.md,notes.md} zN-slug/ (back matter)
        ├── assets/
        └── dist/       # {slug}.md, .docx, .epub
```

## License

**AGPL-3.0-only** — verified: `LICENSE` file is GNU AGPL v3 (19 Nov 2007 text); `package.json` license `AGPL-3.0-only`; forge RPM maker agrees.

## Misc verified facts for SESSION-03/07

- Window: 1400×900 (min 900×600), hiddenInset title bar, contextIsolation on, nodeIntegration off (main/index.ts:337-350).
- Claude CLI invocation: `--print --output-format stream-json --verbose --model X --max-turns N --system-prompt-file <tmp> --allowedTools Read,Write,Edit,LS,Bash(...) --add-dir <booksDir> [--effort high]` (ClaudeCodeClient.ts:226-242).
- Notifications: chat complete/error, revision session/queue complete, build complete; fire only when unfocused; click focuses (notifications.ts:23-104).
- Onboarding CLI step detects both Claude and Codex CLIs ("Check Providers").
- Version to quote: **v0.8.0** (per RELEASE_NOTES.md; package.json 0.2.0 is decoupled from tags — do not quote it as the release version).
- Agent count language: "seven creative agents" remains true for the editorial team; total registry is nine including internal Wrangler + Helper.
