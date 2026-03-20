# Novel Engine Electron App — Build Sessions

## How to Use These Prompts

There are **18 sessions** below. Run them **in order**, one at a time, in WebStorm with Zencoder. Each session prompt:

- Is self-contained — paste the whole thing into a fresh Zencoder chat
- States exactly what files to create or modify
- Specifies the architecture rules to follow
- Ends with a verification step so you know it worked

**Before each session:** Commit your git state. If something goes wrong, you can reset.

```bash
git add -A && git commit -m "Before session N"
```

**During each session:** Paste the prompt. Let the agent work. Review the output. If it needs tweaks, stay in the same chat and iterate.

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
│  Infrastructure (DB, API, filesystem)        │  ← Implements Domain interfaces
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
│   ├── settings/           # API key storage, app preferences
│   ├── database/           # SQLite schema, repositories
│   ├── agents/             # Agent .md file loader
│   ├── filesystem/         # Book CRUD, file I/O
│   ├── anthropic/          # API client, streaming, thinking
│   └── pandoc/             # Binary resolution, exec wrapper
│
├── application/            # Business logic / orchestration
│   ├── ChatService.ts      # Agent + context + API + history
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
| 03 | Settings infrastructure | Encrypted API key, app preferences | 15 min |
| 04 | Database infrastructure | SQLite schema, conversation/message/usage repos | 20 min |
| 05 | Agent loader | Reads agent .md files, returns typed data | 10 min |
| 06 | Filesystem infrastructure | Book CRUD, active-book, file I/O | 15 min |
| 07 | Anthropic client | API wrapper with streaming + extended thinking | 20 min |
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

**Total: ~5–6 hours of session time** (not counting review and iteration).

---

## Prompt Files

Each session prompt is in this folder, numbered `SESSION-01.md` through `SESSION-18.md`. Open the next one, paste it into Zencoder, and go.
