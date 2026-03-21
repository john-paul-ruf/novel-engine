import type { IChapterValidator } from '@domain/interfaces';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

/**
 * ChapterValidator — Ensures chapter files follow the correct folder structure.
 *
 * When agents like Verity write chapters, they might sometimes place files in
 * the wrong location (e.g., `chapters/draft.md` instead of `chapters/01-slug/draft.md`).
 *
 * This validator:
 * 1. Scans the chapters directory for misplaced files
 * 2. Detects chapter files that aren't in the `NN-slug/` subdirectory structure
 * 3. Automatically moves them to the correct location
 * 4. Returns a list of corrected files for diagnostics
 *
 * Spec: All chapter content must be in `chapters/{slug}/draft.md` or `chapters/{slug}/notes.md`
 * where `{slug}` follows the pattern NN-name (e.g., `01-the-beginning`).
 */
export class ChapterValidator implements IChapterValidator {
  constructor(private booksDir: string) {}

  async validateAndCorrect(bookSlug: string): Promise<string[]> {
    const chaptersPath = path.join(this.booksDir, bookSlug, 'chapters');
    const corrected: string[] = [];

    try {
      // Ensure chapters directory exists
      await fs.access(chaptersPath);
    } catch {
      // No chapters directory yet — nothing to validate
      return [];
    }

    try {
      const entries = await fs.readdir(chaptersPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(chaptersPath, entry.name);

        if (entry.isFile()) {
          // Found a file directly in the chapters root — move it to the correct location
          const correctionResult = await this.moveToCorrectChapter(bookSlug, entry.name, fullPath);
          if (correctionResult) {
            corrected.push(correctionResult);
          }
        } else if (entry.isDirectory()) {
          // Check if this directory has the correct structure
          const validationResult = await this.validateChapterDirectory(bookSlug, entry.name, fullPath);
          if (validationResult) {
            corrected.push(...validationResult);
          }
        }
      }
    } catch (err) {
      // Log but don't fail — validation errors shouldn't break the workflow
      console.error(`Error validating chapters for ${bookSlug}:`, err);
    }

    return corrected;
  }

  /**
   * Move a file found in the chapters root to the correct chapter subdirectory.
   * Detects which chapter it belongs to based on filename patterns.
   */
  private async moveToCorrectChapter(bookSlug: string, fileName: string, sourcePath: string): Promise<string | null> {
    // Skip non-chapter files
    if (!this.isChapterFileName(fileName)) {
      return null;
    }

    // Try to extract chapter slug from filename
    const chapterSlug = this.extractChapterSlug(fileName);
    if (!chapterSlug) {
      // Can't determine chapter — leave it
      return null;
    }

    // Determine the target file name (draft.md or notes.md)
    const targetFileName = this.normalizeChapterFileName(fileName);
    const targetDir = path.join(this.booksDir, bookSlug, 'chapters', chapterSlug);
    const targetPath = path.join(targetDir, targetFileName);

    try {
      // Create the target chapter directory if it doesn't exist
      await fs.mkdir(targetDir, { recursive: true });

      // Check if target already exists
      try {
        await fs.access(targetPath);
        // Target exists — don't overwrite, just report
        await fs.unlink(sourcePath);
        return `chapters/${chapterSlug}/${targetFileName} (moved from root, existing file preserved)`;
      } catch {
        // Target doesn't exist — safe to move
        await fs.rename(sourcePath, targetPath);
        return `chapters/${chapterSlug}/${targetFileName}`;
      }
    } catch (err) {
      console.error(`Error moving chapter file ${fileName}:`, err);
      return null;
    }
  }

  /**
   * Validate that a chapter directory has the correct structure.
   * Moves any files out of the correct location into place.
   */
  private async validateChapterDirectory(
    bookSlug: string,
    dirName: string,
    dirPath: string,
  ): Promise<string[]> {
    const corrected: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isFile()) {
          // Validate file is named correctly (draft.md or notes.md)
          if (!this.isValidChapterFileName(entry.name)) {
            // Misnamed file — try to correct it
            if (this.isChapterFileName(entry.name)) {
              const correctedName = this.normalizeChapterFileName(entry.name);
              const newPath = path.join(dirPath, correctedName);

              try {
                await fs.access(newPath);
                // Target exists — delete the old one
                await fs.unlink(fullPath);
                corrected.push(`chapters/${dirName}/${correctedName} (removed duplicate)`);
              } catch {
                // Target doesn't exist — rename
                await fs.rename(fullPath, newPath);
                corrected.push(`chapters/${dirName}/${correctedName} (renamed from ${entry.name})`);
              }
            }
          }
        } else if (entry.isDirectory()) {
          // Nested subdirectory in chapter folder — unusual but might contain chapters
          // Recursively validate it
          const nestedCorrections = await this.validateChapterDirectory(bookSlug, `${dirName}/${entry.name}`, fullPath);
          corrected.push(...nestedCorrections);
        }
      }
    } catch (err) {
      console.error(`Error validating chapter directory ${dirName}:`, err);
    }

    return corrected;
  }

  /**
   * Check if a filename looks like it belongs to a chapter.
   * Chapters files are: draft.md, notes.md, or variations like draft-v2.md.
   */
  private isChapterFileName(fileName: string): boolean {
    if (!fileName.endsWith('.md')) {
      return false;
    }

    const lower = fileName.toLowerCase();
    // Match draft.md, draft-v2.md, notes.md, notes-final.md, etc.
    return (
      lower.startsWith('draft') || lower.startsWith('notes') || lower.startsWith('chapter') || lower.startsWith('section')
    );
  }

  /**
   * Check if a filename is valid for a chapter (draft.md or notes.md, plus versioned variants).
   */
  private isValidChapterFileName(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    // Valid: draft.md, notes.md, draft-v1.md, notes-final.md, etc.
    return lower === 'draft.md' || lower === 'notes.md' || lower.startsWith('draft-') || lower.startsWith('notes-');
  }

  /**
   * Extract the chapter slug from a filename.
   * Tries patterns like:
   * - "01-the-beginning-draft.md" → "01-the-beginning"
   * - "chapter-5-notes.md" → "05-chapter-5" (normalized)
   * - "draft-ch7.md" → extracts from filename
   *
   * If extraction fails, uses a default pattern.
   */
  private extractChapterSlug(fileName: string): string | null {
    const baseName = fileName.replace(/\.md$/, '').toLowerCase();

    // Pattern: "NN-slug-draft" or "NN-slug-notes"
    const match = baseName.match(/^(\d+[-\w]+?)[-_]?(draft|notes)$/);
    if (match) {
      return match[1];
    }

    // Pattern: "draft-NN-slug"
    const match2 = baseName.match(/^(?:draft|notes)[-_](\d+[-\w]+)$/);
    if (match2) {
      return match2[1];
    }

    // Pattern: "chapter-N" or "ch-N"
    const match3 = baseName.match(/^(?:chapter|ch)[-_](\d+)/);
    if (match3) {
      const num = parseInt(match3[1], 10);
      const padded = String(num).padStart(2, '0');
      return `${padded}-chapter`;
    }

    // Last resort: use first number found
    const match4 = baseName.match(/(\d+)/);
    if (match4) {
      const num = parseInt(match4[1], 10);
      const padded = String(num).padStart(2, '0');
      return `${padded}-unnamed`;
    }

    return null;
  }

  /**
   * Normalize a chapter filename to either draft.md or notes.md.
   */
  private normalizeChapterFileName(fileName: string): string {
    const lower = fileName.toLowerCase();
    if (lower.startsWith('notes') || lower.includes('note')) {
      return 'notes.md';
    }
    // Default to draft
    return 'draft.md';
  }
}
