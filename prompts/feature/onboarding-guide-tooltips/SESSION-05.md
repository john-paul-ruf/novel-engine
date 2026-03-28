# SESSION-05 — Polish, Edge Cases & Documentation

> **Feature:** onboarding-guide-tooltips
> **Layer(s):** Renderer / Domain
> **Depends on:** SESSION-03, SESSION-04
> **Estimated effort:** 15 min

---

## Context

Sessions 01-04 built the full tooltip and guided tour system. This final session handles polish, edge cases, and documentation updates per the AGENTS.md protocol.

Key items:
- Ensure tooltips are suppressed during active tours (no double-overlays)
- Add a help button in the sidebar header to replay tours on demand
- Handle window resize during tour (recalculate spotlight position)
- Update all architecture docs and changelog

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/components/common/Tooltip.tsx` | Modify | Add global tour-active suppression |
| `src/renderer/components/common/GuidedTourOverlay.tsx` | Modify | Handle window resize, improve accessibility |
| `src/renderer/components/Layout/Sidebar.tsx` | Modify | Add help button near sidebar header |
| `docs/architecture/DOMAIN.md` | Modify | Document new tour types |
| `docs/architecture/RENDERER.md` | Modify | Document tour store, Tooltip, GuidedTourOverlay |
| `docs/architecture/ARCHITECTURE.md` | Modify | Update source tree |
| `CHANGELOG.md` | Modify | Append feature entry |

---

## Implementation

### 1. Suppress Tooltips During Active Tours

Read `src/renderer/components/common/Tooltip.tsx`.

Import `useTourStore`. Check if a tour is active:

```typescript
const isTourActive = useTourStore((s) => s.activeTourId !== null);
```

If `isTourActive || disabled`, skip rendering the tooltip entirely.

### 2. Handle Window Resize During Tour

Read `src/renderer/components/common/GuidedTourOverlay.tsx`.

Add `useEffect` that listens for `window resize` events when active. On resize, recalculate spotlight rect and popover position.

Also add a `ResizeObserver` on the target element for sidebar collapse/expand cases.

### 3. Improve Accessibility

In `GuidedTourOverlay.tsx`:
- Add `role="dialog"` and `aria-modal="true"` to the overlay container
- Add `aria-label` to the popover with step info
- Auto-focus the "Next" button on step change
- Add `aria-live="polite"` to the step body

In `Tooltip.tsx`:
- Add `role="tooltip"` to the tooltip element
- Add `aria-describedby` to the trigger using `useId()` (React 18)

### 4. Add Help Button to Sidebar

Read `src/renderer/components/Layout/Sidebar.tsx`.

Add a small "?" button near the top of the sidebar. When clicked, shows a popover with tour options:
- "Welcome Tour" starts `welcome` tour
- "Pipeline Guide" starts `pipeline-intro` tour

Implementation:
- `useState` for popover open/close
- "?" icon: 20x20 circle, styled subtly
- Popover: positioned right, small menu
- Close after selection
- Styling: `h-6 w-6 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xs`

### 5. Documentation Updates

Update all docs per AGENTS.md protocol. See the full documentation content in the Verification section — ensure CHANGELOG.md entry covers all files created/modified, architecture docs reflect new types/stores/components, and source tree is current.

---

## Architecture Compliance

- [x] All changes maintain layer boundaries
- [x] No new IPC channels
- [x] Tooltip suppression reads from store, no new business logic
- [x] Accessibility uses standard HTML/ARIA attributes
- [x] Documentation reflects actual code state

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Tooltips do NOT appear while a guided tour is active
3. Window resize during tour recalculates spotlight position
4. Help button in sidebar opens tour menu
5. Screen reader announces tour step changes
6. CHANGELOG.md has complete entry
7. Architecture docs reflect all new files and types
8. End-to-end: onboarding, welcome tour, tooltips on hover, replay from settings

---

## State Update

After completing this session, update `prompts/feature/onboarding-guide-tooltips/STATE.md`:
- Set SESSION-05 status to `done`
- Set Completed date
- Mark all sessions as done
- Write final observations in Handoff Notes
