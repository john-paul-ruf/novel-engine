# SESSION-03 — Install diff Package & VersionService

> **Feature:** content-version-control
> **Layer(s):** Application
> **Depends on:** SESSION-02
> **Estimated effort:** 25 min

---

## Context

SESSION-01 defined the domain types and `IVersionService` interface. SESSION-02 created the `file_versions` database table and added version repository methods to `DatabaseService`. This session implements the `VersionService` application service that orchestrates:

1. **Snapshotting** — hash content, dedup against last version, store in DB
2. **Diff computation** — use the `diff` npm package to produce structured, human-readable diffs
3. **Revert** — read a historical version, write it to disk, create a new "revert" snapshot
4. **Pruning** — delete old versions beyond a configurable retention limit

The `VersionService` depends on `IDatabaseService` (for storage) and `IFileSystemService` (for reading/writing files on disk). Both are injected as interfaces.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `package.json` | Modify | Add `diff` dependency |
| `src/application/VersionService.ts` | Create | Full implementation of `IVersionService` |

---

## Implementation

### 1. Install the `diff` package

```bash
npm install diff
npm install -D @types/diff
```

This package provides `structuredPatch()` which produces unified diff hunks — the exact structure our `DiffHunk` type represents.

### 2. Create `src/application/VersionService.ts`

Create the file with the following implementation:

```typescript
import { createHash } from 'node:crypto';
import { structuredPatch } from 'diff';
import type { IDatabaseService, IFileSystemService, IVersionService } from '@domain/interfaces';
import type {
  DiffHunk,
  DiffLine,
  DiffLineType,
  FileDiff,
  FileVersion,
  FileVersionSource,
  FileVersionSummary,
} from '@domain/types';

const DEFAULT_KEEP_COUNT = 50;
const VERSIONABLE_EXTENSIONS = new Set(['.md', '.json']);

export class VersionService implements IVersionService {
  constructor(
    private db: IDatabaseService,
    private fs: IFileSystemService,
  ) {}

  async snapshotFile(
    bookSlug: string,
    filePath: string,
    source: FileVersionSource,
  ): Promise<FileVersion | null> {
    // Only version .md and .json files
    if (!this.isVersionable(filePath)) return null;

    try {
      const content = await this.fs.readFile(bookSlug, filePath);
      return this.snapshotContent(bookSlug, filePath, content, source);
    } catch {
      // File doesn't exist or can't be read — skip silently
      return null;
    }
  }

  async snapshotContent(
    bookSlug: string,
    filePath: string,
    content: string,
    source: FileVersionSource,
  ): Promise<FileVersion | null> {
    if (!this.isVersionable(filePath)) return null;

    const contentHash = this.hashContent(content);
    const byteSize = Buffer.byteLength(content, 'utf-8');

    // Dedup: check if latest version has the same hash
    const latest = this.db.getLatestFileVersion(bookSlug, filePath);
    if (latest && latest.contentHash === contentHash) {
      return null; // Content unchanged — no new version
    }

    return this.db.insertFileVersion({
      bookSlug,
      filePath,
      content,
      contentHash,
      byteSize,
      source,
    });
  }

  async getHistory(
    bookSlug: string,
    filePath: string,
    limit = 50,
    offset = 0,
  ): Promise<FileVersionSummary[]> {
    return this.db.listFileVersions(bookSlug, filePath, limit, offset);
  }

  async getVersion(versionId: number): Promise<FileVersion | null> {
    return this.db.getFileVersion(versionId);
  }

  async getDiff(oldVersionId: number | null, newVersionId: number): Promise<FileDiff> {
    const newVersion = this.db.getFileVersion(newVersionId);
    if (!newVersion) {
      throw new Error(`Version ${newVersionId} not found`);
    }

    let oldContent = '';
    let oldSummary: FileVersionSummary | null = null;

    if (oldVersionId !== null) {
      const oldVersion = this.db.getFileVersion(oldVersionId);
      if (!oldVersion) {
        throw new Error(`Version ${oldVersionId} not found`);
      }
      oldContent = oldVersion.content;
      oldSummary = this.toSummary(oldVersion);
    }

    const hunks = this.computeDiff(oldContent, newVersion.content, newVersion.filePath);

    let totalAdditions = 0;
    let totalDeletions = 0;
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'add') totalAdditions++;
        if (line.type === 'remove') totalDeletions++;
      }
    }

    return {
      oldVersion: oldSummary,
      newVersion: this.toSummary(newVersion),
      hunks,
      totalAdditions,
      totalDeletions,
    };
  }

  async revertToVersion(
    bookSlug: string,
    filePath: string,
    versionId: number,
  ): Promise<FileVersion> {
    const targetVersion = this.db.getFileVersion(versionId);
    if (!targetVersion) {
      throw new Error(`Version ${versionId} not found`);
    }
    if (targetVersion.bookSlug !== bookSlug || targetVersion.filePath !== filePath) {
      throw new Error(`Version ${versionId} does not belong to ${bookSlug}/${filePath}`);
    }

    // Write the old content to disk
    await this.fs.writeFile(bookSlug, filePath, targetVersion.content);

    // Create a new "revert" snapshot (always creates — even if hash matches last,
    // because the revert action itself is semantically meaningful)
    const contentHash = this.hashContent(targetVersion.content);
    const byteSize = Buffer.byteLength(targetVersion.content, 'utf-8');

    return this.db.insertFileVersion({
      bookSlug,
      filePath,
      content: targetVersion.content,
      contentHash,
      byteSize,
      source: 'revert',
    });
  }

  async getVersionCount(bookSlug: string, filePath: string): Promise<number> {
    return this.db.countFileVersions(bookSlug, filePath);
  }

  async pruneVersions(bookSlug: string, keepCount = DEFAULT_KEEP_COUNT): Promise<number> {
    const paths = this.db.getVersionedFilePaths(bookSlug);
    let totalDeleted = 0;
    for (const filePath of paths) {
      totalDeleted += this.db.deleteFileVersionsBeyondLimit(bookSlug, filePath, keepCount);
    }
    return totalDeleted;
  }

  // ── Private Helpers ───────────────────────────────────────────────

  private isVersionable(filePath: string): boolean {
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    return VERSIONABLE_EXTENSIONS.has(ext.toLowerCase());
  }

  private hashContent(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  private toSummary(version: FileVersion): FileVersionSummary {
    const { content: _, ...summary } = version;
    return summary;
  }

  private computeDiff(oldContent: string, newContent: string, fileName: string): DiffHunk[] {
    const patch = structuredPatch(
      fileName,
      fileName,
      oldContent,
      newContent,
      '', // old header
      '', // new header
      { context: 3 }, // 3 lines of context around changes
    );

    return patch.hunks.map((hunk) => {
      const lines: DiffLine[] = [];
      let oldLine = hunk.oldStart;
      let newLine = hunk.newStart;

      for (const rawLine of hunk.lines) {
        const prefix = rawLine[0];
        const text = rawLine.slice(1);

        if (prefix === '-') {
          lines.push({
            type: 'remove' as DiffLineType,
            content: text,
            oldLineNumber: oldLine,
            newLineNumber: undefined,
          });
          oldLine++;
        } else if (prefix === '+') {
          lines.push({
            type: 'add' as DiffLineType,
            content: text,
            oldLineNumber: undefined,
            newLineNumber: newLine,
          });
          newLine++;
        } else {
          // Context line (space prefix or no prefix)
          lines.push({
            type: 'context' as DiffLineType,
            content: text,
            oldLineNumber: oldLine,
            newLineNumber: newLine,
          });
          oldLine++;
          newLine++;
        }
      }

      return {
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        lines,
      };
    });
  }
}
```

**Key design decisions:**

- **`isVersionable()`** filters to `.md` and `.json` only — no binary files, no other extensions.
- **Dedup by hash** — `snapshotContent()` compares the SHA-256 hash to the latest version and skips if identical. Exception: `revertToVersion()` always creates a snapshot for auditability.
- **Diff uses `structuredPatch`** from the `diff` package, which produces standard unified diff hunks with configurable context lines (3 by default).
- **`pruneVersions()`** iterates all tracked files in a book and trims each to `keepCount` (default 50).

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages
- [x] Application imports only from domain interfaces (`IDatabaseService`, `IFileSystemService`) — not concrete classes
- [x] Uses `node:crypto` (Node builtin) and `diff` (npm package) — both permitted in application layer
- [x] All async operations have error handling
- [x] No `any` types
- [x] No business logic in IPC handlers

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `diff` and `@types/diff` are in `package.json`
3. `VersionService` implements all methods from `IVersionService`
4. `VersionService` constructor takes `IDatabaseService` and `IFileSystemService` (interfaces, not concrete classes)
5. `isVersionable()` correctly filters to `.md` and `.json` extensions
6. `snapshotContent()` deduplicates by comparing hashes
7. `computeDiff()` produces structured hunks with correct line numbering

---

## State Update

After completing this session, update `prompts/feature/content-version-control/STATE.md`:
- Set SESSION-03 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
