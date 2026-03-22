# Wrangler Cache Cycle Reset — Session Prompt

## Goal

Fix a bug where the `RevisionQueueService`'s on-disk cache and session state from the **first revision cycle** leak into the **second revision cycle** (mechanical fixes), causing sessions to be incorrectly marked as `approved` or `skipped` before they have been run.

---

## The Problem

The `RevisionQueueService` persists two files per book:

1. **`source/revision-plan-cache.json`** — the Wrangler's parsed output (sessions, tasks, phases), keyed by a content hash of `project-tasks.md` + `revision-prompts.md`
2. **`source/revision-queue-state.json`** — per-session statuses (`approved`, `rejected`, `skipped`), conversation IDs, and an embedded copy of the parsed data as a fallback

When the pipeline transitions from the first revision cycle to the second (mechanical fixes), the flow is:

1. First cycle: Forge writes `project-tasks.md` + `revision-prompts.md` → Wrangler parses → cache + state files created → sessions run and approved
2. Pipeline advances through second-read → second-assessment → copy-edit
3. Forge writes **new** `project-tasks.md` + `revision-prompts.md` for mechanical fixes. The first-cycle files are archived to `project-tasks-v1.md` and `revision-prompts-v1.md`.
4. `loadPlan()` is called for the second cycle

At step 4, the **content hash changes** (because the files are different), so the Wrangler is correctly re-called. However, **the state file from the first cycle is still on disk**. The state merger at line ~431 of `RevisionQueueService.ts` runs unconditionally:

```typescript
if (savedState?.sessions) {
  for (const session of sessions) {
    const saved = savedState.sessions[session.index];
    if (saved) {
      if (saved.status === 'approved' || saved.status === 'rejected' || saved.status === 'skipped') {
        session.status = saved.status;
      }
      if (saved.conversationId) {
        session.conversationId = saved.conversationId;
      }
    }
  }
}
```

This merges by **session index**, not by content identity. If the first cycle had sessions 1–10 (all `approved`) and the second cycle has sessions 1–6, sessions 1–6 will be incorrectly set to `approved` — they inherit the first cycle's statuses because the indices overlap.

### Secondary Issues

- The `parsedByBook` in-memory map may hold stale data from the first cycle
- The `hashByBook` map caches the old content hash
- The embedded `parsed` field in the state file serves as a fallback recovery path — if the cache file is missing but the state file exists with a matching hash, the old parsed data is recovered. This is a valid fallback for the *same* cycle (e.g., after a reinstall), but it should never recover data across cycles.

---

## The Fix

### Strategy: Detect cycle transitions and auto-clear stale state

When `loadPlan()` determines it is loading the **second revision cycle** (mechanical fixes), it must clear any first-cycle cache and state files before proceeding. The cycle detection is straightforward: if `audit-report.md` exists AND `project-tasks-v1.md` exists (the archived first-cycle tasks), we are in the second cycle.

The fix has two parts:

### Part 1: Auto-clear on cycle transition (`RevisionQueueService.ts`)

In `loadPlan()`, after the existing cycle detection block (line ~255) and before reading the cache/state files, add cycle-aware cache invalidation.

**Detect the cycle transition:**

The state file records which cycle it belongs to via `planHash`. But this is unreliable across cycles because it stores a hash of the *previous* cycle's content. Instead, add a `revisionCycle` field to the state file — either `1` (first revision) or `2` (mechanical fixes). When loading in cycle 2 but the state file says cycle 1, the state is stale and must be cleared.

**Modify `SessionStateFile` type** (at the top of `RevisionQueueService.ts`):

```typescript
type SessionStateFile = {
  planHash: string;
  mode: QueueMode;
  revisionCycle: 1 | 2;  // NEW — which revision cycle this state belongs to
  sessions: Record<number, {
    status: RevisionSessionStatus;
    conversationId: string | null;
  }>;
  parsed?: ParsedWranglerOutput;
};
```

**In `loadPlan()`**, after the cycle detection block:

```typescript
// Determine which cycle we're loading
const isSecondCycle = auditExists && archivedTasksExist;
const currentCycle: 1 | 2 = isSecondCycle ? 2 : 1;

// Check if the on-disk state belongs to a different cycle
const savedStateForCycleCheck = await this.readState(bookSlug);
if (savedStateForCycleCheck && (savedStateForCycleCheck.revisionCycle ?? 1) !== currentCycle) {
  console.log(
    `[RevisionQueue] Cycle transition detected: state is cycle ${savedStateForCycleCheck.revisionCycle ?? 1}, ` +
    `now loading cycle ${currentCycle}. Clearing stale cache and state.`
  );
  await this.clearCache(bookSlug);
}
```

This leverages the existing `clearCache()` method which already deletes both the cache file and the state file, plus clears all in-memory maps.

**In `writeState()`**, include the cycle field:

```typescript
private async writeState(bookSlug: string, plan: RevisionPlan, contentHash: string): Promise<void> {
  const parsed = this.parsedByBook.get(bookSlug);

  // Determine cycle from plan context — if audit-report.md detection was
  // done during loadPlan, this is already known. Use a simple heuristic:
  // if project-tasks-v1.md existed at load time, we're in cycle 2.
  const revisionCycle = this.cycleByBook.get(bookSlug) ?? 1;

  const state: SessionStateFile = {
    planHash: contentHash,
    mode: plan.mode,
    revisionCycle,
    sessions: {},
    parsed,
  };
  // ... rest unchanged
}
```

**Add a new in-memory map** to track the current cycle per book:

```typescript
private cycleByBook: Map<string, 1 | 2> = new Map();
```

Set it in `loadPlan()` right after the cycle detection:

```typescript
this.cycleByBook.set(bookSlug, currentCycle);
```

Clear it in `clearCache()`:

```typescript
this.cycleByBook.delete(bookSlug);
```

### Part 2: Defensive state merge guard

Even with cycle-aware clearing, add a belt-and-suspenders guard to the state merge logic. Only merge session statuses when the state file's `planHash` matches the current content hash — a hash mismatch means the plan content genuinely changed and old statuses are meaningless:

**Replace** the current unconditional merge block:

```typescript
// 5. Merge saved session state (only if the plan content hasn't changed).
if (savedState?.sessions && savedState.planHash === contentHash) {
  this.emit({ type: 'plan:loading-step', step: 'Restoring session progress…' });
  for (const session of sessions) {
    const saved = savedState.sessions[session.index];
    if (saved) {
      if (saved.status === 'approved' || saved.status === 'rejected' || saved.status === 'skipped') {
        session.status = saved.status;
      }
      if (saved.conversationId) {
        session.conversationId = saved.conversationId;
      }
    }
  }
} else if (savedState?.sessions) {
  console.log(
    `[RevisionQueue] Skipping state merge: plan hash mismatch ` +
    `(state: ${savedState.planHash}, current: ${contentHash}). ` +
    `This is expected after a cycle transition or content change.`
  );
}
```

**Important:** The current code intentionally relaxes the hash check for the state merge (comment at line ~428 says "the hash check is intentionally relaxed because reinstalls / normalization upgrades can change the hash without changing the actual plan structure"). This relaxation was valid for single-cycle use, but it's the root cause of the cross-cycle leak. The fix above tightens the merge to require a hash match, which is safe now that the `computeHash` method normalizes whitespace and checkbox state — the only remaining hash changes represent genuine content differences.

---

## Files to Modify

### `src/application/RevisionQueueService.ts`

1. **Add `revisionCycle` to `SessionStateFile` type** — `revisionCycle: 1 | 2`
2. **Add `cycleByBook` map** — `private cycleByBook: Map<string, 1 | 2> = new Map()`
3. **In `loadPlan()`** — after cycle detection, check state file cycle and auto-clear if mismatched
4. **In `loadPlan()`** — tighten the state merge to require `planHash === contentHash`
5. **In `writeState()`** — include `revisionCycle` from `cycleByBook` map
6. **In `clearCache()`** — also clear `cycleByBook` entry
7. **Default `revisionCycle` to `1`** when reading state files that don't have the field (backward compatibility with existing state files from before this fix)

---

## Edge Cases

### Existing state files without `revisionCycle`

State files created before this fix won't have the `revisionCycle` field. Use `(savedStateForCycleCheck.revisionCycle ?? 1)` to default to cycle 1. This is correct because:
- If the user is in cycle 1, `currentCycle` is also 1 → no mismatch → no clear
- If the user is in cycle 2 but the state file has no cycle field, it defaults to 1 → mismatch detected → stale state cleared (correct behavior — this is exactly the bug case)

### User reverts from cycle 2 back to cycle 1

If the user reverts the `revision-plan-2` or `mechanical-fixes` phase via `PipelineService.revertPhase()`, the pipeline goes back. The next `loadPlan()` call would detect `currentCycle = 1` (because `archivedTasksExist` may still be true but `auditExists` may not — depends on how far they reverted). The cycle detection handles this naturally:
- If they revert to before `copy-edit`, `auditExists` is false → cycle 1 → state file says cycle 2 → mismatch → clear (correct)
- If they only revert `mechanical-fixes` but `audit-report.md` still exists and `project-tasks-v1.md` still exists → cycle 2 → depends on state file — if it says cycle 2 and hash matches, merge is valid

### Manual cache clear still works

The existing `clearCache()` method and its IPC handler are unchanged in behavior. Users can still force-clear from the UI. The new cycle detection is automatic and complementary.

---

## Verification

1. **Unit scenario**: Simulate two revision cycles with overlapping session indices:
   - Create state file with cycle 1, sessions 1–5 all `approved`
   - Call `loadPlan()` with `audit-report.md` and `project-tasks-v1.md` present (cycle 2)
   - Verify: all sessions start as `pending`, not `approved`

2. **Same-cycle reload preserves state**:
   - Run cycle 2 sessions 1–3, approve them
   - Reload the plan (same cycle, same content)
   - Verify: sessions 1–3 are still `approved`, sessions 4+ are `pending`

3. **Backward compatibility**:
   - Load a book with an old state file (no `revisionCycle` field) in cycle 1
   - Verify: state merge works normally (defaults to cycle 1, matches current cycle 1)

4. **`npx tsc --noEmit` passes** with no errors.
