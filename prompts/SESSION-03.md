# Session 03 — Settings Infrastructure

## Context

I'm building an Electron app called "Novel Engine." Sessions 01–02 created the scaffold and domain layer. Now I need the **Settings service** — the first infrastructure implementation. It manages the API key (encrypted via Electron's `safeStorage`), model selection, and all app preferences.

## Architecture Rule

This file lives in `src/infrastructure/settings/`. It imports from `@domain` and from Electron/Node builtins. It implements `ISettingsService` from `src/domain/interfaces.ts`. It does NOT import from application, renderer, or any other infrastructure module.

## Task

Create `src/infrastructure/settings/SettingsService.ts`.

### How it works

1. **Settings are stored in a JSON file** at `{userData}/settings.json`. Use `electron.app.getPath('userData')` to get the path.
2. **The API key is stored separately**, encrypted via `electron.safeStorage.encryptString()`. The encrypted bytes are stored as a base64 string in `settings.json` under the key `_encryptedApiKey`. This key is **never** returned through `load()` — the public settings shape (`AppSettings`) only has `hasApiKey: boolean`.
3. **`getApiKey()`** decrypts and returns the key. Returns `null` if no key is stored.
4. **`validateApiKey(key)`** makes a minimal API call to Anthropic (send "Say ok" with `max_tokens: 10` using `claude-sonnet-4-20250514`) and returns `true`/`false`. Use the `@anthropic-ai/sdk`.
5. **`load()`** reads the JSON file, merges with `DEFAULT_SETTINGS` from `@domain/constants`, and returns `AppSettings`. Never exposes the encrypted key.
6. **`update(partial)`** merges the partial into the existing settings and writes the file. Does NOT touch the API key — that's only through `saveApiKey`.
7. **`saveApiKey(key)`** encrypts the key, stores it in the settings file, and also sets `hasApiKey: true`.

### Implementation details

- Use `fs.readFile`/`fs.writeFile` (from `node:fs/promises`) for file I/O
- Use a simple `try/catch` around the read — if the file doesn't exist, return defaults
- Constructor takes a `userDataPath: string` parameter so it's testable (not hardcoded to Electron's path)
- The class should be instantiatable as: `new SettingsService(app.getPath('userData'))`

### Also create

`src/infrastructure/settings/index.ts` — barrel export of `SettingsService`.

## Verification

- File compiles with `npx tsc --noEmit`
- `SettingsService` implements `ISettingsService`
- No imports from `@app`, `renderer`, `main`, or other `@infra` modules
- Constructor accepts `userDataPath: string`
- `load()` return type matches `AppSettings`
- `_encryptedApiKey` never appears in `load()` output
