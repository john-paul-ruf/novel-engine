# FIX-02 — Auto-Draft Audit/Fix Failure Should Pause Loop, Not Silently Continue

> **Issue(s):** 3.1
> **Severity:** 🟠 High
> **Category:** Error Handling
> **Effort:** Medium
> **Depends on:** Nothing

---

## Objective

When the audit or fix CLI call fails during auto-draft, the error is silently caught with `console.warn` and the loop advances to the next chapter. This means chapters accumulate without quality checks and the user has no idea the audit was skipped.

The fix changes the error handler to pause the loop (using the existing pause mechanism) so the user can decide how to proceed. It also tracks which chapters had skipped audits in the session state.

---

## Findings Addressed

| # | Issues.md Ref | Title | Severity |
|---|---------------|-------|----------|
| 1 | 3.1 | Audit/Fix Pass Errors Are Silently Caught — Loop Continues | 🟠 High |

---

## Files to Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/stores/autoDraftStore.ts` | Modify | Replace silent catch with pause; add `skippedAudits` tracking to session state |

---

## Implementation Steps

### 1. Read autoDraftStore.ts

Read `src/renderer/stores/autoDraftStore.ts` in full.

### 2. Add `skippedAudits` to `AutoDraftSession`

Find the `AutoDraftSession` type and add:

```typescript
skippedAudits: string[];  // chapter slugs where audit was skipped due to error
```

Initialize it to `[]` wherever a new session is created.

### 3. Replace the silent catch block

Find the try/catch around the audit/fix block (approximately lines 348-398). Replace the catch:

**Before:**
```typescript
} catch (err) {
  console.warn('[auto-draft] Audit/fix pass failed:', err);
}
```

**After:**
```typescript
} catch (err) {
  console.warn('[auto-draft] Audit/fix pass failed:', err);

  // Track the skipped audit so the user knows which chapters need manual review
  if (newChapterSlug) {
    patch({
      skippedAudits: [...(session()?.skippedAudits ?? []), newChapterSlug],
    });
  }

  // Pause the loop — let the user decide: resume (skip audit), or stop
  await new Promise<void>((resolve) => {
    patch({
      isPaused: true,
      pauseReason: `Audit/fix failed for ${newChapterSlug ?? 'chapter'}: ${err instanceof Error ? err.message : String(err)}. Resume to skip audit, or stop the loop.`,
      _resumeResolve: resolve,
    });
  });

  // Pause resolved — clean up
  patch({ isPaused: false, pauseReason: null, _resumeResolve: null });

  if (session()?.stopRequested) break;
}
```

This uses the existing pause/resume mechanism (same as the "no response" pause at line 440). When the user resumes, the loop continues to the next chapter. When the user stops, the loop exits.

### 4. Expose `skippedAudits` in the UI-facing session state

If there is a getter or derived state that exposes session info to components, ensure `skippedAudits` is included. Check if any component reads session state and would benefit from showing a "N chapters need manual audit" indicator.

At minimum, the `skippedAudits` array should be accessible so the auto-draft UI can display something like:

```
⚠ 2 chapters skipped audit: 03-the-crossing, 07-aftermath
```

### 5. Log the skipped audits on session completion

In the session completion logic (where the loop ends and status is set to `'completed'` or `'stopped'`), log the skipped audits:

```typescript
const skipped = session()?.skippedAudits ?? [];
if (skipped.length > 0) {
  console.warn(`[auto-draft] Session completed with ${skipped.length} skipped audits:`, skipped);
}
```

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Grep for `console.warn('[auto-draft] Audit/fix pass failed'` — should still exist (for logging) but now followed by the pause logic
3. Grep for `skippedAudits` — should appear in the session type, initialization, catch block, and completion logic
4. The old silent-continue pattern (`catch (err) { console.warn(...) }` with nothing else) should no longer exist for the audit/fix block

---

## State Update

After completing this prompt, update `prompts/arch/r003/STATE.md`:
- Set FIX-02 status to `done`
- Set Completed date
- Add notes about any complications or design decisions
