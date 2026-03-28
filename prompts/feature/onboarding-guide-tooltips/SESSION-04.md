# SESSION-04 — Tooltips Everywhere

> **Feature:** onboarding-guide-tooltips
> **Layer(s):** Renderer
> **Depends on:** SESSION-01
> **Estimated effort:** 30 min

---

## Context

SESSION-01 created the reusable `Tooltip` component. This session wraps every interactive element and non-obvious UI element with tooltips — the "LOTS OF TOOLTIPS" part of the feature request. This is a broad pass across the entire renderer, adding contextual help text to buttons, icons, pipeline phases, nav items, and controls.

This session can run in parallel with SESSION-02 and SESSION-03 since it only depends on the `Tooltip` component from SESSION-01.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/components/Layout/Sidebar.tsx` | Modify | Wrap nav buttons with tooltips |
| `src/renderer/components/Sidebar/BookSelector.tsx` | Modify | Tooltip on create book button, archive button |
| `src/renderer/components/Sidebar/PipelineTracker.tsx` | Modify | Tooltip on each phase showing agent + description |
| `src/renderer/components/Sidebar/HotTakeButton.tsx` | Modify | Tooltip explaining Hot Take |
| `src/renderer/components/Sidebar/AdhocRevisionButton.tsx` | Modify | Tooltip explaining ad-hoc revision |
| `src/renderer/components/Sidebar/VoiceSetupButton.tsx` | Modify | Tooltip explaining voice setup |
| `src/renderer/components/Sidebar/CliActivityButton.tsx` | Modify | Tooltip explaining CLI activity panel |
| `src/renderer/components/Sidebar/RevisionQueueButton.tsx` | Modify | Tooltip explaining revision queue |
| `src/renderer/components/Sidebar/FileTree.tsx` | Modify | Tooltip on file items showing full path |
| `src/renderer/components/Chat/ChatInput.tsx` | Modify | Tooltip on send button |
| `src/renderer/components/Chat/QuickActions.tsx` | Modify | Tooltip on quick actions trigger |
| `src/renderer/components/Chat/ThinkingBudgetSlider.tsx` | Modify | Tooltip explaining thinking budget |
| `src/renderer/components/Chat/AgentHeader.tsx` | Modify | Tooltip on agent name showing role |
| `src/renderer/components/Chat/ChatTitleBar.tsx` | Modify | Tooltips on action buttons |
| `src/renderer/components/Chat/ConversationList.tsx` | Modify | Tooltip on conversation items |
| `src/renderer/components/Build/BuildView.tsx` | Modify | Tooltips on build format buttons, export button |
| `src/renderer/components/Files/FilesHeader.tsx` | Modify | Tooltips on view mode toggle buttons |
| `src/renderer/components/Files/VersionHistoryPanel.tsx` | Modify | Tooltip on revert/diff buttons |
| `src/renderer/components/Settings/SettingsView.tsx` | Modify | Tooltips on settings labels |
| `src/renderer/components/Layout/TitleBar.tsx` | Modify | Tooltips on window control buttons |

---

## Implementation

### General Pattern

For every tooltip addition:

```tsx
import { Tooltip } from '../common/Tooltip';

// Before:
<button onClick={handleAction}>Icon</button>

// After:
<Tooltip content="Helpful explanation">
  <button onClick={handleAction}>Icon</button>
</Tooltip>
```

Read each file before modifying. Wrap the existing element — do NOT restructure the component.

### Tooltip Content Catalog

#### Sidebar Navigation (`Sidebar.tsx`)

Wrap each `NavButton` call site with `Tooltip`. Use `placement="right"`:

| Nav Item | Tooltip Content |
|----------|----------------|
| Chat | "Talk to AI agents about your book" |
| Files | "Browse and edit your manuscript files" |
| Build | "Export your manuscript to DOCX, EPUB, or PDF" |
| Pitch Room | "Free brainstorming space — pitch ideas without committing to a book" |
| Motif Ledger | "Track motifs, foreshadowing, and flagged phrases across your manuscript" |
| Settings | "App preferences, model selection, and guided tours" |

#### Book Selector (`BookSelector.tsx`)

| Target | Tooltip Content |
|--------|----------------|
| Create book button | "Create a new book project" |
| Book dropdown | "Switch between your book projects" |
| Archive button | "Archive this book — move it out of the active list" |
| Import button | "Import an existing manuscript (Markdown or DOCX)" |

#### Pipeline Tracker (`PipelineTracker.tsx`)

For each phase row, wrap with `Tooltip` showing agent and description:

```
content={`${phase.agent ?? 'Manual'} — ${phase.description}`}
```

Use `placement="right"`.

Additional tooltips:
- "Advance" button: "Confirm this phase is complete and unlock the next one"
- "Revert" button: "Move this phase back to active — doesn't delete agent output"
- "Done" button: "Mark this phase as manually complete"

#### Sidebar Action Buttons

| Component | Tooltip Content |
|-----------|----------------|
| HotTakeButton | "Get Ghostlight's unfiltered first impression of your manuscript" |
| AdhocRevisionButton | "Start a one-off revision session outside the pipeline" |
| VoiceSetupButton | "Set up your writing voice profile with Verity" |
| CliActivityButton | "View active and recent AI agent activity" |
| RevisionQueueButton | "Open the automated revision queue" |

#### Chat Components

| Component | Target | Tooltip Content |
|-----------|--------|----------------|
| ChatInput | Send button | "Send message (Enter)" |
| QuickActions | Trigger button | "Pre-built prompts for the active agent" |
| ThinkingBudgetSlider | Slider label | "Controls how much the agent reasons before responding.\nHigher = deeper thinking, more tokens." |
| ThinkingBudgetSlider | Reset button | "Reset to agent's default thinking budget" |
| AgentHeader | Agent name | Show the agent's role (e.g., "Ghostwriter") |
| ChatTitleBar | New conversation button | "Start a new conversation with this agent" |
| ChatTitleBar | Delete conversation button | "Delete this conversation permanently" |
| ConversationList | Each conversation item | Show title and creation date |

#### Build View (`BuildView.tsx`)

| Target | Tooltip Content |
|--------|----------------|
| Build button | "Compile your manuscript into export formats" |
| DOCX option | "Microsoft Word format — best for editing and sharing" |
| EPUB option | "E-book format — for Kindle, Apple Books, Kobo" |
| PDF option | "Print-ready format — requires LaTeX" |
| Export ZIP button | "Download all build outputs as a ZIP file" |

#### Files View

| Component | Target | Tooltip Content |
|-----------|--------|----------------|
| FilesHeader | Browser mode | "Browse all project files in a tree view" |
| FilesHeader | Reader mode | "Read-only view of the selected file" |
| FilesHeader | Editor mode | "Edit the selected file directly" |
| VersionHistoryPanel | Revert button | "Restore this file to a previous version" |
| VersionHistoryPanel | Diff button | "Compare this version with the current file" |

#### Settings View (`SettingsView.tsx`)

Tooltips on settings labels (not inputs):

| Setting | Tooltip Content |
|---------|----------------|
| Model | "The Claude model used for AI agent conversations" |
| Enable Thinking | "Let agents show their reasoning process — uses more tokens but improves quality" |
| Thinking Budget | "Maximum tokens the agent can spend on internal reasoning per response" |
| Override Per-Agent Budgets | "Use this global budget for all agents instead of their individual defaults" |
| Auto-Collapse Thinking | "Automatically collapse thinking blocks in chat — click to expand" |
| Enable Notifications | "Show OS notifications when agent calls complete" |
| Theme | "Switch between light, dark, or system-matched theme" |

#### Title Bar (`TitleBar.tsx`)

| Target | Tooltip Content |
|--------|----------------|
| Minimize button | "Minimize window" |
| Maximize button | "Maximize window" / "Restore window" (dynamic based on state) |
| Close button | "Close window" |

---

## Architecture Compliance

- [x] All changes are renderer-only
- [x] `Tooltip` is the only new import — from SESSION-01
- [x] No business logic changes — purely presentational
- [x] No new state, no new IPC calls
- [x] `import type` used for any domain type references

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Hover over sidebar nav items → tooltips with correct placement and text
3. Hover over pipeline phases → agent name + description shown
4. Hover over chat action buttons → helpful explanations appear
5. Hover over build format options → format descriptions shown
6. Hover over settings labels → contextual help text
7. Tooltips respect 300ms delay and don't cause layout shifts
8. No visual regressions anywhere

---

## State Update

After completing this session, update `prompts/feature/onboarding-guide-tooltips/STATE.md`:
- Set SESSION-04 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
