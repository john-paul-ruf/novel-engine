# SESSION-01 — Baseline-Diff Foundation: Domain Type, DB Query, VersionService API

> **Program:** Novel Engine · **Feature:** tracked-chapter-editing
> **Modules:** M01 (domain), M03 (database), M08 (application)
> **Depends on:** none · **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M01 | domain | `src/domain/types.ts` (lines 495–530), `src/domain/interfaces.ts` (lines 655–715) | `FileVersion` types + `IVersionService`/`IDatabaseService` contracts to extend |
| M03 | database | `src/infrastructure/database/DatabaseService.ts` (lines 180–220, 505–560) | Prepared statements + prune SQL to extend |
| M08 | application | `src/application/VersionService.ts` (full file, 236 lines) | Service to extend; `computeDiff` helper to reuse |

## Context

Verity drafts become user-editable (SESSION-03). Attribution already exists: `files:write`
snapshots as `'user'`, the book watcher snapshots agent writes as `'agent'`. This session adds
the query layer that derives **user edits = diff(latest agent snapshot → current disk content)**
and protects the agent baseline from pruning.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | modify | Add `ChapterEditStatus` type |
| `src/domain/interfaces.ts` | modify | Add 1 method to `IDatabaseService`, 2 to `IVersionService` |
| `src/infrastructure/database/DatabaseService.ts` | modify | New prepared statement + baseline-pinning prune SQL |
| `src/application/VersionService.ts` | modify | `getUserEditsSinceAgentBaseline`, `getChapterEditStatuses` |

## Implementation

### 1. Domain type (`src/domain/types.ts`)

Add after `FileVersionSummary` (line ~513), in the `=== Version Control ===` section:

```typescript
/** Per-chapter pending user-edit status, derived from the agent-baseline diff. */
export type ChapterEditStatus = {
  chapterSlug: string;        // e.g. "02-the-notebook"
  filePath: string;           // "chapters/02-the-notebook/draft.md"
  hasUserEdits: boolean;      // disk content differs from latest agent snapshot
  addedLines: number;         // 0 when hasUserEdits is false
  removedLines: number;       // 0 when hasUserEdits is false
  lastUserEditAt: string | null; // ISO date of latest 'user' snapshot, if any
};
```

### 2. Database layer (`src/infrastructure/database/DatabaseService.ts`)

Read the constructor statement block (lines ~184–216) first. Add a prepared statement field and
initialization next to `stmtGetLatestFileVersion`:

```typescript
this.stmtGetLatestFileVersionBySource = this.db.prepare(`
  SELECT id, book_slug, file_path, content, content_hash, byte_size, source, created_at
  FROM file_versions
  WHERE book_slug = ? AND file_path = ? AND source = ?
  ORDER BY id DESC LIMIT 1
`);
```

Add the public method (near `getLatestFileVersion`, line ~530) — note it returns the **full**
`FileVersion` (content included), unlike `getLatestFileVersion`:

```typescript
getLatestFileVersionBySource(
  bookSlug: string,
  filePath: string,
  source: FileVersionSource,
): FileVersion | null {
  const row = this.stmtGetLatestFileVersionBySource.get(bookSlug, filePath, source) as
    | Record<string, unknown>
    | undefined;
  return row ? this.mapFileVersion(row) : null;
}
```

**Baseline pinning:** modify `deleteFileVersionsBeyondLimit` (line ~545) so the latest
`agent` version is never pruned:

```sql
DELETE FROM file_versions
WHERE book_slug = ? AND file_path = ?
  AND id NOT IN (
    SELECT id FROM file_versions
    WHERE book_slug = ? AND file_path = ?
    ORDER BY id DESC LIMIT ?
  )
  AND id != COALESCE((
    SELECT id FROM file_versions
    WHERE book_slug = ? AND file_path = ? AND source = 'agent'
    ORDER BY id DESC LIMIT 1
  ), -1)
```

Update the `stmt.run(...)` call to pass `bookSlug, filePath` a third time.

### 3. Domain interfaces (`src/domain/interfaces.ts`)

In `IDatabaseService` (find the existing file-version method group) add:

```typescript
/** Latest snapshot of a file authored by the given source (full content), or null. */
getLatestFileVersionBySource(bookSlug: string, filePath: string, source: FileVersionSource): FileVersion | null;
```

In `IVersionService` (line ~661) add:

```typescript
/**
 * Diff from the latest agent-authored snapshot (baseline) to the file's current
 * disk content. Returns null when no agent baseline exists, the file is missing,
 * or content is identical to the baseline.
 */
getUserEditsSinceAgentBaseline(bookSlug: string, filePath: string): Promise<FileDiff | null>;

/** Pending user-edit status for every body-chapter draft in the book. */
getChapterEditStatuses(bookSlug: string): Promise<ChapterEditStatus[]>;
```

Add `ChapterEditStatus` to the type imports at the top.

### 4. VersionService (`src/application/VersionService.ts`)

`getUserEditsSinceAgentBaseline` — reuse the private `hashContent`, `computeDiff`, `toSummary`
helpers:

```typescript
async getUserEditsSinceAgentBaseline(bookSlug: string, filePath: string): Promise<FileDiff | null> {
  const baseline = this.db.getLatestFileVersionBySource(bookSlug, filePath, 'agent');
  if (!baseline) return null;
  let current: string;
  try {
    current = await this.fs.readFile(bookSlug, filePath);
  } catch {
    return null; // file deleted — nothing to report
  }
  const currentHash = this.hashContent(current);
  if (currentHash === baseline.contentHash) return null;
  const hunks = this.computeDiff(baseline.content, current, filePath);
  // Count totalAdditions/totalDeletions over hunks exactly as getDiff() does.
  // newVersion is a synthetic summary for "current disk content" (id: -1 sentinel):
  const latestUser = this.db.getLatestFileVersionBySource(bookSlug, filePath, 'user');
  const newVersion: FileVersionSummary = {
    id: -1, bookSlug, filePath, contentHash: currentHash,
    byteSize: Buffer.byteLength(current, 'utf-8'),
    source: 'user', createdAt: latestUser?.createdAt ?? baseline.createdAt,
  };
  return { oldVersion: this.toSummary(baseline), newVersion, hunks, totalAdditions, totalDeletions };
}
```

`getChapterEditStatuses` — list `chapters/` via `this.fs.listDirectory(bookSlug, 'chapters')`,
keep directories whose name matches `/^(\d+)-/` with number ≥ 2 (mirrors the `isVerityDraft`
rule in `ManuscriptView.tsx:14`). For each, call `getUserEditsSinceAgentBaseline` on
`chapters/{dir}/draft.md`; when non-null, sum add/remove lines from hunks. Wrap each chapter
in try/catch (`console.error`, skip) so one bad chapter doesn't fail the whole list.

## Verification

1. `npx tsc --noEmit` — clean.
2. Architecture compliance: `VersionService` still imports only `@domain/*` + `diff` + `node:crypto`;
   no `any`; DB layer contains no business logic beyond queries.
3. Manual (dev DB): on a book with an agent-written chapter + a hand edit, verify the latest
   `agent` row survives `pruneVersions(slug, 1)` while older rows are deleted.

## State Update

Mark SESSION-01 done in STATE.md with date + notes. Handoff: list exact new method names and
any deviation in the synthetic-summary shape (SESSION-02/05 consume these APIs).
