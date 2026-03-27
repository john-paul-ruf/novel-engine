# ARCH-11 — Clean Up Wrangler Vestige

> **Issue:** #5 (Wrangler two-call pattern is dead code)
> **Severity:** Low-Medium
> **Effort:** Low
> **Depends on:** Nothing

---

## Objective

The Wrangler agent was designed for a two-call context planning pattern that was never implemented. It's actually used only by RevisionQueueService for parsing revision plans. Clarify its role and remove misleading references.

---

## Implementation Steps

### 1. Update AGENT_REGISTRY

Change Wrangler's role from `'Context Planner'` to `'Revision Plan Parser'`.

### 2. Search and clean references

Remove or update any references to "two-call pattern", "context planner", "IContextWrangler", "WranglerPlan", or "WranglerInput" in code and docs.

### 3. Update architecture docs

Document Wrangler's actual role: "Reserved for revision plan parsing by RevisionQueueService. Not a creative agent."

### 4. Verify WRANGLER.md

Check if the agent file exists and its content matches the revision-parsing use case.

---

## Verification

1. `npx tsc --noEmit` passes
2. `AGENT_REGISTRY.Wrangler.role` is `'Revision Plan Parser'`
3. No references to "two-call pattern" or "IContextWrangler"

---

## State Update

Set ARCH-11 to `done` in `prompts/arch/STATE.md`.
