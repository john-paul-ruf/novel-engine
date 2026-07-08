# SESSION-02 — viewStore v5: New View Routing

> **Program:** Novel Engine · **Feature:** streamlined-workspace-ui · **Modules:** M10
> **Depends on:** none (parallel-safe with S01) · **Estimated effort:** 25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M10 | renderer | `src/renderer/stores/viewStore.ts` (57 lines), `src/renderer/components/Layout/AppLayout.tsx`, `src/renderer/components/Layout/Sidebar.tsx` | Every ViewId producer/consumer |

## Context

Current `ViewId`: `dashboard | onboarding | chat | files | build | settings | statistics | pitch-room | reading`, persisted at version 4 with migrations. The redesign's primary views are `library | workspace | manuscript | exports`. During the migration BOTH sets must route so the app boots after every session; legacy views are deleted only in SESSION-14.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/renderer/stores/viewStore.ts` | modify | extend ViewId, persist v5 + migration, extend payload, add `navigateToPhase` |
| `src/renderer/components/Layout/AppLayout.tsx` | modify | placeholder mounts for the 4 new views |

## Implementation

### 1. Extend the store (read the whole file first)

```ts
type LegacyViewId = 'dashboard' | 'chat' | 'files' | 'build' | 'reading';
type ViewId =
  | 'library' | 'workspace' | 'manuscript' | 'exports'        // new primary
  | 'settings' | 'statistics' | 'pitch-room' | 'onboarding'   // carried over
  | LegacyViewId;                                             // removed in SESSION-14
```

Extend `ViewPayload` with `phaseId?: string` (workspace deep-link), `chapterSlug?: string`, and `manuscriptMode?: 'reader' | 'editor'` (manuscript deep-links). Keep the existing `files` view-mode inference in `navigate` untouched.

Bump persist to `version: 5`. In `migrate`, keep the v4 cases, then rewrite persisted legacy state forward: `dashboard → workspace`, `chat → workspace`, `reading → manuscript`, `build → exports`, `files → manuscript`. (Legacy views stay *routable*; migration only rewrites what was *persisted* so users land in the new UI after updating.)

### 2. Placeholder view mounts

In `AppLayout.tsx` `ViewContent`, add four wrappers following the existing hidden-unless-active pattern:

```tsx
<div className={`h-full ${currentView === 'library' ? '' : 'hidden'}`}>
  <div className="p-8 text-sm opacity-60">Library — arrives in SESSION-06</div>
</div>
```

…and likewise for `workspace` (S08 replaces), `manuscript` (S11), `exports` (S12).

### 3. Navigation helper

Export `navigateToPhase(phaseId: string): void` from `viewStore.ts` — thin wrapper calling `useViewStore.getState().navigate('workspace', { phaseId })`. SESSION-04 (palette) and SESSION-07 (spine) both use it; defining it here avoids a circular store import later.

## Verification

- `npx tsc --noEmit` passes
- `npm start`: app boots into the `workspace` placeholder (migration ran); all legacy sidebar nav buttons still navigate correctly
- DevTools: `localStorage.getItem('novel-engine-view')` contains `"version":5`
- Manually seed localStorage with v4 state `"currentView":"reading"`, reload → lands on the `manuscript` placeholder

## State Update

Set SESSION-02 `done` in STATE.md. Handoff: paste the final ViewId union and ViewPayload fields verbatim for S03/S04/S07/S11.
