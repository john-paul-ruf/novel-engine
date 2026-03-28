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
