# UI Analysis — Novel Engine Current State

## App Overview
A multi-agent AI fiction-writing desktop app (Electron, React, Tailwind v4, Zustand). The user manages books through a 14-phase pipeline, chats with specialized agents, edits files, builds manuscripts, and tracks statistics.

---

## Current Layout Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ TitleBar (custom, macOS traffic lights / Windows controls)       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌───────────────────────────────────────────┬─┤
│  │             │  │                                           │ │
│  │   Sidebar   │  │              Main Content                 │P│
│  │             │  │           (view-dependent)                │p│
│  │  BookPanel  │  │                                           │ │
│  │  Book List  │  │   Dashboard / Chat / Files / Build      │i│
│  │  Nav Items  │  │                                           │p│
│  │    etc.     │  │                                           │e│
│  │             │  │                                           │l│
│  └─────────────┘  │                                           │i│
│                   │                                           │n│
│                   │                                           │e│
│                   │                                           │ │
│                   │                                           │P│
│                   │                                           │a│
│                   │                                           │n│
│                   └───────────────────────────────────────────┴─┤
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Optional right panels: `PipelinePanel` (toggleable), `CliActivityPanel` (dockable via `cliActivityStore.isOpen`).

---

## Detailed Breakdown

### 1. TitleBar
- **Current:** Custom title bar with macOS traffic lights (left) / Windows controls (right). Center shows "Novel Engine".
- **Problem:** Just eats vertical space. It has no real utility beyond window controls.

### 2. Sidebar
- **Purpose:** Book selection + view navigation + pipeline toggle + CLI activity toggle.
- **Structure:**
  - Top: `PitchHistory` (when in Pitch Room), then `BookPanel` (book list + series groups + toolbar actions + modals)
  - Bottom: Nav buttons with emoji icons (📊 Dashboard, 💬 Chat with expandable children, 📁 Files, 📦 Build, 📈 Statistics, 💡 Pitch Room, 📖 Reading, ⚙️ Settings), plus Pipeline toggle, CLI Activity toggle.
- **Problems:**
  - **Emoji icons look unprofessional.** A commercial writing app should have clean iconography.
  - **Chat subsection is a hack.** Hot Take, Ad Hoc Revision, and Help are tucked under Chat's expand arrow. These are primary actions, not children of Chat.
  - **Bottom nav is cluttered.** 8 items + Pipeline toggle + CLI Activity button = 10 interactive elements stacked vertically.
  - **BookPanel dominates the top half.** The book list (with cover thumbnails, status badges, series groups, toolbars for import/archive/modals) takes up a lot of space and is contextually unrelated to view navigation.
  - **Two things fighting for the sidebar's purpose:** The sidebar tries to be both (a) a project switcher and (b) an app navigator. This dual role makes it feel heavy.

### 3. Main Content Area

Each view is rendered with `className={currentView === 'x' ? '' : 'hidden'}` — all mount simultaneously to preserve state.

#### Dashboard (`DashboardView`)
- Card grid: Pipeline Progress, Word Count, Last Interaction, Revision Tasks, Recent Files
- **Problem:** Cards are uneven. Pipeline card spans 2 cols but is just a row of dots. Word Count shows per-chapter bars that are tiny. The layout is neither a focused workspace nor a comprehensive overview — it's a scattered summary that tries to do too much.
- **Redundant:** Pipeline progress also lives in PipelinePanel. Word count also lives in BookPanel.

#### Chat (`ChatView`)
- Structure: TitleBar → ConversationList (expandable) → AgentHeader → MessageList → ChatInput
- **Problems:**
  - **ConversationList eats vertical space** when expanded, pushing messages down.
  - **AgentHeader shows agent info** but feels like a separate header. The three header-like elements (ChatTitleBar + AgentHeader + ChatInput's quick actions) make the chat feel boxed in.
  - **No way to view manuscript while chatting.** The #1 writing workflow is: read what the agent said → look at your draft → edit. Currently you must switch views. This is a serious workflow blocker.

#### Files (`FilesView`)
- 5 tabs: Source, Chapters, Agents, Explorer, Motif Ledger
- View modes: browser, reader, editor
- **Problems:**
  - **Tab bar + view modes create layered navigation confusion.** First you pick a tab (Source, Chapters...), then within Source you pick a mode (browser/reader/editor).
  - **Source tab is default but is mostly a "click to open about.json" button.** The real content browsing happens in Explorer tab.
  - **Reader vs Editor vs History panel** — three modes (reader/editor/browser) + a toggleable history side panel = state explosion. The conditional rendering is complex.
  - **Motif Ledger as a tab mixes concerns** — it's a reference document, not a file.

#### Build (`BuildView`)
- Build button, Download button, progress log, output files list
- **Problem:** Good structure, but the "Read Full Manuscript" button belongs in a unified reader, not in build.

#### Statistics (`StatisticsView`)
- Summary cards + recharts (AreaChart, BarChart)
- **Problem:** Separate top-level view for data that could be summary widgets. Feels like a separate app.

#### Reading Mode (`ReadingModeView`)
- Full assembled manuscript, chapter tracking via IntersectionObserver
- **Problem:** Separate view means you lose chat context. Writing is an iterative loop: read a chapter → ask agent about it → edit. Currently that's 3 view switches.

#### Pitch Room (`PitchRoomView`)
- Chat with Spark, shelvable pitches
- **Problem:** Entitled to its own top-level view, but it's really a "new idea" action. Takes up nav real estate for something used infrequently.

#### Settings (`SettingsView`)
- Sections: Built-in CLI Status, Model Selection, Thinking, Notifications, Appearance, etc.
- **Problem:** Fine structure, but the radio-button model cards are chunky. Could be more compact.

### 4. Right Panels

#### PipelinePanel
- Shows `PipelineTracker` (14 phases with status icons, expandable for details)
- **Problem:** Duplicates pipeline info from Dashboard. Consumes 300–480px of horizontal space. Users toggle it on/off, meaning it's discoverable but takes up space when on.

#### CliActivityPanel
- Tracks CLI tool calls with filterable list, expandable sections, resizable sub-panels
- **Problem:** Important for power users, but takes up a whole column. Should be a status bar or bottom panel (like VS Code's terminal).

### 5. Global Overlays
- `RevisionQueueModal`, `ChatModal`, `HelperPanel`, `GuidedTourOverlay`, `OnboardingWizard`
- These modals/panels float on top. The architecture supports this well.

---

## Critical UX Problems Ranked

| # | Problem | Impact | Frequency |
|---|---------|--------|-----------|
| 1 | **Cannot see chat + manuscript simultaneously** | Writers must switch views constantly to iterate | Every chat interaction |
| 2 | **Sidebar is a kitchen sink** | Dual role (project switcher + app nav) makes it cluttered | Always visible |
| 3 | **Emoji nav buttons** | Look amateur/untrustworthy for a writing tool | Always visible |
| 4 | **Pipeline duplicated** in Dashboard + Sidebar toggle + right panel | Confused mental model, wasted space | Always |
| 5 | **Files view has tab + mode switching** | Two layers of navigation for one concept | Every file operation |
| 6 | **Pitch Room as top-level view** | Infrequent action treated as peer to primary workflows | Rarely |
| 7 | **Statistics as top-level view** | Data could be surfaced inline, not a separate context switch | Occasionally |
| 8 | **ConversationList in Chat is a dropdown** | Wastes vertical space when expanded, hides history when collapsed | Frequently |

---

## What's Working Well

1. **View persistence** — All views mounted but hidden via CSS. This preserves scroll position and stream listeners.
2. **Zustand store architecture** — Clean separation of concerns.
3. **IPC bridge** — Well-structured communication layer.
4. **Dark mode support** — Tailwind dark: classes are comprehensive.
5. **Custom title bar** — Works well cross-platform.
6. **Resize handles** — Sidebar and panels are resizable, saved to localStorage.
7. **Pipeline phase tracking** — 14-phase system is clear and well-defined.

---

## Design Principles for Redesign

1. **Split-pane first.** Writing is a referencing activity. Chat + manuscript must be visible together.
2. **Separate project context from app navigation.** Book selection is a project switcher, not a nav item.
3. **Use icon-only dock for nav.** More vertical space for content. Tooltips on hover for labels.
4. **Surface pipeline progress as a horizontal stepper.** Always visible, always contextual.
5. **Group related views.** "Write" (chat+editor), "Review" (files+reading+ledger), "Build", "Dashboard".
6. **Move diagnostics to bottom panel.** Like VS Code's integrated terminal — there when you need it, collapsible.
7. **Use a command palette (Cmd+K).** Quick access to pitch room, statistics, new book, etc. without nav clutter.
8. **Professional iconography.** Lucide icons, not emojis.
