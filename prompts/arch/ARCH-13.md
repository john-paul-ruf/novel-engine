# ARCH-13 — Add Database Migration System

> **Issue:** #9 (No migration system)
> **Severity:** Low (compounds over time)
> **Effort:** Low
> **Depends on:** Nothing

---

## Objective

Add a simple, forward-only migration system to SQLite. Currently `schema.ts` uses `CREATE TABLE IF NOT EXISTS` with ad hoc ALTER TABLE checks. A migration runner prevents this from becoming debt.

---

## Implementation Steps

### 1. Create `src/infrastructure/database/migrations.ts`

Define a `Migration` type and a `MIGRATIONS` array:

```typescript
export type Migration = {
  version: number;
  description: string;
  sql: string;
};

export const MIGRATIONS: Migration[] = [
  {
    version: 0,
    description: 'Baseline — existing schema',
    sql: '', // No-op: already applied by schema.ts
  },
];
```

Implement `runMigrations(db: Database.Database)`:
1. Ensure `schema_version` table exists
2. Read `MAX(version)` — default -1 if empty
3. Run pending migrations in transactions
4. Record each in `schema_version`
5. Log applied migrations to console

### 2. Add schema_version table

```sql
CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER NOT NULL,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  description TEXT NOT NULL DEFAULT ''
);
```

### 3. Update `initializeSchema()` in schema.ts

After existing CREATE TABLE statements, call `runMigrations(db)`.

### 4. Convert any existing ad hoc ALTER TABLE checks

Move them into proper migration entries with sequential version numbers.

---

## Design Notes

- **Forward-only**: No down migrations. Desktop app rollback = restore from backup.
- **Transactions**: Each migration in its own transaction.
- **Baseline**: Version 0 records existing schema without executing SQL.
- **Plain SQL**: No ORM. Matches existing pattern.

---

## Verification

1. `npx tsc --noEmit` passes
2. `src/infrastructure/database/migrations.ts` exists
3. On app launch, `schema_version` table is created with version 0
4. Adding a version 1 migration applies it exactly once

---

## State Update

Set ARCH-13 to `done` in `prompts/arch/STATE.md`.
