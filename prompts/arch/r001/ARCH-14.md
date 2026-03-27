# ARCH-14 — Standardize Agent Filenames

> **Issue:** #10 (Inconsistent agent filename casing)
> **Severity:** Cosmetic
> **Effort:** Trivial
> **Depends on:** Nothing (run after ARCH-01 if possible)

---

## Objective

Standardize all agent prompt filenames to `UPPER-CASE.md`. Currently `FORGE.MD` (uppercase extension) and `Quill.md` (PascalCase) are outliers.

---

## Implementation Steps

### 1. Rename the outliers

- `FORGE.MD` -> `FORGE.md`
- `Quill.md` -> `QUILL.md`

### 2. Update AGENT_REGISTRY in constants.ts

```typescript
Forge: { filename: 'FORGE.md', ... },  // was FORGE.MD
Quill: { filename: 'QUILL.md', ... },  // was Quill.md
```

### 3. Update bootstrap.ts

Update the default agent file list in `ensureAgents()`. Add a one-time rename migration:

```typescript
const renames = [
  ['FORGE.MD', 'FORGE.md'],
  ['Quill.md', 'QUILL.md'],
];
for (const [oldName, newName] of renames) {
  const oldPath = path.join(agentsDir, oldName);
  const newPath = path.join(agentsDir, newName);
  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    fs.renameSync(oldPath, newPath);
  }
}
```

### 4. Rename source files in the repository

Rename the bundled default agent files.

### 5. Search and fix all references

`grep -r 'FORGE\.MD\|Quill\.md' src/` — update every hit.

---

## Verification

1. `npx tsc --noEmit` passes
2. `grep -r 'FORGE\.MD\|Quill\.md' src/` returns zero hits
3. All AGENT_REGISTRY filenames use `UPPER-CASE.md` convention
4. Rename migration exists in bootstrap.ts

---

## State Update

Set ARCH-14 to `done` in `prompts/arch/STATE.md`.
