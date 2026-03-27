# ARCH-12 — Audit and Fix Silent Error Swallowing

> **Issue:** #7 (113 bare catch blocks)
> **Severity:** Low-Medium
> **Effort:** Low
> **Depends on:** Nothing

---

## Objective

Audit all bare `catch {}` blocks. For expected errors (ENOENT), add error code checks. For unexpected errors, add `console.warn` with context. No behavioral changes — just visibility.

---

## Implementation Steps

### 1. Find all bare catch blocks

```bash
grep -rn 'catch\s*{' src/ --include='*.ts' --include='*.tsx'
grep -rn 'catch\s*(' src/ --include='*.ts' --include='*.tsx' | grep -v 'console'
```

### 2. Categorize each

- **Category A (Expected ENOENT):** Add `(err as NodeJS.ErrnoException).code !== 'ENOENT'` check, warn on unexpected
- **Category B (Swallowing real errors):** Add `console.warn('[ClassName] context:', err)`
- **Category C (Truly don't care):** Add comment explaining why

### 3. Priority files

- `src/infrastructure/filesystem/FileSystemService.ts`
- `src/infrastructure/claude-cli/ClaudeCodeClient.ts`
- `src/application/ChatService.ts`
- `src/application/RevisionQueueService.ts`
- `src/application/MotifLedgerService.ts`

### 4. Do NOT change behavior

Every catch that returns a default still returns the same default. Only add logging.

---

## Verification

1. `npx tsc --noEmit` passes
2. Bare catch count significantly reduced
3. Remaining bare catches have explanatory comments
4. No behavioral changes

---

## State Update

Set ARCH-12 to `done` in `prompts/arch/STATE.md`. Note: "Audited N blocks. Fixed M. Left K silent with comments."
