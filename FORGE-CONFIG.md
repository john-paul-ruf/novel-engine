# Forge Config — Novel Engine

> Persistent program-level configuration. Created on first Forge run.
> Referenced by all feature builds. Edit directly to change defaults.
> Forge reads this before every run — values here override detection.

---

## Program

**Name:** Novel Engine
**Root:** /Users/the.phoenix/WebstormProjects/novel-engine/
**Source directory:** src/

---

## Stack

**Language(s):** TypeScript 5
**Runtime:** Node.js 22 (Electron 33)
**Framework(s):** Electron Forge, React 18, Tailwind CSS v4
**Package manager:** npm
**Build system:** Vite (via Electron Forge Vite plugin)
**Test framework:** None (manual verification via `npx tsc --noEmit`)

---

## Architecture

**Pattern:** Clean Architecture — five strict layers
**Dependency flow:** `DOMAIN <- INFRASTRUCTURE <- APPLICATION <- IPC/MAIN <- RENDERER` — no reverse imports
**Dependency injection:** Manual composition root in `src/main/index.ts`. Services depend on injected interfaces, never concrete classes.
**State management:** Zustand stores in `src/renderer/stores/`. IPC bridge is the only renderer-to-backend channel.
**Entry point(s):** `src/main/index.ts` (Electron main), `src/preload/index.ts` (context bridge), `src/renderer/main.tsx` (React root)

---

## Module Registry

| ID | Module | Path | Owns | Imports From | Key Files |
|----|--------|------|------|-------------|-----------|
| `M01` | domain | `src/domain/` | Types, interfaces, constants — pure TypeScript, zero runtime deps | nothing | `types.ts, interfaces.ts, constants.ts, index.ts` |
| `M02` | settings | `src/infrastructure/settings/` | App preferences, CLI detection, settings.json I/O | `M01` | `SettingsService.ts, index.ts` |
| `M03` | database | `src/infrastructure/database/` | SQLite persistence — conversations, messages, usage, file versions, stream sessions | `M01` | `schema.ts, DatabaseService.ts, index.ts` |
| `M04` | agents | `src/infrastructure/agents/` | Loads agent .md files from disk, matches against AGENT_REGISTRY | `M01` | `AgentService.ts, index.ts` |
| `M05` | filesystem | `src/infrastructure/filesystem/` | Book CRUD, file I/O, directory listing, cover images, archive, slugs, series, shelved pitches, pitch room drafts | `M01` | `FileSystemService.ts, BookWatcher.ts, BooksDirWatcher.ts, index.ts` |
| `M06` | claude-cli | `src/infrastructure/claude-cli/` | Spawns `claude` CLI process, streams NDJSON, manages lifecycle | `M01` | `ClaudeCodeClient.ts, StreamSessionTracker.ts, index.ts` |
| `M07` | pandoc | `src/infrastructure/pandoc/` | Pandoc binary path resolution (dev vs packaged) | `M01` | `index.ts` |
| `M08` | application | `src/application/` | Business logic and orchestration — all services depend on injected interfaces | `M01` (interfaces only) | `ChatService.ts, PipelineService.ts, BuildService.ts, UsageService.ts, ContextWrangler.ts, FindReplaceService.ts, ...` |
| `M09` | main/ipc | `src/main/`, `src/preload/` | Composition root, thin IPC adapter, contextBridge exposure | `M08, M01` | `index.ts, ipc/handlers.ts, preload/index.ts` |
| `M10` | renderer | `src/renderer/` | React UI — stores, components, views. Backend access only via `window.novelEngine` | `M09` (bridge only) + `M01` type imports | `stores/, components/, App.tsx, main.tsx` |

---

## Conventions

**Naming:**
- Files: `camelCase.ts` for utilities/stores/domain, `PascalCase.tsx` for components, `PascalCaseService.ts` for infrastructure/application
- Types/interfaces: `PascalCase` type names
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`

**Path aliases:**
- `@domain/*` -> `src/domain/*`
- `@infra/*` -> `src/infrastructure/*`
- `@app/*` -> `src/application/*`

**Error handling:** `try/catch` with error propagation. No swallowed errors.
**Logging:** `console.error` for caught errors.
**Documentation:** Inline JSDoc on public service methods. Architecture docs in `docs/architecture/`.

---

## Security

- `contextIsolation: true` always
- `nodeIntegration: false` always
- No API keys stored
- All renderer-to-main communication via preload bridge only

---

## Book Directory Structure

```
{userData}/
  books/{slug}/
    about.json
    source/
      pitch.md, scene-outline.md, story-bible.md, voice-profile.md, ...
    chapters/NN-slug/
      draft.md
      notes.md
    dist/
  books/_archived/{slug}/
  series/{slug}/
    series.json
    series-bible.md
  pitch-room/{conversationId}/
  shelved-pitches/
  author-profile.md
  active-book.json
  settings.json
```

---

## Verification Commands

**Type check:** `npx tsc --noEmit`
**Build:** `npm run build`
**Run dev:** `npm start`

---

## Git

**Commit format:** `feat({feature}): SESSION-NN — {title}`
**Branch strategy:** Trunk-based (main branch)

---

## Program Output Directory

All programs (MASTER.md, STATE.md, SESSION-NN.md files) are written to:

```
prompts/session-program/program-NNN/
```

Where `NNN` is a zero-padded sequential number (`001`, `002`, `003`, ...). To determine the next number, list `prompts/session-program/` and increment from the highest existing `program-NNN` directory.

**Input files** (feature requests, specs, raw notes that were the source material for the program) go in:
```
prompts/session-program/program-NNN/input-files/
```

**Never** write programs to `prompts/feature-requests/`, `prompts/feature/`, or any other location.

---

## Session Defaults

**Max session effort:** 30 min
**Max session prompt length:** 200 lines
**Architecture compliance checks:**
- Domain imports from nothing external
- Infrastructure imports only from domain + Node.js builtins + npm packages
- Application imports only from domain (interfaces, not concrete classes)
- IPC handlers contain zero business logic
- Renderer accesses backend only through `window.novelEngine`
- No `any` types
- All async operations have error handling
- Every new infrastructure subdirectory has an `index.ts` barrel export

---

## Custom Rules

- The preload bridge (`window.novelEngine`) is the ONLY renderer-to-main channel.
- Composition root `src/main/index.ts` is the ONLY place concrete classes are instantiated.
- Zustand stores call IPC via `window.novelEngine.*` only.
- `import type` from `@domain/*` is permitted in renderer. Value imports from `@domain/constants` are permitted for pure data constants with zero Node.js deps.
- IPC channel names: `'namespace:action'` pattern.
