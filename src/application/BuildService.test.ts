import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeFs, type FakeFileSystem } from '../test/fakes';

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

import { BuildService } from './BuildService';

let fs: FakeFileSystem;
let service: BuildService;
let progress: string[];
let pandocCalls: { cmd: string; args: string[] }[];

/** Pandoc fake: --version ok; conversions succeed unless failFormats matches --to=. */
function wirePandoc(failFormats: string[] = []): void {
  pandocCalls = [];
  holder.execFile = vi.fn(async (cmd: string, args: string[]) => {
    pandocCalls.push({ cmd, args });
    if (args[0] === '--version') return { stdout: 'pandoc 3.0', stderr: '' };
    const to = args.find((a) => a.startsWith('--to='))?.slice(5) ?? '';
    if (failFormats.includes(to)) throw new Error(`${to} conversion failed`);
    return { stdout: '', stderr: '' };
  });
}

beforeEach(() => {
  fs = makeFakeFs(
    {
      'chapters/00-0-copyright/draft.md': '# Copyright\n\nLegal text.',
      'chapters/02-the-turn/draft.md': 'two words here indeed',
      'chapters/10-finale/draft.md': 'finale prose words',
    },
    { bookSlug: 'book', title: 'My Novel' }
  );
  service = new BuildService(fs, '/fake/pandoc', '/fake/books');
  progress = [];
  wirePandoc();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const build = () => service.build('book', (m) => progress.push(m));

describe('build', () => {
  it('assembles chapters in order, runs pandoc for docx + epub3, and reports success', async () => {
    const result = await build();

    expect(result.success).toBe(true);
    expect(result.formats.map((f) => f.format)).toEqual(['md', 'docx', 'epub']);
    expect(result.formats.every((f) => !f.error)).toBe(true);
    expect(result.wordCount).toBe(7); // front matter counts 0

    const assembled = fs.files.get('book/dist/book.md') ?? '';
    expect(assembled.startsWith('# My Novel\n\n**Test Author**')).toBe(true);
    expect(assembled.indexOf('two words here')).toBeLessThan(assembled.indexOf('finale prose'));
    expect(assembled.indexOf('Legal text.')).toBeLessThan(assembled.indexOf('two words here'));

    const [docx, epub] = pandocCalls.slice(1); // first call is --version
    expect(docx.cmd).toBe('/fake/pandoc');
    expect(docx.args).toContain('--to=docx');
    expect(docx.args).toContain('--metadata=title:My Novel');
    expect(epub.args).toContain('--to=epub3');
    expect(epub.args.some((a) => a.startsWith('--epub-cover-image='))).toBe(false);
  });

  it('adds the EPUB cover flag when a cover exists', async () => {
    fs.coverPath = '/abs/book/cover.png';

    await build();

    const epub = pandocCalls.find((c) => c.args.includes('--to=epub3'));
    expect(epub?.args).toContain('--epub-cover-image=/abs/book/cover.png');
  });

  it('fails fast when pandoc is missing', async () => {
    holder.execFile = vi.fn(async () => {
      throw new Error('ENOENT');
    });

    const result = await build();

    expect(result).toEqual({ success: false, formats: [], wordCount: 0 });
    expect(progress).toContainEqual(expect.stringContaining('Pandoc not found'));
  });

  it('refuses to build front matter without body chapters', async () => {
    fs.files.delete('book/chapters/02-the-turn/draft.md');
    fs.files.delete('book/chapters/10-finale/draft.md');

    const result = await build();

    expect(result.success).toBe(false);
    expect(progress).toContainEqual(expect.stringContaining('No story chapters found'));
  });

  it('one failing format leaves the other successful; both failing means failure', async () => {
    wirePandoc(['epub3']);
    const partial = await build();
    expect(partial.success).toBe(true);
    expect(partial.formats.find((f) => f.format === 'epub')?.error).toContain('epub3 conversion failed');
    expect(partial.formats.find((f) => f.format === 'docx')?.error).toBeUndefined();

    wirePandoc(['docx', 'epub3']);
    const failed = await build();
    expect(failed.success).toBe(false);
  });

  it('regenerates an empty copyright page from metadata', async () => {
    fs.files.set('book/chapters/00-0-copyright/draft.md', '   \n');

    await build();

    const assembled = fs.files.get('book/dist/book.md') ?? '';
    expect(assembled).toContain('Copyright © ');
    expect(assembled).toContain('*My Novel*');
    expect(progress).toContainEqual(expect.stringContaining('Regenerated copyright page'));
  });
});
