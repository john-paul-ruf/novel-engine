import type { IBuildService, IFileSystemService } from '@domain/interfaces';
import type { BuildFormat, BuildResult } from '@domain/types';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * BuildService — Assembles chapters and runs Pandoc to produce output files.
 *
 * Concatenates all chapter drafts into a single markdown document, then
 * generates DOCX, EPUB, and PDF via the Pandoc CLI. Handles partial
 * failures gracefully — one format failing doesn't block the others.
 *
 * Imports `child_process` directly because the build step is inherently
 * a system operation (allowed exception to the DI rule per architecture rules).
 */
export class BuildService implements IBuildService {
  constructor(
    private fs: IFileSystemService,
    private pandocPath: string,
    private booksDir: string,
  ) {}

  /**
   * Check if Pandoc is installed and accessible.
   */
  async isPandocAvailable(): Promise<boolean> {
    try {
      await execFileAsync(this.pandocPath, ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build all output formats for a book.
   *
   * Steps:
   * 1. Verify Pandoc availability
   * 2. Load book metadata (title, author)
   * 3. Read and concatenate all chapter drafts
   * 4. Write assembled markdown to dist/output.md
   * 5. Generate DOCX, EPUB, PDF via Pandoc (each independently)
   * 6. Return results with per-format success/failure status
   */
  async build(
    bookSlug: string,
    onProgress: (message: string) => void,
  ): Promise<BuildResult> {
    // Step 1: Check Pandoc
    onProgress('Checking Pandoc...');
    const pandocOk = await this.isPandocAvailable();
    if (!pandocOk) {
      onProgress('Pandoc not found. Install Pandoc to generate output files.');
      return {
        success: false,
        formats: [],
        wordCount: 0,
      };
    }

    // Step 2: Load book metadata
    onProgress('Loading book metadata...');
    const meta = await this.fs.getBookMeta(bookSlug);

    // Step 3: Assemble chapters
    onProgress('Assembling chapters...');
    const chapterStats = await this.fs.countWordsPerChapter(bookSlug);

    if (chapterStats.length === 0) {
      onProgress('No chapters found. Write some chapters first.');
      return {
        success: false,
        formats: [],
        wordCount: 0,
      };
    }

    const chapterContents: string[] = [];
    let totalWordCount = 0;

    for (const chapter of chapterStats) {
      const draft = await this.fs.readFile(bookSlug, `chapters/${chapter.slug}/draft.md`);
      chapterContents.push(draft);
      totalWordCount += chapter.wordCount;
      onProgress(`  Added ${chapter.slug} (${chapter.wordCount} words)`);
    }

    // Build the assembled markdown with title page
    const assembledMarkdown = [
      `# ${meta.title}`,
      '',
      `**${meta.author}**`,
      '',
      '---',
      '',
      ...chapterContents.map((content) => `${content}\n\n---\n`),
    ].join('\n');

    // Step 4: Write assembled markdown
    onProgress('Writing assembled markdown...');
    await this.fs.writeFile(bookSlug, 'dist/output.md', assembledMarkdown);

    // Step 5: Generate each format
    const distDir = join(this.booksDir, bookSlug, 'dist');
    const inputPath = join(distDir, 'output.md');
    const formats: BuildResult['formats'] = [
      { format: 'md' as BuildFormat, path: inputPath },
    ];

    // Check for cover image (used by EPUB)
    const coverPath = await this.fs.getCoverImageAbsolutePath(bookSlug);

    const pandocFormats: { format: BuildFormat; ext: string; toFlag: string }[] = [
      { format: 'docx', ext: 'docx', toFlag: 'docx' },
      { format: 'epub', ext: 'epub', toFlag: 'epub3' },
      { format: 'pdf', ext: 'pdf', toFlag: 'pdf' },
    ];

    for (const { format, ext, toFlag } of pandocFormats) {
      onProgress(`Generating ${format.toUpperCase()}...`);
      const outputPath = join(distDir, `output.${ext}`);

      const args = [
        inputPath,
        '-o', outputPath,
        '--from=markdown',
        `--to=${toFlag}`,
        `--metadata=title:${meta.title}`,
        `--metadata=author:${meta.author}`,
      ];

      // Add cover image for EPUB if available
      if (format === 'epub' && coverPath) {
        args.push(`--epub-cover-image=${coverPath}`);
      }

      try {
        await execFileAsync(this.pandocPath, args);
        onProgress(`${format.toUpperCase()} ✓`);
        formats.push({ format, path: outputPath });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        onProgress(`${format.toUpperCase()} failed: ${errorMessage}`);
        formats.push({ format, path: outputPath, error: errorMessage });
      }
    }

    // Step 6: Done
    onProgress('Build complete!');

    // Success if at least one Pandoc format succeeded
    const pandocSuccesses = formats.filter((f) => f.format !== 'md' && !f.error);
    const success = pandocSuccesses.length > 0;

    return {
      success,
      formats,
      wordCount: totalWordCount,
    };
  }
}
