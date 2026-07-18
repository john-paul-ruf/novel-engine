import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FileSystemService } from '@infra/filesystem/FileSystemService';

export type Library = {
  userDataDir: string;
  booksDir: string;
  service: FileSystemService;
};

/**
 * Stand up a books/ library inside a temp dir (the {userData} stand-in).
 * Pass a dir from makeTempDir() so cleanup is automatic.
 */
export async function makeLibrary(tempDir: string): Promise<Library> {
  const booksDir = path.join(tempDir, 'books');
  await mkdir(booksDir, { recursive: true });
  return { userDataDir: tempDir, booksDir, service: new FileSystemService(booksDir, tempDir) };
}

type SeedBookOptions = {
  title?: string;
  author?: string;
  status?: string;
  /** chapter dir name → draft.md content */
  chapters?: Record<string, string>;
  /** path relative to book root → content */
  files?: Record<string, string>;
  /** write no about.json (simulates an externally created directory) */
  omitAbout?: boolean;
  /** write this raw string as about.json instead of valid JSON */
  rawAbout?: string;
};

/** Seed a book directory directly on disk, bypassing the service under test. */
export async function seedBook(
  lib: Library,
  slug: string,
  opts: SeedBookOptions = {}
): Promise<void> {
  const bookRoot = path.join(lib.booksDir, slug);
  await mkdir(path.join(bookRoot, 'source'), { recursive: true });
  await mkdir(path.join(bookRoot, 'chapters'), { recursive: true });

  if (opts.rawAbout !== undefined) {
    await writeFile(path.join(bookRoot, 'about.json'), opts.rawAbout, 'utf-8');
  } else if (!opts.omitAbout) {
    await writeFile(
      path.join(bookRoot, 'about.json'),
      JSON.stringify({
        title: opts.title ?? slug,
        author: opts.author ?? '',
        status: opts.status ?? 'scaffolded',
        created: '2026-01-01T00:00:00.000Z',
        coverImage: '',
      }),
      'utf-8'
    );
  }

  for (const [chapterDir, draft] of Object.entries(opts.chapters ?? {})) {
    const dir = path.join(bookRoot, 'chapters', chapterDir);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'draft.md'), draft, 'utf-8');
  }

  for (const [relPath, content] of Object.entries(opts.files ?? {})) {
    const filePath = path.join(bookRoot, relPath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf-8');
  }
}
