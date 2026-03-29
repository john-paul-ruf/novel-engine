import type { IFileSystemService, IFindReplaceService, IVersionService } from '@domain/interfaces';
import type {
  FindReplaceApplyResult,
  FindReplaceMatchLocation,
  FindReplaceOptions,
  FindReplacePreviewItem,
  FindReplacePreviewResult,
} from '@domain/types';

/**
 * Build a RegExp from the user's search term and options.
 * For literal mode, escapes all regex metacharacters.
 * Always uses the 'g' flag. Adds 'i' when caseSensitive is false.
 *
 * Throws a descriptive Error if useRegex is true and the pattern is invalid.
 */
function buildRegex(searchTerm: string, options: FindReplaceOptions): RegExp {
  const flags = `g${options.caseSensitive ? '' : 'i'}`;
  let pattern: string;

  if (options.useRegex) {
    try {
      // Validate the regex before returning it
      new RegExp(searchTerm);
      pattern = searchTerm;
    } catch (err) {
      throw new Error(
        `Invalid regular expression: ${(err as Error).message}`,
      );
    }
  } else {
    // Escape all special regex characters for literal matching
    pattern = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return new RegExp(pattern, flags);
}

export class FindReplaceService implements IFindReplaceService {
  constructor(
    private fs: IFileSystemService,
    private versions: IVersionService,
  ) {}

  async preview(
    bookSlug: string,
    searchTerm: string,
    options: FindReplaceOptions,
  ): Promise<FindReplacePreviewResult> {
    if (!searchTerm) throw new Error('searchTerm must not be empty');

    const regex = buildRegex(searchTerm, options);

    // List all chapter subdirectories
    let chapterEntries: Awaited<ReturnType<IFileSystemService['listDirectory']>>;
    try {
      chapterEntries = await this.fs.listDirectory(bookSlug, 'chapters');
    } catch {
      // chapters/ directory may not exist yet
      return { items: [], totalMatchCount: 0, searchTerm, options };
    }

    const items: FindReplacePreviewItem[] = [];
    let totalMatchCount = 0;

    for (const entry of chapterEntries) {
      if (!entry.isDirectory) continue;

      const draftPath = `chapters/${entry.name}/draft.md`;
      let content: string;
      try {
        content = await this.fs.readFile(bookSlug, draftPath);
      } catch {
        continue; // draft.md may not exist yet for planned chapters
      }

      const lines = content.split('\n');
      const sampleMatches: FindReplaceMatchLocation[] = [];
      let fileMatchCount = 0;

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        // Reset lastIndex for each line since we're reusing the same RegExp object
        regex.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = regex.exec(line)) !== null) {
          fileMatchCount++;
          if (sampleMatches.length < 20) {
            sampleMatches.push({
              lineNumber: lineIdx + 1,
              lineText: line,
              matchStart: match.index,
              matchEnd: match.index + match[0].length,
            });
          }
          // Prevent infinite loop on zero-length matches
          if (match[0].length === 0) {
            regex.lastIndex++;
          }
        }
      }

      if (fileMatchCount > 0) {
        items.push({
          filePath: draftPath,
          matchCount: fileMatchCount,
          matches: sampleMatches,
        });
        totalMatchCount += fileMatchCount;
      }
    }

    // Sort by match count descending (most matches first)
    items.sort((a, b) => b.matchCount - a.matchCount);

    return { items, totalMatchCount, searchTerm, options };
  }

  async apply(params: {
    bookSlug: string;
    searchTerm: string;
    replacement: string;
    filePaths: string[];
    options: FindReplaceOptions;
  }): Promise<FindReplaceApplyResult> {
    const { bookSlug, searchTerm, replacement, filePaths, options } = params;

    if (!searchTerm) throw new Error('searchTerm must not be empty');

    const regex = buildRegex(searchTerm, options);

    const details: { filePath: string; replacements: number }[] = [];
    let totalReplacements = 0;

    for (const filePath of filePaths) {
      let content: string;
      try {
        content = await this.fs.readFile(bookSlug, filePath);
      } catch {
        // File may have been deleted between preview and apply — skip it
        continue;
      }

      // Count replacements before applying
      regex.lastIndex = 0;
      const matchCount = (content.match(regex) ?? []).length;
      if (matchCount === 0) continue;

      // Snapshot the original content BEFORE modifying — this is the safety net
      // that allows the author to revert via version history.
      regex.lastIndex = 0;
      await this.versions.snapshotContent(bookSlug, filePath, content, 'user');

      // Apply all replacements
      regex.lastIndex = 0;
      const updated = content.replace(regex, replacement);

      // Write the modified content
      await this.fs.writeFile(bookSlug, filePath, updated);

      details.push({ filePath, replacements: matchCount });
      totalReplacements += matchCount;
    }

    return {
      filesChanged: details.length,
      totalReplacements,
      details,
    };
  }
}
