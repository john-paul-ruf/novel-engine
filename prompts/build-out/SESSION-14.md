# Session 14 — Onboarding Wizard + Settings Panel

## Context

Novel Engine Electron app. Session 13 created the UI shell. Now I need the **onboarding wizard** (first-run Claude CLI setup) and the **settings panel** (ongoing configuration).

## Architecture Rule

All components in `src/renderer/components/`. Access data through Zustand stores. Stores access the backend through `window.novelEngine`. Use Tailwind for all styling. No external UI component libraries.

---

## Task 1: Onboarding Wizard

### `src/renderer/components/Onboarding/OnboardingWizard.tsx`

A full-screen, step-by-step wizard. No sidebar, no navigation — just the wizard. Shown when `settings.initialized === false`.

**Step 1: Welcome**
- App logo/name centered
- Brief tagline: "Turn your ideas into polished manuscripts with AI agents that collaborate like a real publishing team."
- "Get Started" button → next step

**Step 2: Claude Code CLI Setup**
- Heading: "Connect to Claude"
- Explanation: "Novel Engine uses the Claude Code CLI for AI interactions. This is cheaper than direct API access and uses your existing Claude subscription."
- Instructions:
  1. "Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`"
  2. "Authenticate: Run `claude login` in your terminal"
- Link: "Learn more at docs.anthropic.com/en/docs/claude-code" (open in external browser via `window.novelEngine.shell.openExternal('https://docs.anthropic.com/en/docs/claude-code')` — **do not use `window.open()`** which creates an Electron window instead of opening the OS browser)
- "Check Connection" button → calls `settingsStore.detectClaudeCli()`
- States:
  - Idle: button enabled
  - Checking: button disabled, spinner
  - Connected: green checkmark + "Claude CLI detected!", "Next" button appears
  - Not found: red message "Claude Code CLI not found. Make sure it's installed and you've run `claude login`."
- On connected → next step

**Step 3: Model Selection**
- Heading: "Choose Your Model"
- Load model list on mount via `window.novelEngine.models.getAvailable()` (do NOT import `AVAILABLE_MODELS` from `@domain` — the renderer must never import domain values, only types)
- Radio cards for each model:
  - Model name (large)
  - Description (small, gray)
  - Opus: "Recommended" badge
- Default: Opus selected
- "Next" button → save model via `settingsStore.update({ model: selectedModel })` → next step

**Step 4: Author Profile**
- Heading: "Tell Us About Your Writing"
- Include a small text input for **Author Name**:
  - Label: "Your name (as it appears on book covers)"
  - Store in settings via `settingsStore.update({ authorName })`
  - Used as the default `author` field when creating books
- Large textarea with placeholder: "What genres do you write? What's your style? Who are your influences? What makes your voice unique?"
- "Skip" link (small, gray) and "Save & Continue" button
- On save: call `window.novelEngine.settings.saveAuthorProfile(content)` — this writes to `{userDataPath}/author-profile.md` via the dedicated IPC channel added in Task 3 below.

**Step 5: Ready**
- Heading: "You're All Set!"
- Summary of what was configured
- Includes a **"Book Title" input** with a placeholder like "My First Novel" — this lets the user create their first book right here in the wizard
- "Launch Novel Engine" button → calls `settingsStore.update({ initialized: true })`, creates the book via `bookStore.createBook(title)` if the user entered a title, then navigates to the chat view. This avoids depending on Session 15's `BookSelector` component which doesn't exist yet.
- If the user leaves the title blank, just complete onboarding without creating a book — they can do it from the sidebar later.

### Design details

- Each step is a centered card, max-width 600px
- Progress indicator: dots or step numbers at the top
- Smooth transitions between steps (simple opacity/transform animation)
- Dark background matching the app theme
- All inputs use: `bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500`

---

## Task 2: Settings Panel

### `src/renderer/components/Settings/SettingsView.tsx`

Shown when the user navigates to Settings from the sidebar.

**Sections:**

### Claude CLI Status
- Show connection status: green dot + "Connected" if CLI is detected, red dot + "Not connected" otherwise
- "Re-check" button → calls `settingsStore.detectClaudeCli()` to re-verify
- Installation instructions link if not connected (use `window.novelEngine.shell.openExternal()` for any external URLs)

### Model Selection
- Same radio cards as onboarding (load via `window.novelEngine.models.getAvailable()`)
- Changes save immediately via `settingsStore.update({ model })`

### Extended Thinking
- Toggle: "Show agent thinking" (checkbox)
- Slider: "Default thinking budget" — range 1024 to 32000, step 1024
  - Labels: "1K (quick)" | "10K (default)" | "32K (deep)"
  - Show current value: "{N} tokens"
- Toggle: "Auto-collapse thinking after response" (checkbox)

### Appearance
- Theme selector: Dark / Light / System (radio group)
- Note: "Only dark theme is available in this version" (disable light/system for now)

### Token Usage Summary
- Total tokens used (input + output + thinking)
- Total estimated cost
- "Since: {date of first usage}"
- Per-book breakdown if there are multiple books

### Author Profile
- Shows the current author name (from settings) with an "Edit" button to change it
- A textarea showing the contents of `author-profile.md` loaded via `window.novelEngine.settings.loadAuthorProfile()`
- "Save" button → calls `window.novelEngine.settings.saveAuthorProfile(content)` and `settingsStore.update({ authorName })` if the name changed
- This is the **only** place to edit the author profile after onboarding

### About
- App version (from `package.json`)
- "Novel Engine — Powered by Claude Code CLI"
- Links: GitHub repo, Claude Code docs (use `window.novelEngine.shell.openExternal(url)` for all external links — **never `window.open()`**)

### Design details

- Left-aligned, max-width 700px, comfortable padding
- Each section separated by a thin `border-b border-zinc-800` divider
- Section headings: `text-lg font-semibold text-zinc-100 mb-4`
- Help text: `text-sm text-zinc-500`
- Inputs match the onboarding style

---

## Task 3: New IPC channel for author profile

Add these handlers to `registerIpcHandlers` in `src/main/ipc/handlers.ts`:

```typescript
ipcMain.handle('settings:saveAuthorProfile', async (_, content: string) => {
  const profilePath = path.join(paths.userDataPath, 'author-profile.md');
  await fsPromises.writeFile(profilePath, content, 'utf-8');
});

ipcMain.handle('settings:loadAuthorProfile', async () => {
  const profilePath = path.join(paths.userDataPath, 'author-profile.md');
  try {
    return await fsPromises.readFile(profilePath, 'utf-8');
  } catch {
    return '';
  }
});
```

These handlers use `paths.userDataPath` from the `paths` parameter in the `registerIpcHandlers` function signature (defined in Session 11). Import `fs/promises` as `fsPromises` and `path` from `node:path` at the top of handlers file.

Update preload `api.settings` in `src/preload/index.ts`:

```typescript
saveAuthorProfile: (content: string): Promise<void> =>
  ipcRenderer.invoke('settings:saveAuthorProfile', content),
loadAuthorProfile: (): Promise<string> =>
  ipcRenderer.invoke('settings:loadAuthorProfile'),
```

The `NovelEngineAPI` type auto-updates since it is `typeof api`.

---

## Verification

- On fresh app start (delete `{userData}/.initialized`), the onboarding wizard appears
- Claude CLI detection works (shows green checkmark if `claude` is installed, error if not)
- After completing onboarding, the main app layout appears
- Settings panel shows all sections
- Changing the model saves immediately
- Thinking toggle and slider work
- Token usage section shows data (or "No usage data yet")
- Re-check button in settings re-detects Claude CLI status
