# SESSION-05 — queryStore: researchTargets + fillTargetField Actions

> **Program:** Novel Engine
> **Feature:** query-auto-populate
> **Modules:** M-RENDERER (queryStore)
> **Depends on:** SESSION-04 (preload bridge)
> **Estimated effort:** 15–20 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M-RENDERER | `src/renderer/stores/queryStore.ts` | Full file (98 lines) | Add two new actions following existing pattern |
| M-DOMAIN | `src/domain/types.ts` | New types from SESSION-02 | Import for return types |

## Context

The store already has `generateLetter` which calls the bridge, sets streaming state, and reloads the tracker. We follow the same pattern for `researchTargets` and `fillTargetField`.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/renderer/stores/queryStore.ts` | Modify | Add `researchTargets` and `fillTargetField` actions + state fields |

## Implementation

### 1. Add Imports

Update the import from `@domain/types` at the top:

```typescript
import type { QueryTracker, QueryTarget, QueryStatus, QueryLetter, QueryResearchResult, QueryFieldFillResult, QueryFillableField, StreamEvent } from '@domain/types';
```

### 2. Add State Fields

In the `QueryStoreState` type, add:

```typescript
isResearching: boolean;
researchBuffer: string;
fillingFor: string | null;
```

### 3. Add Action Signatures

In the `QueryStoreState` type, add:

```typescript
researchTargets: () => Promise<QueryResearchResult | null>;
fillTargetField: (targetId: string, field: QueryFillableField) => Promise<QueryFieldFillResult | null>;
```

### 4. Add Initial State

In the `create<QueryStoreState>` call, add:

```typescript
isResearching: false,
researchBuffer: '',
fillingFor: null,
```

### 5. Implement Actions

Add after `generateLetter`:

```typescript
researchTargets: async () => {
  const bookSlug = useBookStore.getState().activeSlug;
  if (!bookSlug) return null;
  set({ isResearching: true, researchBuffer: '', error: null });
  try {
    const result = await window.novelEngine.query.researchTargets(bookSlug);
    set({ isResearching: false, researchBuffer: '' });
    await get().load(bookSlug);
    return result;
  } catch (err) {
    console.error('[queryStore] Research failed:', err);
    set({ isResearching: false, researchBuffer: '', error: 'Target research failed' });
    return null;
  }
},

fillTargetField: async (targetId, field) => {
  const bookSlug = useBookStore.getState().activeSlug;
  if (!bookSlug) return null;
  set({ fillingFor: targetId, error: null });
  try {
    const result = await window.novelEngine.query.fillTargetField(bookSlug, targetId, field);
    set({ fillingFor: null });
    await get().load(bookSlug);
    return result;
  } catch (err) {
    console.error('[queryStore] Field fill failed:', err);
    set({ fillingFor: null, error: 'Field research failed' });
    return null;
  }
},
```

Note: You need to import `useBookStore` at the top of the file. Add:

```typescript
import { useBookStore } from './bookStore';
```

### 6. Update initStreamListener

The existing `initStreamListener` already captures `textDelta` events into `streamBuffer`. Extend it to also accumulate into `researchBuffer` when `isResearching` is true:

```typescript
initStreamListener: () => {
  const cleanup = window.novelEngine.query.onStream((event: StreamEvent) => {
    if (event.type === 'textDelta') {
      set((state) => ({
        streamBuffer: state.isGenerating ? state.streamBuffer + event.text : state.streamBuffer,
        researchBuffer: state.isResearching ? state.researchBuffer + event.text : state.researchBuffer,
      }));
    }
  });
  return cleanup;
},
```

### 7. Update clear()

Add the new fields to the `clear` action:

```typescript
clear: () => {
  set({ tracker: null, letters: [], loading: false, error: null, generatingFor: null, isGenerating: false, streamBuffer: '', isResearching: false, researchBuffer: '', fillingFor: null });
},
```

## Verification

1. `npx tsc --noEmit` — type check passes
2. `researchTargets` action exists on the store
3. `fillTargetField` action exists on the store
4. `isResearching` state is set/cleared correctly
5. `fillingFor` state is set/cleared correctly

## State Update

Update `prompts/session-program/program-021/STATE.md`:
- Set SESSION-05 status to `done`
- Add completion date
- Handoff: Store actions ready. SESSION-06 can build the UI components.