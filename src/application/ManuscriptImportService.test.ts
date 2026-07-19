import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeFs, type FakeFileSystem } from '../test/fakes';
import { cleanupTempDirs, makeTempDir } from '../test/tempDir';
import { NUMBERED_CHAPTERS } from '../test/fixtures/manuscripts';

const holder = vi.hoisted(() => ({
  execFile: undefined as ((cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>) | undefined,
}));

vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  const execFile = Object.assign(
    () => undefined,
    { [promisify.custom]: (cmd: string, args: string[]) => holder.execFile?.(cmd, args) }
  );
  return { execFile };
});

import { ManuscriptImportService } from './ManuscriptImportService';

let fs: FakeFileSystem;
let service: ManuscriptImportService;
let tempDir: string;

beforeEach(async () => {
  fs = makeFakeFs({}, { bookSlug: 'unused' });
  service = new ManuscriptImportService(fs, '/fake/pandoc');
  tempDir = await makeTempDir();
  holder.execFile = vi.fn(async () => ({ stdout: '', stderr: '' }));
});

afterEach(async () => {
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

describe('preview', () => {
  it('reads markdown sources directly and runs full detection', async () => {
    const sourcePath = path.join(tempDir, 'manuscript.md');
    await writeFile(sourcePath, NUMBERED_CHAPTERS, 'utf-8');

    const preview = await service.preview(sourcePath);

    expect(preview.sourceFormat).toBe('markdown');
    expect(preview.chapters.length).toBe(5);
    expect(preview.detectedAuthor).toBe('Jane Author');
    expect(preview.totalWordCount).toBe(preview.chapters.reduce((sum, c) => sum + c.wordCount, 0));
    expect(holder.execFile).not.toHaveBeenCalled(); // no pandoc for .md
  });

  it('converts DOCX via pandoc and surfaces conversion failures', async () => {
    holder.execFile = vi.fn(async (cmd: string, args: string[]) => {
      expect(cmd).toBe('/fake/pandoc');
      expect(args).toEqual(['-f', 'docx', '-t', 'markdown', '--wrap=none', '/books/novel.docx']);
      return { stdout: NUMBERED_CHAPTERS, stderr: '' };
    });

    const preview = await service.preview('/books/novel.docx');
    expect(preview.sourceFormat).toBe('docx');
    expect(preview.chapters.length).toBe(5);

    holder.execFile = vi.fn(async () => {
      throw new Error('corrupt archive');
    });
    await expect(service.preview('/books/broken.docx')).rejects.toThrow(
      /Pandoc DOCX conversion failed: .*corrupt archive/
    );
  });

  it('rejects unsupported file formats', async () => {
    await expect(service.preview('/books/story.pdf')).rejects.toThrow(/Unsupported file format: "\.pdf"/);
  });
});

describe('commit', () => {
  const chapters = [
    { index: 0, title: 'Prologue', startLine: 0, endLine: 2, wordCount: 3, content: 'Prologue prose here.' },
    { index: 1, title: 'Chapter 1: The Fall!', startLine: 2, endLine: 4, wordCount: 4, content: 'Chapter one prose sits here.' },
    { index: 2, title: '???', startLine: 4, endLine: 6, wordCount: 2, content: 'Weird title.' },
  ];

  it('creates the book, writes numbered chapter drafts, and advances the status', async () => {
    const result = await service.commit({ title: 'My Import', author: 'Auth', chapters });

    expect(result).toEqual({
      bookSlug: 'my-import',
      title: 'My Import',
      chapterCount: 3,
      totalWordCount: 9,
    });

    expect(fs.files.get('my-import/chapters/01-prologue/draft.md')).toBe('Prologue prose here.');
    expect(fs.files.get('my-import/chapters/02-chapter-1-the-fall/draft.md')).toBe('Chapter one prose sits here.');
    // Unsluggable titles fall back to 'untitled'
    expect(fs.files.get('my-import/chapters/03-untitled/draft.md')).toBe('Weird title.');

    expect(fs.meta.status).toBe('first-draft');
  });
});
