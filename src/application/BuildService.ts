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
 * generates DOCX and EPUB via the Pandoc CLI. Handles partial
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
   * Generate copyright page content from book metadata.
   *
   * Used when the 00-0-copyright/draft.md is missing or empty at build time.
   * Mirrors the content written by FileSystemService.generateCopyrightContent()
   * at book-creation time.
   */
  private generateCopyrightContent(title: string, author: string): string {
    const year = new Date().getFullYear();
    const authorName = author.trim() || 'the Author';
    return [
      '# Copyright',
      '',
      `*${title}*`,
      '',
      `Copyright © ${year} ${authorName}`,
      '',
      'All rights reserved. No part of this publication may be reproduced, distributed, or transmitted in any form or by any means, including photocopying, recording, or other electronic or mechanical methods, without the prior written permission of the author, except in the case of brief quotations embodied in critical reviews and certain other noncommercial uses permitted by copyright law.',
      '',
      'This is a work of fiction. Names, characters, places, and incidents either are the product of the author\'s imagination or are used fictitiously. Any resemblance to actual persons, living or dead, events, or locales is entirely coincidental.',
    ].join('\n');
  }

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
   * 5. Generate DOCX and EPUB via Pandoc (each independently)
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
    // countWordsPerChapter returns chapters in correct order:
    //   00-0-copyright → 00-1-dedication → body chapters → z0/z1/… (back matter)
    onProgress('Assembling chapters...');
    const chapterStats = await this.fs.countWordsPerChapter(bookSlug);

    // Require at least one body chapter (02+) — front matter alone is not a publishable manuscript
    const hasBodyChapters = chapterStats.some((ch) => {
      const lower = ch.slug.toLowerCase();
      if (lower.startsWith('z')) return false; // back matter
      const n = parseInt(ch.slug, 10);
      return !isNaN(n) && n >= 2;
    });

    if (!hasBodyChapters) {
      onProgress('No story chapters found. Write some chapters with Verity first.');
      return {
        success: false,
        formats: [],
        wordCount: 0,
      };
    }

    const chapterContents: string[] = [];
    let totalWordCount = 0;

    for (const chapter of chapterStats) {
      let draft: string;

      try {
        draft = await this.fs.readFile(bookSlug, `chapters/${chapter.slug}/draft.md`);
      } catch {
        // draft.md missing — for the copyright chapter regenerate from metadata;
        // for all others skip so a missing draft doesn't abort the whole build.
        if (chapter.slug.startsWith('00-0-')) {
          draft = this.generateCopyrightContent(meta.title, meta.author);
          onProgress(`  Regenerated copyright page from metadata`);
        } else {
          onProgress(`  Skipping ${chapter.slug} (no draft found)`);
          continue;
        }
      }

      // Copyright chapter with an empty draft — regenerate so the book always
      // ships with a proper copyright page even if the file was cleared.
      if (chapter.slug.startsWith('00-0-') && !draft.trim()) {
        draft = this.generateCopyrightContent(meta.title, meta.author);
        onProgress(`  Regenerated copyright page from metadata`);
      }

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
