# SESSION-01 — Tooltip Component & Guide Domain Types

> **Feature:** onboarding-guide-tooltips
> **Layer(s):** Domain / Renderer
> **Depends on:** Nothing
> **Estimated effort:** 25 min

---

## Context

Novel Engine has no tooltip system and no post-onboarding guided tour. The existing onboarding wizard (`OnboardingWizard.tsx`) handles first-run setup (CLI detection, model selection, author profile), but once the user clicks "Launch Novel Engine" they're dropped into the app with no guidance about what the sidebar sections, pipeline phases, agents, or views actually do.

This session establishes the foundation: domain types for the guided tour system, a reusable `Tooltip` component, and a `GuidedTour` overlay engine that will be wired into the main app in later sessions.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | Modify | Add `TourStep`, `TourId`, `TourStepPlacement`, `TourState` types; add `completedTours` to `AppSettings` |
| `src/domain/constants.ts` | Modify | Add `completedTours: []` to `DEFAULT_SETTINGS` |
| `src/renderer/hooks/useTooltip.ts` | Create | Hook for tooltip positioning via `getBoundingClientRect` |
| `src/renderer/components/common/Tooltip.tsx` | Create | Reusable tooltip with portal rendering, positioning, delay, and arrow |
| `src/renderer/components/common/GuidedTourOverlay.tsx` | Create | Spotlight overlay + step popover for guided tours |

---

## Implementation

### 1. Add Tour Types to Domain

Read `src/domain/types.ts`. Append the following types at the end of the file:

```typescript
// === Guided Tour ===

export type TourId = 'welcome' | 'first-book' | 'pipeline-intro';

export type TourStepPlacement = 'top' | 'bottom' | 'left' | 'right';

export type TourStep = {
  /** Unique step identifier within the tour. */
  id: string;
  /** CSS selector to anchor to (e.g. '[data-tour="sidebar-pipeline"]'). */
  targetSelector: string;
  /** Main heading for the popover. */
  title: string;
  /** Explanation text — 1-3 sentences. */
  body: string;
  /** Preferred popover placement relative to the target. */
  placement: TourStepPlacement;
  /** If set, navigate to this view before highlighting the target. */
  requiredView?: string;
};

export type TourState = {
  /** Which tours the user has completed. Persisted to settings. */
  completedTours: TourId[];
};
```

Then add `completedTours: TourId[]` to the `AppSettings` type.

### 2. Update DEFAULT_SETTINGS

Read `src/domain/constants.ts`. Add `completedTours: []` to the `DEFAULT_SETTINGS` object.

### 3. Create the Tooltip Hook

Create `src/renderer/hooks/useTooltip.ts`:

This hook manages tooltip positioning. It:
- Accepts options: `placement` (default `'top'`), `enterDelay` (default 300ms), `exitDelay` (default 100ms), `disabled` (default false)
- Tracks `isVisible` state with configurable enter/exit delay
- Computes `{ top, left }` position using `getBoundingClientRect()` + placement logic
- Handles viewport edge clamping so tooltips don't overflow the window
- Returns `{ isVisible, position, show, hide, triggerRef, triggerProps }` where `triggerProps` has `onMouseEnter`, `onMouseLeave`, `onFocus`, `onBlur`

Key details:
- Gap between trigger and tooltip: 8px
- Uses `useCallback` + `useRef` for timer IDs to avoid stale closures
- Position recalculated on `show` call (not continuously — tooltips are ephemeral)
- A `VIEWPORT_PADDING` of 8px prevents edge overflow
- `triggerRef` is a `RefCallback<HTMLElement>` that stores the element reference

### 4. Create the Tooltip Component

Create `src/renderer/components/common/Tooltip.tsx`:

A lightweight tooltip that wraps any trigger element.

```typescript
type TooltipProps = {
  /** The tooltip text content. */
  content: string;
  /** Placement relative to the trigger. Default: 'top'. */
  placement?: TourStepPlacement;
  /** Delay before showing in ms. Default: 300. */
  enterDelay?: number;
  /** Whether the tooltip is disabled (won't show). */
  disabled?: boolean;
  /** The trigger element(s). */
  children: React.ReactElement;
};
```

Implementation:
- Uses `useTooltip` hook for positioning logic
- Clones the child element to attach `triggerProps` (mouse/focus handlers) and merge the `ref`
- Tooltip rendered as a React portal to `document.body` (prevents clipping by `overflow: hidden` ancestors)
- Arrow: 6px CSS rotated square positioned on the edge closest to the trigger
- Animate with `opacity` and a slight `translate` from the placement direction (e.g., for `top` placement, tooltip slides up 4px as it fades in)
- Transition: 150ms ease-out
- Tailwind classes for the tooltip: `bg-zinc-800 dark:bg-zinc-700 text-zinc-100 text-xs px-2.5 py-1.5 rounded-md shadow-lg max-w-[240px] z-[9999]`
- Do NOT render the portal when `isVisible` is false (fully unmount)
- Support `\n` in content → split into `<br />` elements for multi-line tooltips

### 5. Create the Guided Tour Overlay

Create `src/renderer/components/common/GuidedTourOverlay.tsx`:

The overlay engine that powers "show you around the app" tours.

```typescript
type GuidedTourOverlayProps = {
  steps: TourStep[];
  isActive: boolean;
  onComplete: () => void;
  onDismiss: () => void;
};
```

Implementation:
- Renders a full-screen semi-transparent backdrop with a "spotlight" cutout around the target element
- Spotlight: CSS `clip-path: polygon(...)` that excludes a rounded rectangle matching the target's bounding rect + 8px padding. The `clip-path` transitions smoothly between steps (`transition: clip-path 400ms ease-in-out`)
- A popover positioned near the spotlight using the step's `placement`:
  - Styling: `bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl p-5 max-w-[320px] z-[10000]`
  - Title: `text-base font-semibold text-zinc-900 dark:text-zinc-100`
  - Body: `text-sm text-zinc-600 dark:text-zinc-400 mt-2`
  - Footer: step counter ("2 of 5"), "Back" button (hidden on step 1), "Next" button, "Skip Tour" link
- Backdrop: `bg-black/50 fixed inset-0 z-[9998]` — click on backdrop dismisses the tour
- Local state: `currentStepIndex` (number)
- On each step change:
  1. If `requiredView` is set, call `useViewStore.getState().navigate(step.requiredView)`
  2. Wait one `requestAnimationFrame` for DOM update
  3. Query `document.querySelector(step.targetSelector)`
  4. If target not found, `console.warn` and skip to next step
  5. Compute spotlight rect and popover position from `getBoundingClientRect()`
  6. Scroll target into view if needed (`element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })`)
- On "Next" past last step → `onComplete()`
- On Escape or "Skip Tour" → `onDismiss()`
- Keyboard: `ArrowRight` / `Enter` → next, `ArrowLeft` → back, `Escape` → dismiss

---

## Architecture Compliance

- [x] Domain files import from nothing (`TourStep`/`TourId`/`TourState` are pure types)
- [x] Renderer components import only from React, ReactDOM, and other renderer modules
- [x] `import type` used for domain types in renderer
- [x] No IPC needed yet — tour state persistence comes in SESSION-03
- [x] All types fully specified, no `any`
- [x] Tooltip uses portal to `document.body` — no DOM coupling issues

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `TourStep`, `TourId`, `TourState` types are exported from `src/domain/types.ts`
3. `AppSettings` includes `completedTours` field
4. `DEFAULT_SETTINGS` includes `completedTours: []`
5. `Tooltip`, `GuidedTourOverlay`, and `useTooltip` all export correctly

---

## State Update

After completing this session, update `prompts/feature/onboarding-guide-tooltips/STATE.md`:
- Set SESSION-01 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
