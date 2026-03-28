# SESSION-01 — Domain Types & Interface for Version Control

> **Feature:** content-version-control
> **Layer(s):** Domain
> **Depends on:** Nothing
> **Estimated effort:** 15 min

---

## Context

This is the first session of the content version control feature. We need domain types and a service interface to support:

1. Storing file snapshots (full content at a point in time)
2. Listing version history for any file
3. Computing human-readable diffs between versions
4. Reverting a file to a previous version

The version system uses a **snapshot-per-write** model: every time a file is written (by user or agent), the new content is stored as a version in SQLite. Diffs are computed on demand between consecutive snapshots. Deduplication uses content hashing — if a write produces identical content to the last snapshot, no new version is created.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | Modify | Add `FileVersionSource`, `FileVersion`, `FileVersionSummary`, `DiffHunk`, `DiffLine`, `FileDiff` types |
| `src/domain/interfaces.ts` | Modify | Add `IVersionService` interface |

---

## Implementation

### 1. Add version control types to `src/domain/types.ts`

Read `src/domain/types.ts`. Append the following types after the `// === File System ===` section (after the `FileEntry` type):

```typescript
// === Version Control ===

export type FileVersionSource = 'user' | 'agent' | 'revert';

export type FileVersion = {
  id: number;                // auto-increment PK
  bookSlug: string;
  filePath: string;          // relative to book root (e.g. "source/pitch.md")
  content: string;           // full file content at this version
  contentHash: string;       // SHA-256 hex digest for dedup
  byteSize: number;          // content.length in bytes
  source: FileVersionSource; // who caused this version
  createdAt: string;         // ISO date
};

export type FileVersionSummary = Omit<FileVersion, 'content'>;

export type DiffLineType = 'add' | 'remove' | 'context';

export type DiffLine = {
  type: DiffLineType;
  content: string;           // the text of this line (without +/- prefix)
  oldLineNumber?: number;    // line number in old version (undefined for additions)
  newLineNumber?: number;    // line number in new version (undefined for deletions)
};

export type DiffHunk = {
  oldStart: number;          // starting line in old version
  oldLines: number;          // number of lines from old version
  newStart: number;          // starting line in new version
  newLines: number;          // number of lines from new version
  lines: DiffLine[];
};

export type FileDiff = {
  oldVersion: FileVersionSummary | null;  // null for the first version (everything is "added")
  newVersion: FileVersionSummary;
  hunks: DiffHunk[];
  totalAdditions: number;
  totalDeletions: number;
};
```

### 2. Add `IVersionService` interface to `src/domain/interfaces.ts`

Read `src/domain/interfaces.ts`. Add the new type imports at the top, then append the interface after the existing interfaces.

Add to the import block:

```typescript
import type {
  // ... existing imports ...
  FileDiff,
  FileVersion,
  FileVersionSource,
  FileVersionSummary,
} from './types';
```

Then add the interface:

```typescript
export interface IVersionService {
  /**
   * Create a snapshot of a file's current content.
   *
   * Reads the file from disk, hashes it, and stores it in the version
   * history if the content differs from the most recent snapshot.
   * Returns the new version, or null if the content was unchanged
   * (dedup by hash).
   */
  snapshotFile(bookSlug: string, filePath: string, source: FileVersionSource): Promise<FileVersion | null>;

  /**
   * Create a snapshot from provided content (when content is already in memory).
   * Same dedup behavior as snapshotFile.
   */
  snapshotContent(bookSlug: string, filePath: string, content: string, source: FileVersionSource): Promise<FileVersion | null>;

  /**
   * List version history for a file, newest first.
   * Returns lightweight summaries (no content).
   */
  getHistory(bookSlug: string, filePath: string, limit?: number, offset?: number): Promise<FileVersionSummary[]>;

  /**
   * Get a single version with its full content.
   */
  getVersion(versionId: number): Promise<FileVersion | null>;

  /**
   * Compute a structured diff between two versions.
   * If oldVersionId is null, diffs against an empty string (shows full content as additions).
   */
  getDiff(oldVersionId: number | null, newVersionId: number): Promise<FileDiff>;

  /**
   * Revert a file to a previous version.
   * Reads the target version's content, writes it to disk, and creates
   * a new snapshot with source='revert'.
   */
  revertToVersion(bookSlug: string, filePath: string, versionId: number): Promise<FileVersion>;

  /**
   * Count total versions for a file.
   */
  getVersionCount(bookSlug: string, filePath: string): Promise<number>;

  /**
   * Delete old versions beyond a retention limit per file.
   * Keeps the most recent `keepCount` versions. Returns the number deleted.
   */
  pruneVersions(bookSlug: string, keepCount?: number): Promise<number>;
}
```

---

## Architecture Compliance

- [x] Domain files import from nothing (types.ts has zero imports; interfaces.ts imports only from ./types)
- [x] No infrastructure, application, or renderer imports
- [x] All types are fully specified with no `any`
- [x] New interface follows existing patterns (method signatures match style of IFileSystemService, IDatabaseService)

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `FileVersion`, `FileVersionSummary`, `DiffHunk`, `DiffLine`, `FileDiff` types are exported from `src/domain/types.ts`
3. `IVersionService` is exported from `src/domain/interfaces.ts`
4. No circular imports introduced

---

## State Update

After completing this session, update `prompts/feature/content-version-control/STATE.md`:
- Set SESSION-01 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
