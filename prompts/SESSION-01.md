# Session 01 — Project Scaffold

## Context

I'm building an Electron desktop app called "Novel Engine" — a multi-agent AI writing tool. This is the very first session. I need you to scaffold the project from scratch.

## Task

Create a new Electron project using **Electron Forge with the Vite + TypeScript template**, then add React and all core dependencies. The project should compile and show a window when run.

## Exact Steps

### 1. Initialize the project

Run the Electron Forge create command with the Vite TypeScript template. Project name: `novel-engine`.

### 2. Install these exact dependencies

**Runtime:**
- `react`, `react-dom`
- `zustand` (state management)
- `better-sqlite3` (local database)
- `@anthropic-ai/sdk` (Claude API)
- `execa@^5` (for running Pandoc — pin to v5, the last CJS-compatible version)
- `marked` (markdown rendering)
- `@tailwindcss/typography` (prose classes for rendered markdown)
- `nanoid` (ID generation)

**Dev:**
- `@types/react`, `@types/react-dom`
- `@types/better-sqlite3`
- `@vitejs/plugin-react`
- `tailwindcss`, `@tailwindcss/vite`
- `postcss`, `autoprefixer`

### 3. Create this directory structure

```
novel-engine/
├── src/
│   ├── domain/                 # Empty dir for now
│   ├── infrastructure/         # Empty dir for now
│   ├── application/            # Empty dir for now
│   ├── main/
│   │   ├── index.ts            # Electron main process entry
│   │   └── ipc/                # Empty dir for now
│   ├── preload/
│   │   └── index.ts            # Basic preload with contextBridge
│   └── renderer/
│       ├── App.tsx             # Simple React component
│       ├── main.tsx            # React entry point
│       └── styles/
│           └── globals.css     # Tailwind directives
├── agents/                     # Will hold agent .md files
├── resources/                  # Will hold Pandoc binaries
├── forge.config.ts
├── vite.main.config.ts
├── vite.preload.config.ts
├── vite.renderer.config.ts
├── tsconfig.json
└── package.json
```

### 4. Configure the main process (`src/main/index.ts`)

- Create a single `BrowserWindow` with:
  - Size: 1400x900, min 900x600
  - `titleBarStyle: 'hiddenInset'` on macOS
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - Preload script pointed at the preload entry
- Standard `app.whenReady()`, `window-all-closed`, `activate` lifecycle handlers
- Nothing else — no IPC handlers yet

### 5. Configure the preload (`src/preload/index.ts`)

- Import `contextBridge` from `electron`
- Expose an empty `window.novelEngine` object (we'll add methods in session 11)
- Add the TypeScript global type declaration for `window.novelEngine`

### 6. Configure the renderer

- `src/renderer/main.tsx`: Standard React 18 `createRoot` mounting `<App />`
- `src/renderer/App.tsx`: A simple component that renders "Novel Engine" centered on screen. Use Tailwind classes. Dark background (`bg-gray-950 text-gray-100`).
- `src/renderer/styles/globals.css`: Tailwind directives — `@import "tailwindcss"` and `@plugin "@tailwindcss/typography"` (enables `prose` classes for markdown rendering)

### 7. Configure Vite

- `vite.renderer.config.ts`: Add `@vitejs/plugin-react` and `@tailwindcss/vite` plugins
- Make sure the renderer config resolves `.tsx` files
- Ensure path aliases work **in all three Vite configs** (main, preload, and renderer): `@domain/*` → `src/domain/*`, `@infra/*` → `src/infrastructure/*`, `@app/*` → `src/application/*`
- The preload config needs these aliases because it will use `import type` from `@domain` in Session 11

**Critical: Native module and CJS externalization in `vite.main.config.ts`:**

`better-sqlite3` is a native Node module (N-API) that **cannot** be bundled by Vite. `execa@^5` is a CJS package that may have interop issues in Vite's ESM bundling. Both must be externalized:

```typescript
// vite.main.config.ts
build: {
  rollupOptions: {
    external: ['better-sqlite3', 'execa'],
  },
}
```

Also externalize `@anthropic-ai/sdk` since it makes network requests and has no benefit from bundling:

```typescript
external: ['better-sqlite3', 'execa', '@anthropic-ai/sdk'],
```

This ensures these packages are loaded at runtime from `node_modules` rather than being bundled.

### 8. Configure TypeScript

- `tsconfig.json`: Strict mode, `jsx: 'react-jsx'`, `esModuleInterop: true`
- Path aliases matching the Vite config: `@domain/*`, `@infra/*`, `@app/*`
- Target: `ES2022`, module: `ESNext`

### 9. Configure Tailwind

Use Tailwind v4 with the Vite plugin. The `@tailwindcss/vite` plugin handles configuration automatically — no `tailwind.config.js` needed. Just make sure `globals.css` has the `@import "tailwindcss"` directive and that the Vite renderer config includes the `@tailwindcss/vite` plugin.

## Architecture Rules

- **No business logic in this session.** This is pure scaffold.
- `contextIsolation: true` and `nodeIntegration: false` are non-negotiable security settings.
- The preload bridge is the ONLY way the renderer talks to the main process.
- Every import must use the path aliases where applicable.

## Verification

After completion, run:
```bash
npm start
```

An Electron window should open showing "Novel Engine" in white text on a dark background. No errors in the dev tools console. The window title bar should be clean (no default Electron chrome on macOS).
