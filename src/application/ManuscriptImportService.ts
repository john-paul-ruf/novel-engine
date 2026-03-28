import type { IFileSystemService, IManuscriptImportService } from '@domain/interfaces';
import type { ImportPreview, ImportCommitConfig, ImportResult, ImportSourceFormat } from '@domain/types';
import { detectChapters, detectTitle, detectAuthor } from './import/ChapterDetector';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * ManuscriptImportService — Orchestrates importing an existing manuscript
 * into Novel Engine's book structure.
 *
 * Reads the source file, converts DOCX to Markdown via Pandoc if needed,
 * runs chapter detection, and commits the import by creating the full book
 * directory structure with individual chapter files.
 *
 * Imports `child_process` and `fs` directly because file reading and DOCX
 * conversion are inherently system operations (same exception as BuildService).
 */
export class ManuscriptImportService implements IManuscriptImportService {
  constructor(
    private fileSystem: IFileSystemService,
    private pandocPath: string,
  ) {}

  async preview(filePath: string): Promise<ImportPreview> {
    const ext = path.extname(filePath).toLowerCase();
    const sourceFormat = this.resolveFormat(ext);

    let markdownContent: string;

    if (sourceFormat === 'markdown') {
      markdownContent = await fs.readFile(filePath, 'utf-8');
    } else {
      markdownContent = await this.convertDocxToMarkdown(filePath);
    }

    const { chapters, ambiguous } = detectChapters(markdownContent);
    const detectedTitle = detectTitle(markdownContent);
    const detectedAuthor = detectAuthor(markdownContent);
    const totalWordCount = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

    return {
      sourceFile: filePath,
      sourceFormat,
      markdownContent,
      chapters,
      totalWordCount,
      detectedTitle,
      detectedAuthor,
      ambiguous,
    };
  }

  async commit(config: ImportCommitConfig): Promise<ImportResult> {
    // Create the book structure (directories, about.json, front matter chapters)
    const meta = await this.fileSystem.createBook(config.title, config.author);
    const bookSlug = meta.slug;

    // Write each chapter as a separate draft.md
    for (const chapter of config.chapters) {
      const chapterSlug =
        String(chapter.index + 1).padStart(2, '0') + '-' + this.slugifyChapterTitle(chapter.title);
      const relativePath = `chapters/${chapterSlug}/draft.md`;
      await this.fileSystem.writeFile(bookSlug, relativePath, chapter.content);
    }

    // Advance status to 'first-draft' since we have a complete manuscript
    await this.fileSystem.updateBookMeta(bookSlug, { status: 'first-draft' });

    const totalWordCount = config.chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

    return {
      bookSlug,
      title: config.title,
      chapterCount: config.chapters.length,
      totalWordCount,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private resolveFormat(ext: string): ImportSourceFormat {
    if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
      return 'markdown';
    }
    if (ext === '.docx') {
      return 'docx';
    }
    throw new Error(
      `Unsupported file format: "${ext}". Only .md, .markdown, .txt, and .docx files are supported.`,
    );
  }

  private async convertDocxToMarkdown(filePath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(this.pandocPath, [
        '-f', 'docx',
        '-t', 'markdown',
        '--wrap=none',
        filePath,
      ]);
      return stdout;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Pandoc DOCX conversion failed: ${message}`);
    }
  }

  private slugifyChapterTitle(title: string): string {
    return (
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'untitled'
    );
  }
}
