# Novel Engine Electron App — Build Sessions

## How to Use These Prompts

There are **19 sessions** below. Run them **in order**, one at a time, using the Claude Code CLI. Each session prompt:

- Is self-contained — paste the whole thing into a fresh Claude Code session
- States exactly what files to create or modify
- Specifies the architecture rules to follow
- Ends with a verification step so you know it worked

**Before each session:** Commit your git state. If something goes wrong, you can reset.

```bash
git add -A && git commit -m "Before session N"
```

**During each session:** Paste the prompt. Let the agent work. Review the output. If it needs tweaks, stay in the same session and iterate.

**After each session:** Run the verification step at the bottom of each prompt. If it passes, commit and move on.

---

## Architecture Overview

This app follows **Clean Architecture** with strict layer boundaries:

```
┌─────────────────────────────────────────────┐
│  Presentation (React components, stores)     │  ← Knows about Application
├─────────────────────────────────────────────┤
│  IPC Adapter (handlers + preload bridge)     │  ← Translates between UI and App
├─────────────────────────────────────────────┤
│  Application (services, use cases)           │  ← Knows about Domain + Infra
├─────────────────────────────────────────────┤
│  Infrastructure (DB, Claude CLI, filesystem)  │  ← Implements Domain interfaces
├─────────────────────────────────────────────┤
│  Domain (types, interfaces, constants)       │  ← Knows about NOTHING
└─────────────────────────────────────────────┘
```

**Rules:**
1. Domain has zero imports from any other layer
2. Infrastructure implements interfaces defined in Domain
3. Application orchestrates Infrastructure — it never touches Electron or React
4. IPC is a thin adapter that calls Application services and returns plain objects
5. Presentation (React) only talks through the preload bridge — never imports main-process code

**Directory map:**

```
src/
├── domain/                 # Types, interfaces, constants — NO implementations
│   ├── types.ts            # All shared types
│   ├── interfaces.ts       # Service interfaces (ports)
│   └── constants.ts        # Agent metadata, pipeline phases, defaults
│
├── infrastructure/         # Concrete implementations of domain interfaces
│   ├── settings/           # CLI detection, app preferences
│   ├── database/           # SQLite schema, repositories
│   ├── agents/             # Agent .md file loader
│   ├── filesystem/         # Book CRUD, file I/O
│   ├── claude-cli/         # Claude Code CLI wrapper, streaming, thinking
│   └── pandoc/             # Binary resolution, exec wrapper
│
├── application/            # Business logic / orchestration
│   ├── ChatService.ts      # Agent + context + CLI + history
│   ├── ContextBuilder.ts   # Per-agent context assembly + token budgeting
│   ├── PipelineService.ts  # Phase detection, transitions
│   ├── BuildService.ts     # Manuscript assembly + Pandoc
│   └── UsageService.ts     # Token tracking + cost estimation
│
├── main/                   # Electron main process entry
│   ├── index.ts            # App lifecycle, window creation
│   ├── ipc/                # IPC handler registrations
│   │   └── handlers.ts     # One file, calls Application services
│   └── bootstrap.ts        # First-run setup
│
├── preload/                # Context bridge
│   └── index.ts            # Typed API exposed to renderer
│
└── renderer/               # React UI
    ├── App.tsx
    ├── main.tsx
    ├── stores/             # Zustand state
    ├── components/         # UI components
    ├── hooks/              # Custom hooks
    └── styles/
```

---

## Session List

| # | Session | What It Produces | Approx Time |
|---|---------|-----------------|-------------|
| 01 | Project scaffold | Working Electron + Vite + React + TS shell | 20 min |
| 02 | Domain layer | All types, interfaces, constants | 15 min |
| 03 | Settings infrastructure | Claude CLI detection, app preferences | 15 min |
| 04 | Database infrastructure | SQLite schema, conversation/message/usage repos | 20 min |
| 05 | Agent loader | Reads agent .md files, returns typed data | 10 min |
| 06 | Filesystem infrastructure | Book CRUD, active-book, file I/O | 15 min |
| 07 | Claude Code CLI client | CLI wrapper with streaming + extended thinking | 20 min |
| 08 | Context builder | Per-agent context assembly, token budgeting | 15 min |
| 09 | Chat service | Orchestrates the full send→stream→save cycle | 20 min |
| 10 | Pipeline + Build services | Phase detection, Pandoc wrapper | 15 min |
| 11 | IPC + Preload wiring | Typed handlers and context bridge | 20 min |
| 12 | Main process + bootstrap | App entry, first-run init, window creation | 15 min |
| 13 | UI shell + stores | App layout, routing, Zustand stores, theme | 20 min |
| 14 | Onboarding + Settings UI | First-run wizard, settings panel | 20 min |
| 15 | Sidebar UI | Book list, pipeline tracker, file tree | 25 min |
| 16 | Chat UI + thinking blocks | Messages, streaming, thinking panel | 30 min |
| 17 | File viewer + Build panel | Markdown preview/edit, build progress | 20 min |
| 18 | Packaging + Pandoc bundling | Forge config, scripts, CI/CD | 15 min |
| 19 | Agent output persistence | Save-to-file for agent responses | 20 min |
| 20 | Voice & Author Profile setup | Guided Verity conversations for voice-per-book + global author profile | 25 min |

**Total: ~6–8 hours of session time** (not counting review and iteration).

---

## Prompt Files

Each session prompt is in this folder, numbered `SESSION-01.md` through `SESSION-20.md`. Open the next one, paste it into Claude Code, and go.

---

## Errata Applied

The following fixes have been applied to the session prompts (2026-03-20):

1. **SESSION-01:** Added native module externalization (`better-sqlite3`, `execa`) in `vite.main.config.ts`; removed `@anthropic-ai/sdk` in favor of Claude Code CLI
2. **SESSION-02:** Fixed `AGENT_REGISTRY` filenames to match actual agent files (`FORGE.MD`, `Quill.md`); added `thinkingTokens` to `StreamEvent.done`
3. **SESSION-06:** Added documentation for `getBookMeta()` and `updateBookMeta()` implementations
4. **SESSION-07:** Updated `done` event to include `thinkingTokens` estimated from thinking buffer length
5. **SESSION-09:** Updated usage recording to use `thinkingTokens` from done event; noted Session 10 will add 7th dependency
6. **SESSION-10:** Replaced deprecated `wkhtmltopdf` PDF engine with Pandoc's default LaTeX engine; added linear pipeline design note
7. **SESSION-11:** Added explicit `import type` statements to preload; added `agents.get` to preload bridge; fixed `books:create` to pass `authorName` from settings
8. **SESSION-12:** Added `db.close()` cleanup on `before-quit` to prevent WAL corruption
9. **SESSION-13:** Added `ErrorBoundary` component; added loading state before settings load; fixed `sendMessage` error handling; clarified `viewStore` initialization
10. **SESSION-14:** Fixed onboarding Step 5 to include inline book creation instead of depending on Session 15's BookSelector
11. **SESSION-16:** Fixed outdated `marked` sanitization note; added conversation usage tracking for AgentHeader display
12. **SESSION-18:** Fixed `.md` ignore pattern to not exclude agent files; added Content Security Policy task

### Errata Round 2 — Deep Audit (2026-03-20)

13. **SESSION-02:** Added `renameFile(bookSlug, oldPath, newPath)` to `IFileSystemService` — required by Session 19's version archiving logic
14. **SESSION-06:** Added `renameFile` implementation using `fs.rename` from `node:fs/promises`
15. **SESSION-07:** Replaced temp-file-based `--system-prompt` with inline string — the CLI flag accepts text, not file paths. Node's `spawn`/`execve` supports args up to ~2MB, well above agent prompt sizes
16. **SESSION-11:** Added `shell:openExternal` IPC handler + preload bridge for opening URLs in OS browser; added `settings:getAvailableModels` handler to expose `AVAILABLE_MODELS` constant to renderer without violating the "no domain value imports" rule; moved `shell.openPath` and `shell.openExternal` into preload bridge
17. **SESSION-14:** Replaced all `window.open()` calls with `window.novelEngine.shell.openExternal()` — `window.open()` creates Electron windows, not OS browser tabs; changed model list source from `AVAILABLE_MODELS` import to `window.novelEngine.models.getAvailable()` IPC call
18. **SESSION-16:** Fixed `conversationUsage` type from `UsageSummary | null` to `UsageRecord[] | null` — `byConversation` returns individual records, not an aggregated summary
19. **SESSION-17:** Removed duplicate `shell:openPath` preload entry (now in Session 11); added `shell.openExternal` for Pandoc install link
20. **Moved `architect.md`** from `agents/` to `prompts/` to prevent bootstrap from copying it to the user's custom-agents directory

### Errata Round 3 — Design Refinements (2026-03-20)

21. **SESSION-13:** Added `totalWordCount: number` to `bookStore` shape; documented `refreshWordCount` implementation (sums chapter word counts via IPC, equivalent to `cat chapters/*/draft.md | wc -w`)
22. **SESSION-15:** Made the BookSelector's closed state **always show total word count** below the book title (e.g., "42,318 words") — this is the persistent at-a-glance word count display; added `bookStore.refreshWordCount()` to the data loading sequence
23. **SESSION-17:** Complete rewrite of Task 1 (FilesView) — **removed all edit mode** (no textarea, no Edit/Save/Cancel buttons, no unsaved changes warning). The app is read-only except for book title and author name, which are inline-editable on the `about.json` card. All other content is produced by agents and saved via Session 19's "Save to File". Added Task 3 zip export: `build:exportZip` IPC handler using `archiver` npm package + `dialog.showSaveDialog` → bundles all `dist/` artifacts into a zip. Added `archiver` dependency. Added "Download All" button to BuildView. Added Task 4 pipeline gate: explicit check that `dist/output.md` exists before allowing Quill's publish phase to start

### Errata Round 4 — Pitch Document + Scaffold Phase (2026-03-20)

24. **SESSION-02:** Added `pitch: string` field to `BookContext` type. Added `'scaffold'` to `PipelinePhaseId`. Changed Spark's role from `'Pitch & Scaffold'` to `'Story Pitch'`. Added new `scaffold` phase to `PIPELINE_PHASES` (agent: Verity, label: "Story Scaffold") between pitch and first-draft. Updated pitch phase label/description to reflect its narrowed scope.
25. **SESSION-06:** Added `pitch` → `source/pitch.md` to the `loadBookContext` field-to-filename mapping
26. **SESSION-08:** Promoted `pitch` to Priority 1 in Verity's context (it's her primary input during scaffolding). Added `pitch` to Lumen's context at Priority 4. Updated Spark's label from "Pitch & Scaffold" to "Story Pitch".
27. **SESSION-10:** Changed pitch phase detection from `source/scene-outline.md` to `source/pitch.md`. Added scaffold phase detection: complete when `source/scene-outline.md` exists (Verity builds the outline from the pitch).
28. **SESSION-19:** Changed `AGENT_OUTPUT_TARGETS` from single-target to multi-target per phase: type is now `Partial<Record<PipelinePhaseId, OutputTarget[]>>`. Added `OutputTarget` type. Pitch phase now has one target: `source/pitch.md`. New scaffold phase has two targets: `source/scene-outline.md` ("Save as Scene Outline") and `source/story-bible.md` ("Save as Story Bible"). Updated `FilePersistenceService.saveAgentOutput` to accept `targetPath` param. Updated IPC and preload accordingly. Updated `MessageBubble` to render one save button per target. Scaffold pipeline detection gates on `scene-outline.md` — the story bible is supplementary.
29. **architect.md:** Updated pipeline detection table and per-agent context loading table

### Errata Round 5 — Voice Profile & Author Profile Conversational Setup (2026-03-20)

30. **SESSION-02:** Added `ConversationPurpose` type (`'pipeline' | 'voice-setup' | 'author-profile'`). Added `purpose: ConversationPurpose` field to `Conversation` type. Added `purpose?: ConversationPurpose` optional param to `IContextBuilder.build()` in `interfaces.ts`.
31. **SESSION-02 (constants):** Added `VOICE_SETUP_INSTRUCTIONS` and `AUTHOR_PROFILE_INSTRUCTIONS` constants — purpose-specific prompt appendices for Verity's voice interview and author profile interview protocols.
32. **SESSION-04:** Added `purpose TEXT NOT NULL DEFAULT 'pipeline'` column to `conversations` table schema. Added migration check for existing databases (`ALTER TABLE` if column missing). Updated `DatabaseService` CRUD to include `purpose` in all conversation queries.
33. **SESSION-08:** Added optional `purpose?: ConversationPurpose` param to `ContextBuilder.build()`. When `purpose === 'voice-setup'`, loads only voice profile + author profile. When `purpose === 'author-profile'`, loads only existing author profile. Pipeline purpose uses existing behavior unchanged.
34. **SESSION-09:** Updated `ChatService.sendMessage` step 6 to append `VOICE_SETUP_INSTRUCTIONS` or `AUTHOR_PROFILE_INSTRUCTIONS` to system prompt based on conversation purpose. Updated `createConversation` to accept and pass `purpose` parameter.
35. **SESSION-11:** Updated `chat:createConversation` handler to accept `purpose` param. Updated preload `chat.createConversation` signature to include optional `purpose`. Added `ConversationPurpose` to preload's `import type` list.
36. **SESSION-13:** Updated `chatStore.createConversation` to accept `purpose: ConversationPurpose = 'pipeline'` as fourth parameter.
37. **SESSION-14:** Replaced Author Profile textarea in Settings with: markdown preview of current profile, "Set Up with Verity" / "Refine with Verity" button (opens author-profile purpose conversation), and collapsible "Edit Manually" fallback textarea. Simplified onboarding Step 4 to keep textarea for quick entry with "Skip" option and note about Verity refinement later.
38. **SESSION-16 (MessageBubble):** Extended save button logic to check `activeConversation.purpose` in addition to `pipelinePhase`. Voice-setup conversations show "Save as Voice Profile" → writes via `files:write`. Author-profile conversations show "Save as Author Profile" → writes via `settings:saveAuthorProfile`. Uses sentinel path `__author-profile__` to distinguish IPC routing.
39. **SESSION-15 (Sidebar):** Added `VoiceSetupButton` component between BookSelector and PipelineTracker. Shows "Set Up Voice Profile" with purple accent. Resumes existing voice-setup conversation if one exists for the active book, otherwise creates new one with Verity.
40. **SESSION-16 (ConversationList):** Added purple "Voice Setup" and "Author Profile" badges on conversations with non-pipeline purpose.
