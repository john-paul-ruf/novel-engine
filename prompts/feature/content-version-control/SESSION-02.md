# SESSION-02 — Database Migration & Version Repository

> **Feature:** content-version-control
> **Layer(s):** Infrastructure
> **Depends on:** SESSION-01
> **Estimated effort:** 20 min

---

## Context

SESSION-01 added domain types (`FileVersion`, `FileVersionSummary`, `FileDiff`, etc.) and the `IVersionService` interface. This session creates the SQLite table and extends `DatabaseService` with the queries needed by the version service.

The `file_versions` table stores full file content snapshots. Each row represents a file at a specific point in time. Content hashing (SHA-256) prevents duplicate consecutive snapshots. The table uses an auto-increment integer PK for efficient ordering and range queries.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/infrastructure/database/migrations.ts` | Modify | Add migration v2 — create `file_versions` table with indexes |
| `src/infrastructure/database/DatabaseService.ts` | Modify | Add prepared statements and methods for version CRUD |
| `src/domain/interfaces.ts` | Modify | Add version-related methods to `IDatabaseService` |

---

## Implementation

### 1. Add version repository methods to `IDatabaseService`

Read `src/domain/interfaces.ts`. Add the following imports to the existing import block:

```typescript
import type {
  // ... existing imports ...
  FileVersion,
  FileVersionSource,
  FileVersionSummary,
} from './types';
```

Add the following methods to the `IDatabaseService` interface, in a new `// File Versions` section before the `// Lifecycle` section:

```typescript
  // File Versions
  insertFileVersion(params: {
    bookSlug: string;
    filePath: string;
    content: string;
    contentHash: string;
    byteSize: number;
    source: FileVersionSource;
  }): FileVersion;

  getFileVersion(id: number): FileVersion | null;

  getLatestFileVersion(bookSlug: string, filePath: string): FileVersionSummary | null;

  listFileVersions(bookSlug: string, filePath: string, limit: number, offset: number): FileVersionSummary[];

  countFileVersions(bookSlug: string, filePath: string): number;

  deleteFileVersionsBeyondLimit(bookSlug: string, filePath: string, keepCount: number): number;

  /**
   * Get all distinct file paths that have version history for a book.
   * Used by the pruning job to iterate over all tracked files.
   */
  getVersionedFilePaths(bookSlug: string): string[];
```

### 2. Add migration v2 to `src/infrastructure/database/migrations.ts`

Read `src/infrastructure/database/migrations.ts`. Add migration version 2 to the `MIGRATIONS` array:

```typescript
  {
    version: 2,
    description: 'Create file_versions table for content version control',
    sql: `
      CREATE TABLE IF NOT EXISTS file_versions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        book_slug     TEXT NOT NULL,
        file_path     TEXT NOT NULL,
        content       TEXT NOT NULL,
        content_hash  TEXT NOT NULL,
        byte_size     INTEGER NOT NULL,
        source        TEXT NOT NULL CHECK(source IN ('user', 'agent', 'revert')),
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_file_versions_lookup
        ON file_versions(book_slug, file_path, id DESC);

      CREATE INDEX IF NOT EXISTS idx_file_versions_hash
        ON file_versions(book_slug, file_path, content_hash);
    `,
  },
```

### 3. Add prepared statements and methods to `DatabaseService`

Read `src/infrastructure/database/DatabaseService.ts`. Add the following:

**New prepared statements** (declare as class members alongside the existing ones):

```typescript
  // File versions
  private stmtInsertFileVersion: Database.Statement;
  private stmtGetFileVersion: Database.Statement;
  private stmtGetLatestFileVersion: Database.Statement;
  private stmtListFileVersions: Database.Statement;
  private stmtCountFileVersions: Database.Statement;
  private stmtGetVersionedFilePaths: Database.Statement;
```

**Initialize in constructor** (after existing statement preparations):

```typescript
    this.stmtInsertFileVersion = this.db.prepare(`
      INSERT INTO file_versions (book_slug, file_path, content, content_hash, byte_size, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    this.stmtGetFileVersion = this.db.prepare(`
      SELECT id, book_slug, file_path, content, content_hash, byte_size, source, created_at
      FROM file_versions WHERE id = ?
    `);

    this.stmtGetLatestFileVersion = this.db.prepare(`
      SELECT id, book_slug, file_path, content_hash, byte_size, source, created_at
      FROM file_versions
      WHERE book_slug = ? AND file_path = ?
      ORDER BY id DESC LIMIT 1
    `);

    this.stmtListFileVersions = this.db.prepare(`
      SELECT id, book_slug, file_path, content_hash, byte_size, source, created_at
      FROM file_versions
      WHERE book_slug = ? AND file_path = ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `);

    this.stmtCountFileVersions = this.db.prepare(`
      SELECT COUNT(*) AS count FROM file_versions
      WHERE book_slug = ? AND file_path = ?
    `);

    this.stmtGetVersionedFilePaths = this.db.prepare(`
      SELECT DISTINCT file_path FROM file_versions
      WHERE book_slug = ?
      ORDER BY file_path
    `);
```

**Implement the methods:**

```typescript
  insertFileVersion(params: {
    bookSlug: string;
    filePath: string;
    content: string;
    contentHash: string;
    byteSize: number;
    source: FileVersionSource;
  }): FileVersion {
    const info = this.stmtInsertFileVersion.run(
      params.bookSlug, params.filePath, params.content,
      params.contentHash, params.byteSize, params.source,
    );
    const id = Number(info.lastInsertRowid);
    const row = this.stmtGetFileVersion.get(id) as Record<string, unknown>;
    return this.mapFileVersion(row);
  }

  getFileVersion(id: number): FileVersion | null {
    const row = this.stmtGetFileVersion.get(id) as Record<string, unknown> | undefined;
    return row ? this.mapFileVersion(row) : null;
  }

  getLatestFileVersion(bookSlug: string, filePath: string): FileVersionSummary | null {
    const row = this.stmtGetLatestFileVersion.get(bookSlug, filePath) as Record<string, unknown> | undefined;
    return row ? this.mapFileVersionSummary(row) : null;
  }

  listFileVersions(bookSlug: string, filePath: string, limit: number, offset: number): FileVersionSummary[] {
    const rows = this.stmtListFileVersions.all(bookSlug, filePath, limit, offset) as Record<string, unknown>[];
    return rows.map((r) => this.mapFileVersionSummary(r));
  }

  countFileVersions(bookSlug: string, filePath: string): number {
    const row = this.stmtCountFileVersions.get(bookSlug, filePath) as { count: number };
    return row.count;
  }

  deleteFileVersionsBeyondLimit(bookSlug: string, filePath: string, keepCount: number): number {
    // Delete all versions except the most recent `keepCount`
    const stmt = this.db.prepare(`
      DELETE FROM file_versions
      WHERE book_slug = ? AND file_path = ? AND id NOT IN (
        SELECT id FROM file_versions
        WHERE book_slug = ? AND file_path = ?
        ORDER BY id DESC LIMIT ?
      )
    `);
    const info = stmt.run(bookSlug, filePath, bookSlug, filePath, keepCount);
    return info.changes;
  }

  getVersionedFilePaths(bookSlug: string): string[] {
    const rows = this.stmtGetVersionedFilePaths.all(bookSlug) as { file_path: string }[];
    return rows.map((r) => r.file_path);
  }

  // --- Private mapping helpers (add near other private helpers) ---

  private mapFileVersion(row: Record<string, unknown>): FileVersion {
    return {
      id: row.id as number,
      bookSlug: row.book_slug as string,
      filePath: row.file_path as string,
      content: row.content as string,
      contentHash: row.content_hash as string,
      byteSize: row.byte_size as number,
      source: row.source as FileVersionSource,
      createdAt: row.created_at as string,
    };
  }

  private mapFileVersionSummary(row: Record<string, unknown>): FileVersionSummary {
    return {
      id: row.id as number,
      bookSlug: row.book_slug as string,
      filePath: row.file_path as string,
      contentHash: row.content_hash as string,
      byteSize: row.byte_size as number,
      source: row.source as FileVersionSource,
      createdAt: row.created_at as string,
    };
  }
```

Add the necessary type imports at the top of `DatabaseService.ts`:

```typescript
import type {
  // ... existing imports ...
  FileVersion,
  FileVersionSource,
  FileVersionSummary,
} from '@domain/types';
```

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages (better-sqlite3)
- [x] Application imports only from domain interfaces (not concrete classes)
- [x] IDatabaseService extended — DatabaseService implements all new methods
- [x] All queries use parameterized statements
- [x] Explicit snake_case -> camelCase mapping in every query method
- [x] No `any` types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Migration v2 creates the `file_versions` table on fresh database
3. All new `IDatabaseService` methods are implemented in `DatabaseService`
4. Prepared statements use parameterized queries (no string interpolation)
5. Indexes exist for the primary query patterns (book_slug + file_path + id DESC)

---

## State Update

After completing this session, update `prompts/feature/content-version-control/STATE.md`:
- Set SESSION-02 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
