import { createHash } from 'node:crypto';
import { structuredPatch } from 'diff';
import type { IDatabaseService, IFileSystemService, IVersionService } from '@domain/interfaces';
import type {
  ChapterEditStatus,
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
/** Max rendered diff lines per chapter in the author-edits context section. */
const AUTHOR_EDITS_MAX_DIFF_LINES = 120;

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

  async getUserEditsSinceAgentBaseline(
    bookSlug: string,
    filePath: string,
  ): Promise<FileDiff | null> {
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

    let totalAdditions = 0;
    let totalDeletions = 0;
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'add') totalAdditions++;
        if (line.type === 'remove') totalDeletions++;
      }
    }

    // Synthetic summary for "current disk content" — id: -1 sentinel because the
    // disk state may not correspond to a stored snapshot.
    const latestUser = this.db.getLatestFileVersionBySource(bookSlug, filePath, 'user');
    const newVersion: FileVersionSummary = {
      id: -1,
      bookSlug,
      filePath,
      contentHash: currentHash,
      byteSize: Buffer.byteLength(current, 'utf-8'),
      source: 'user',
      createdAt: latestUser?.createdAt ?? baseline.createdAt,
    };

    return {
      oldVersion: this.toSummary(baseline),
      newVersion,
      hunks,
      totalAdditions,
      totalDeletions,
    };
  }

  async getChapterEditStatuses(bookSlug: string): Promise<ChapterEditStatus[]> {
    let entries;
    try {
      entries = await this.fs.listDirectory(bookSlug, 'chapters');
    } catch {
      return []; // no chapters directory — nothing to report
    }

    // Body-chapter drafts only: NN-slug directories with number >= 2
    // (mirrors isVerityDraft in ManuscriptView.tsx).
    const chapterDirs = entries.filter((entry) => {
      if (!entry.isDirectory) return false;
      const match = /^(\d+)-/.exec(entry.name);
      return match !== null && parseInt(match[1], 10) >= 2;
    });

    const statuses: ChapterEditStatus[] = [];
    for (const dir of chapterDirs) {
      const filePath = `chapters/${dir.name}/draft.md`;
      try {
        const diff = await this.getUserEditsSinceAgentBaseline(bookSlug, filePath);
        const latestUser = this.db.getLatestFileVersionBySource(bookSlug, filePath, 'user');
        statuses.push({
          chapterSlug: dir.name,
          filePath,
          hasUserEdits: diff !== null,
          addedLines: diff?.totalAdditions ?? 0,
          removedLines: diff?.totalDeletions ?? 0,
          lastUserEditAt: latestUser?.createdAt ?? null,
        });
      } catch (error) {
        console.error(`Failed to compute edit status for ${bookSlug}/${filePath}:`, error);
        // Skip this chapter — one bad chapter must not fail the whole list.
      }
    }
    return statuses;
  }

  async buildAuthorEditsSection(bookSlug: string): Promise<string | null> {
    const statuses = await this.getChapterEditStatuses(bookSlug);
    const edited = statuses.filter((s) => s.hasUserEdits);
    if (edited.length === 0) return null;

    const parts: string[] = [
      '## Author Edits Since Your Last Draft',
      '',
      'The author hand-edited the chapters below after you last wrote them. **Preserve these edits**',
      'unless the current request explicitly asks to rework that passage. If a requested change',
      "conflicts with an author edit, keep the author's intent and call out the conflict in your reply.",
    ];

    let anyRendered = false;
    for (const status of edited) {
      let diff: FileDiff | null = null;
      try {
        diff = await this.getUserEditsSinceAgentBaseline(bookSlug, status.filePath);
      } catch (error) {
        console.error(`[author-edits] diff failed for ${bookSlug}/${status.filePath}:`, error);
        continue;
      }
      if (!diff) continue;

      // Render hunks in unified-diff style
      const rendered: string[] = [];
      for (const hunk of diff.hunks) {
        rendered.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
        for (const line of hunk.lines) {
          const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
          rendered.push(prefix + line.content);
        }
      }

      // Cap output to bound token cost on heavily-edited chapters
      let body = rendered;
      let truncationNote: string | null = null;
      if (rendered.length > AUTHOR_EDITS_MAX_DIFF_LINES) {
        body = rendered.slice(0, AUTHOR_EDITS_MAX_DIFF_LINES);
        const remaining = rendered.length - AUTHOR_EDITS_MAX_DIFF_LINES;
        truncationNote = `... (${remaining} more edited lines — read the file for the full text)`;
      }

      parts.push(
        '',
        `### \`${status.filePath}\` (+${diff.totalAdditions} / -${diff.totalDeletions} lines)`,
        '```diff',
        ...body,
        '```',
      );
      if (truncationNote) parts.push(truncationNote);
      anyRendered = true;
    }

    return anyRendered ? parts.join('\n') : null;
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
