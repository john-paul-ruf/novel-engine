# SESSION-07 — Settings Reorganization: Tabs

> **Feature:** small-queue-intake
> **Layer(s):** M10 (renderer only)
> **Depends on:** Nothing
> **Estimated effort:** 30 min

---

## Context

The SettingsView is one long scrollable page with all sections stacked. Requested: organize into tabs. Don't be afraid to use tabs.

---

## Files to Read First

- `src/renderer/components/Settings/SettingsView.tsx` — full file (it is long, read all of it)
- `src/renderer/components/Settings/ProviderSection.tsx` — the multi-provider UI section

---

## Tab Design

Split SettingsView into four tabs:

| Tab | Icon | Sections it contains |
|-----|------|---------------------|
| **Writing** | ✍️ | Model Selection, Thinking Budget, Max Tokens |
| **Providers** | 🔌 | Claude CLI Status, ProviderSection (multi-provider) |
| **Appearance** | 🎨 | Theme, Auto-collapse thinking, Notifications |
| **Profile** | 👤 | Author Name (from settings), Author Profile file editor, Tours |

---

## Implementation

### Step 1: Add tab state

At the top of `SettingsView`:
```tsx
type SettingsTab = 'writing' | 'providers' | 'appearance' | 'profile';
const [activeTab, setActiveTab] = useState<SettingsTab>('writing');
```

### Step 2: Add tab bar

Replace the current single-section render with a two-part layout:
1. A sticky tab bar at the top of the SettingsView container
2. The tab content below it (scrollable)

Tab bar:
```tsx
<div className="flex shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6 pt-4">
  {(['writing', 'providers', 'appearance', 'profile'] as SettingsTab[]).map((tab) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={`mr-1 px-4 py-2 text-sm font-medium capitalize transition-colors ${
        activeTab === tab
          ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
          : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
      }`}
    >
      {TAB_LABELS[tab]}
    </button>
  ))}
</div>
```

Define `TAB_LABELS`:
```tsx
const TAB_LABELS: Record<SettingsTab, string> = {
  writing: '✍️ Writing',
  providers: '🔌 Providers',
  appearance: '🎨 Appearance',
  profile: '👤 Profile',
};
```

### Step 3: Reorganize sections into tabs

Read the current sections in SettingsView.tsx and assign each to its tab. Each tab content renders in a `<div className="flex-1 overflow-y-auto p-6 space-y-8">`.

**Writing tab:** ModelSelectionSection, ThinkingSection (thinking budget + override toggle), MaxTokensSection
**Providers tab:** ClaudeCliSection, ProviderSection
**Appearance tab:** ThemeSection, AutoCollapseSection, NotificationsSection
**Profile tab:** AuthorNameSection (just the author name input), AuthorProfileSection (file editor), ToursSection (tour reset buttons), UsageSection (usage stats)

If any of these sections do not exist as separate components yet, extract them from the monolithic render into named function components within the same file. Keep all existing logic — only reorganize the JSX into tabs.

### Step 4: Author Profile section improvement

In the Profile tab, the Author Profile section should be enhanced. Currently settings only stores `authorName`. The actual author-profile.md file lives in userData. Add a simple author profile editor:

- Display the author-profile.md content in a `<textarea>` (read via `window.novelEngine.authorProfile.read()` — check the preload bridge to see if this method exists)
- If a `window.novelEngine.authorProfile.read()` method exists, render an editable textarea with Save/Cancel
- If it does not exist, just show the Author Name field with a note "Edit author-profile.md in the Files view for full profile details"
- Do not add new IPC channels in this session — only use existing bridge methods

---

## Architecture Compliance

- [x] Renderer only — no domain, infra, application, or IPC changes
- [x] Tab state is local `useState` in SettingsView
- [x] All existing functionality preserved — sections reorganized, not removed
- [x] No new IPC channels (if author profile editing is deferred, that is fine)

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. SettingsView shows four tabs at the top
3. Each tab shows the correct sections
4. Tab selection persists during the session (local state — does not need to persist across restarts)
5. All existing settings controls (model, thinking, theme, CLI status, provider) are accessible in their tabs

---

## State Update

Set SESSION-07 to `done` in STATE.md.
