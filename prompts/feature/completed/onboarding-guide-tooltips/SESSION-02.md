# SESSION-02 — Tour Definitions & Tour Store

> **Feature:** onboarding-guide-tooltips
> **Layer(s):** Domain / Renderer
> **Depends on:** SESSION-01
> **Estimated effort:** 20 min

---

## Context

SESSION-01 created the `TourStep` type, `Tooltip` component, and `GuidedTourOverlay` engine. Now we need the actual tour content — the step-by-step definitions that tell users what each part of the app does — and a Zustand store to manage tour lifecycle (which tour is active, which are completed, starting/dismissing tours).

We also need to add `data-tour` attributes to the existing UI components so the tour overlay can anchor its spotlight to real DOM elements.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/tours/tourDefinitions.ts` | Create | Tour step arrays for 'welcome', 'first-book', 'pipeline-intro' |
| `src/renderer/stores/tourStore.ts` | Create | Zustand store managing active tour, completed tours, step advancement |
| `src/renderer/components/Layout/Sidebar.tsx` | Modify | Add `data-tour` attributes to key elements |
| `src/renderer/components/Layout/AppLayout.tsx` | Modify | Add `data-tour` attribute to main content area |
| `src/renderer/components/Sidebar/BookSelector.tsx` | Modify | Add `data-tour="book-selector"` |
| `src/renderer/components/Sidebar/PipelineTracker.tsx` | Modify | Add `data-tour="pipeline-tracker"` and per-phase attributes |
| `src/renderer/components/Chat/ChatInput.tsx` | Modify | Add `data-tour="chat-input"` |
| `src/renderer/components/Chat/ChatView.tsx` | Modify | Add `data-tour="chat-view"` |

---

## Implementation

### 1. Create Tour Definitions

Create `src/renderer/tours/tourDefinitions.ts`:

This file exports a `Record<TourId, TourStep[]>` containing all tour step definitions. Use `import type { TourId, TourStep }` from the domain.

#### Welcome Tour (`'welcome'`)

Shown after onboarding completes. Walks the user through the main UI areas:

```typescript
const WELCOME_TOUR: TourStep[] = [
  {
    id: 'welcome-book-selector',
    targetSelector: '[data-tour="book-selector"]',
    title: 'Your Books',
    body: 'This is where all your book projects live. Create new books, switch between projects, or import existing manuscripts.',
    placement: 'right',
  },
  {
    id: 'welcome-pipeline',
    targetSelector: '[data-tour="pipeline-tracker"]',
    title: 'The Pipeline',
    body: 'Every book follows a pipeline from pitch to publication. Each phase has a dedicated AI agent. The active phase is highlighted — start there.',
    placement: 'right',
  },
  {
    id: 'welcome-file-tree',
    targetSelector: '[data-tour="file-tree"]',
    title: 'Project Files',
    body: 'All your manuscript files, outlines, reports, and source documents. Click any file to read or edit it.',
    placement: 'right',
  },
  {
    id: 'welcome-chat',
    targetSelector: '[data-tour="chat-view"]',
    title: 'Agent Chat',
    body: 'This is where you talk to your AI agents. Each agent specializes in a different part of the writing process — from pitching to copy editing.',
    placement: 'left',
    requiredView: 'chat',
  },
  {
    id: 'welcome-chat-input',
    targetSelector: '[data-tour="chat-input"]',
    title: 'Chat Input',
    body: 'Type your message here, or use the Quick Actions menu for pre-built prompts tailored to the active agent. Hit Enter to send.',
    placement: 'top',
    requiredView: 'chat',
  },
  {
    id: 'welcome-nav',
    targetSelector: '[data-tour="sidebar-nav"]',
    title: 'Navigation',
    body: 'Switch between Chat, Files, Build, Pitch Room, Motif Ledger, and Settings. Each view serves a different purpose in your workflow.',
    placement: 'right',
  },
];
```

#### First Book Tour (`'first-book'`)

Shown when the user creates their first book. Focused on the pitch to scaffold flow:

```typescript
const FIRST_BOOK_TOUR: TourStep[] = [
  {
    id: 'first-book-pitch',
    targetSelector: '[data-tour="pipeline-phase-pitch"]',
    title: 'Start with a Pitch',
    body: 'Spark is your story pitcher. Click this phase to open a conversation with Spark and brainstorm your story concept.',
    placement: 'right',
  },
  {
    id: 'first-book-quick-actions',
    targetSelector: '[data-tour="quick-actions"]',
    title: 'Quick Actions',
    body: 'Each agent has pre-built prompts. For Spark, try "Pitch me a story" — it will ask discovery questions and produce a pitch card.',
    placement: 'top',
    requiredView: 'chat',
  },
  {
    id: 'first-book-advance',
    targetSelector: '[data-tour="pipeline-tracker"]',
    title: 'Advancing the Pipeline',
    body: 'When an agent finishes its work, the phase turns amber. Click "Advance" to confirm and unlock the next phase.',
    placement: 'right',
  },
];
```

#### Pipeline Intro Tour (`'pipeline-intro'`)

A deeper dive into the 14-phase pipeline. Shown on demand from settings or help icon:

```typescript
const PIPELINE_INTRO_TOUR: TourStep[] = [
  {
    id: 'pipeline-overview',
    targetSelector: '[data-tour="pipeline-tracker"]',
    title: 'The 14-Phase Pipeline',
    body: 'Your book moves through 14 phases: from Story Pitch to Publication. Each phase is handled by a specialized AI agent.',
    placement: 'right',
  },
  {
    id: 'pipeline-agents',
    targetSelector: '[data-tour="pipeline-phase-pitch"]',
    title: 'Spark — Story Pitch',
    body: 'Spark helps you discover your story concept through conversation. It produces a pitch card that becomes the foundation for everything.',
    placement: 'right',
  },
  {
    id: 'pipeline-verity',
    targetSelector: '[data-tour="pipeline-phase-scaffold"]',
    title: 'Verity — The Ghostwriter',
    body: "Verity handles scaffolding (outline + bible), first draft, revisions, and mechanical fixes. She's your primary writing partner.",
    placement: 'right',
  },
  {
    id: 'pipeline-readers',
    targetSelector: '[data-tour="pipeline-phase-first-read"]',
    title: 'Ghostlight & Lumen — Readers',
    body: 'Ghostlight gives cold-read feedback. Lumen provides deep structural analysis. Their reports feed into revision planning.',
    placement: 'right',
  },
  {
    id: 'pipeline-forge',
    targetSelector: '[data-tour="pipeline-phase-revision-plan-1"]',
    title: 'Forge — Task Master',
    body: 'Forge synthesizes reader feedback into a concrete revision plan with numbered tasks and session prompts.',
    placement: 'right',
  },
  {
    id: 'pipeline-sable',
    targetSelector: '[data-tour="pipeline-phase-copy-edit"]',
    title: 'Sable — Copy Editor',
    body: 'Sable handles grammar, consistency, and style. She produces an audit report and maintains a style sheet.',
    placement: 'right',
  },
  {
    id: 'pipeline-build',
    targetSelector: '[data-tour="pipeline-phase-build"]',
    title: 'Build & Publish',
    body: 'Build exports your manuscript to DOCX, EPUB, and PDF. Quill audits the outputs and prepares publication metadata.',
    placement: 'right',
  },
];
```

Export the full map:

```typescript
export const TOUR_DEFINITIONS: Record<TourId, TourStep[]> = {
  'welcome': WELCOME_TOUR,
  'first-book': FIRST_BOOK_TOUR,
  'pipeline-intro': PIPELINE_INTRO_TOUR,
};
```

### 2. Create Tour Store

Create `src/renderer/stores/tourStore.ts`:

```typescript
import { create } from 'zustand';
import type { TourId } from '@domain/types';
import { TOUR_DEFINITIONS } from '../tours/tourDefinitions';

type TourStoreState = {
  activeTourId: TourId | null;
  completedTours: Set<TourId>;
  isHydrated: boolean;

  hydrate: (completedTours: TourId[]) => void;
  startTour: (tourId: TourId) => void;
  completeTour: () => Promise<void>;
  dismissTour: () => void;
  isTourCompleted: (tourId: TourId) => boolean;
  resetTour: (tourId: TourId) => Promise<void>;
};
```

Key behaviors:
- `hydrate()` called by `AppLayout` on mount — passes `settings.completedTours`
- `completeTour()` adds active tour to `completedTours`, clears `activeTourId`, persists via `window.novelEngine.settings.update({ completedTours: [...completedTours] })`
- `startTour()` sets `activeTourId` — no-op if another tour is active
- `dismissTour()` clears `activeTourId` without marking complete
- `resetTour()` removes from `completedTours` set and persists
- `isTourCompleted()` reads from the Set for O(1) lookup

### 3. Add `data-tour` Attributes

Minimal, non-breaking changes — just adding a `data-tour` prop to existing wrapper elements:

#### `Sidebar.tsx`

Read the file first. Then:
- Add `data-tour="sidebar-nav"` to the bottom nav `<div>` (the `<div>` containing `NAV_ITEMS.map(...)`)
- Add `data-tour="file-tree"` to the Files accordion content wrapper `<div>` (the one inside the `{filesOpen && ...}` block)

#### `BookSelector.tsx`

Read the file first. Add `data-tour="book-selector"` to the outermost container element.

#### `PipelineTracker.tsx`

Read the file first. Then:
- Add `data-tour="pipeline-tracker"` to the outermost container element
- For each phase row element, add `data-tour={`pipeline-phase-${phase.id}`}` using the phase's `id`

#### `ChatView.tsx`

Read the file first. Add `data-tour="chat-view"` to the outermost wrapper `<div>`.

#### `ChatInput.tsx`

Read the file first. Add `data-tour="chat-input"` to the main input container wrapper `<div>`.

#### `AppLayout.tsx`

Read the file first. Add `data-tour="main-content"` to the `<main>` element.

#### `QuickActions.tsx`

Read the file first. Add `data-tour="quick-actions"` to the quick actions trigger button or its immediate wrapper.

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Tour definitions use `import type` from domain only
- [x] Tour store talks to backend only through `window.novelEngine`
- [x] `data-tour` attributes are inert — zero behavioral change
- [x] No `any` types
- [x] Store follows existing Zustand patterns

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `TOUR_DEFINITIONS` exports three tours with correctly typed steps
3. `useTourStore` exports and all actions are callable
4. All `data-tour` attributes are present in their respective components (search codebase for `data-tour`)
5. No existing functionality is broken by the attribute additions

---

## State Update

After completing this session, update `prompts/feature/onboarding-guide-tooltips/STATE.md`:
- Set SESSION-02 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
