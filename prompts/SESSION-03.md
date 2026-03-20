# Session 03 — Settings Infrastructure

## Context

I'm building an Electron app called "Novel Engine." Sessions 01–02 created the scaffold and domain layer. Now I need the **Settings service** — the first infrastructure implementation. It manages Claude CLI detection, model selection, and all app preferences.

## Architecture Rule

This file lives in `src/infrastructure/settings/`. It imports from `@domain` and from Node builtins. It implements `ISettingsService` from `src/domain/interfaces.ts`. It does NOT import from application, renderer, or any other infrastructure module.

## Task

Create `src/infrastructure/settings/SettingsService.ts`.

### How it works

1. **Settings are stored in a JSON file** at `{userData}/settings.json`. Use `electron.app.getPath('userData')` to get the path.
2. **No API key management.** This app uses the Claude Code CLI (`claude`) for AI interactions. The CLI handles its own authentication via `claude login`. No API key is stored, encrypted, or managed by this app.
3. **`detectClaudeCli()`** checks if the `claude` CLI is installed and authenticated by running `claude --version` via `child_process.execFile`. Returns `true` if it exits with code 0, `false` otherwise. Also updates `hasClaudeCli` in the settings file.
4. **`load()`** reads the JSON file, merges with `DEFAULT_SETTINGS` from `@domain/constants`, and returns `AppSettings`.
5. **`update(partial)`** merges the partial into the existing settings and writes the file.

### Implementation details

- Use `fs.readFile`/`fs.writeFile` (from `node:fs/promises`) for file I/O
- Use `execFile` from `node:child_process` (promisified) for CLI detection
- Use a simple `try/catch` around the read — if the file doesn't exist, return defaults
- Constructor takes a `userDataPath: string` parameter so it's testable (not hardcoded to Electron's path)
- The class should be instantiatable as: `new SettingsService(app.getPath('userData'))`
- `detectClaudeCli` should try `claude --version` first. If that succeeds, also run `claude doctor` to verify the CLI is properly authenticated. Return `true` only if both succeed.

### Also create

`src/infrastructure/settings/index.ts` — barrel export of `SettingsService`.

## Verification

- File compiles with `npx tsc --noEmit`
- `SettingsService` implements `ISettingsService`
- No imports from `@app`, `renderer`, `main`, or other `@infra` modules
- Constructor accepts `userDataPath: string`
- `load()` return type matches `AppSettings`
- No API key encryption or `safeStorage` usage anywhere
- `detectClaudeCli()` returns a boolean based on CLI availability
