# SESSION-02 — Domain Types & Interface for Research + Field Fill

> **Program:** Novel Engine
> **Feature:** query-auto-populate
> **Modules:** M-DOMAIN (types, interfaces)
> **Depends on:** Nothing
> **Estimated effort:** 20–25 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M-DOMAIN | `src/domain/types.ts` | Lines 459–495 (Query types section) | Add new types after existing query types |
| M-DOMAIN | `src/domain/interfaces.ts` | Lines 947–974 (`IQueryService`) | Add two new methods to interface |

## Context

We need domain types for the two new operations:
1. **Bulk target research** — Quill searches the web for appropriate agents/publishers and adds targets to the tracker
2. **Per-field fill** — Quill researches and updates a single field on an existing target

These are pure type additions — no logic changes.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/domain/types.ts` | Modify | Add `QueryFillableField` type and `QueryResearchResult` type after existing query types |
| `src/domain/interfaces.ts` | Modify | Add `researchTargets()` and `fillTargetField()` methods to `IQueryService` |

## Implementation

### 1. Add Domain Types

Read `src/domain/types.ts` around line 488 (after `QueryLetter`). Add:

```typescript
// === Query Research & Field Fill ===

export type QueryFillableField =
  | 'contact'
  | 'method'
  | 'link'
  | 'personalizationNotes'
  | 'notes';

export type QueryResearchResult = {
  addedTargets: number;
  targetNames: string[];
  conversationId: string;
};

export type QueryFieldFillResult = {
  targetId: string;
  field: QueryFillableField;
  oldValue: string;
  newValue: string;
  conversationId: string;
};
```

### 2. Add Interface Methods

Read `src/domain/interfaces.ts` around line 973 (end of `IQueryService`, before the closing `}`). Add:

```typescript
  /** Quill researches appropriate submission targets for the book and adds them to the tracker. Streams via onEvent. */
  researchTargets(bookSlug: string, onEvent: (event: StreamEvent) => void): Promise<QueryResearchResult>;

  /** Quill researches and fills a single field on an existing target. Streams via onEvent. */
  fillTargetField(bookSlug: string, targetId: string, field: QueryFillableField, onEvent: (event: StreamEvent) => void): Promise<QueryFieldFillResult>;
```

Make sure `StreamEvent` is already imported in types.ts (it is — used by existing `generateQueryLetter`). For `interfaces.ts`, ensure `StreamEvent`, `QueryResearchResult`, and `QueryFieldFillResult` are imported at the top.

## Verification

1. `npx tsc --noEmit` — type check passes
2. Grep for `QueryFillableField` in `src/domain/types.ts` — exists
3. Grep for `researchTargets` in `src/domain/interfaces.ts` — exists on `IQueryService`
4. Grep for `fillTargetField` in `src/domain/interfaces.ts` — exists on `IQueryService`

## State Update

Update `prompts/session-program/program-021/STATE.md`:
- Set SESSION-02 status to `done`
- Add completion date
- Handoff: Domain types and interface methods ready. SESSION-03 can implement the QueryService logic.