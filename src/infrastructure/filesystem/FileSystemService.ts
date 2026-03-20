import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IFileSystemService } from '@domain/interfaces';
import type {
  BookMeta,
  BookStatus,
  BookSummary,
  FileEntry,
  FileManifestItem,
  ProjectManifest,
} from '@domain/types';

const VALID_COVER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const KNOWN_BOOK_META_KEYS: ReadonlySet<keyof BookMeta> = new Set([
  'slug',
  'title',
  'author',
  'status',
  'created',
  'coverImage',
]);

export class FileSystemService implements IFileSystemService {
  constructor(
    private booksDir: string,
    private userDataDir: string,
  ) {}

  // ── Books ─────────────────────────────────────────────────────────

  async listBooks(): Promise<BookSummary[]> {
    const activeSlug = await this.getActiveBookSlug();

    let entries: string[];
    try {
      entries = await fs.readdir(this.booksDir);
    } catch {
      return [];
    }

    const summaries: BookSummary[] = [];

    for (const entry of entries) {
      if (entry.startsWith('_')) continue;

      const entryPath = path.join(this.booksDir, entry);
      const stat = await fs.stat(entryPath).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      const aboutPath = path.join(entryPath, 'about.json');
      try {
        const raw = await fs.readFile(aboutPath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;

        const meta: BookMeta = {
          slug: entry,
          title: String(parsed.title ?? ''),
          author: String(parsed.author ?? ''),
          status: String(parsed.status ?? 'scaffolded') as BookStatus,
          created: String(parsed.created ?? ''),
          coverImage: String(parsed.coverImage ?? ''),
        };

        const wordCount = await this.countWords(entry);

        summaries.push({
          ...meta,
          wordCount,
          isActive: entry === activeSlug,
        });
      } catch {
        // Malformed or missing about.json — skip this directory
        continue;
      }
    }

    summaries.sort((a, b) => a.title.localeCompare(b.title));
    return summaries;
  }

  async getActiveBookSlug(): Promise<string> {
    const filePath = path.join(this.userDataDir, 'active-book.json');
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return String(parsed.book ?? '');
    } catch {
      return '';
    }
  }

  async setActiveBook(slug: string): Promise<void> {
    const filePath = path.join(this.userDataDir, 'active-book.json');
    await fs.writeFile(filePath, JSON.stringify({ book: slug }, null, 2), 'utf-8');
  }

  async createBook(title: string, author?: string): Promise<BookMeta> {
    const slug = this.slugify(title);
    const bookRoot = path.join(this.booksDir, slug);

    // Create directory tree
    await fs.mkdir(path.join(bookRoot, 'source'), { recursive: true });
    await fs.mkdir(path.join(bookRoot, 'chapters'), { recursive: true });
    await fs.mkdir(path.join(bookRoot, 'assets'), { recursive: true });
    await fs.mkdir(path.join(bookRoot, 'dist'), { recursive: true });

    const meta: BookMeta = {
      slug,
      title,
      author: author ?? '',
      status: 'scaffolded',
      created: new Date().toISOString(),
      coverImage: '',
    };

    // Write about.json
    await fs.writeFile(
      path.join(bookRoot, 'about.json'),
      JSON.stringify(
        { title: meta.title, author: meta.author, status: meta.status, created: meta.created, coverImage: meta.coverImage },
        null,
        2,
      ),
      'utf-8',
    );

    // Write starter source files
    await fs.writeFile(
      path.join(bookRoot, 'source', 'voice-profile.md'),
      `# Voice Profile\n\nDescribe the narrative voice, tone, and style for this book.\n`,
      'utf-8',
    );
    await fs.writeFile(
      path.join(bookRoot, 'source', 'scene-outline.md'),
      `# Scene Outline\n\nOutline the scenes and structure of your story.\n`,
      'utf-8',
    );
    await fs.writeFile(
      path.join(bookRoot, 'source', 'story-bible.md'),
      `# Story Bible\n\nCharacters, settings, world-building details, and continuity notes.\n`,
      'utf-8',
    );

    // Set as active book
    await this.setActiveBook(slug);

    return meta;
  }

  async getBookMeta(slug: string): Promise<BookMeta> {
    const aboutPath = path.join(this.booksDir, slug, 'about.json');
    let raw: string;
    try {
      raw = await fs.readFile(aboutPath, 'utf-8');
    } catch {
      throw new Error(`Book "${slug}" not found: about.json does not exist at ${aboutPath}`);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(`Book "${slug}" has malformed about.json at ${aboutPath}`);
    }

    return {
      slug,
      title: String(parsed.title ?? ''),
      author: String(parsed.author ?? ''),
      status: String(parsed.status ?? 'scaffolded') as BookStatus,
      created: String(parsed.created ?? ''),
      coverImage: String(parsed.coverImage ?? ''),
    };
  }

  async updateBookMeta(slug: string, partial: Partial<BookMeta>): Promise<void> {
    const existing = await this.getBookMeta(slug);

    // Only merge known BookMeta fields
    for (const key of Object.keys(partial) as (keyof BookMeta)[]) {
      if (KNOWN_BOOK_META_KEYS.has(key) && partial[key] !== undefined) {
        (existing as Record<string, unknown>)[key] = partial[key];
      }
    }

    const aboutPath = path.join(this.booksDir, slug, 'about.json');
    await fs.writeFile(
      aboutPath,
      JSON.stringify(
        { title: existing.title, author: existing.author, status: existing.status, created: existing.created, coverImage: existing.coverImage },
        null,
        2,
      ),
      'utf-8',
    );
  }

  // ── Project Manifest ─────────────────────────────────────────────

  async getProjectManifest(slug: string): Promise<ProjectManifest> {
    const meta = await this.getBookMeta(slug);
    const files: FileManifestItem[] = [];

    // Check each known source file
    const sourceFiles = [
      'source/pitch.md',
      'source/voice-profile.md',
      'source/scene-outline.md',
      'source/story-bible.md',
      'source/reader-report.md',
      'source/dev-report.md',
      'source/audit-report.md',
      'source/revision-prompts.md',
      'source/style-sheet.md',
      'source/project-tasks.md',
      'source/metadata.md',
      'about.json',
    ];

    for (const filePath of sourceFiles) {
      try {
        const exists = await this.fileExists(slug, filePath);
        if (exists) {
          const content = await this.readFile(slug, filePath);
          const wordCount = content.split(/\s+/).filter(Boolean).length;
          files.push({ path: filePath, wordCount });
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Check author-profile.md (lives in userData root, not book dir)
    try {
      const authorProfilePath = path.join(this.userDataDir, 'author-profile.md');
      const content = await fs.readFile(authorProfilePath, 'utf-8');
      if (content.trim()) {
        const wordCount = content.split(/\s+/).filter(Boolean).length;
        files.push({ path: 'author-profile.md', wordCount });
      }
    } catch {
      // No author profile yet — that's fine
    }

    // List chapter directories and their files
    let chapterCount = 0;
    let totalWordCount = 0;

    try {
      const chaptersDir = path.join(this.booksDir, slug, 'chapters');
      const entries = await fs.readdir(chaptersDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        chapterCount++;

        for (const fileName of ['draft.md', 'notes.md']) {
          const relativePath = `chapters/${entry.name}/${fileName}`;
          try {
            const exists = await this.fileExists(slug, relativePath);
            if (exists) {
              const content = await this.readFile(slug, relativePath);
              const wc = content.split(/\s+/).filter(Boolean).length;
              files.push({ path: relativePath, wordCount: wc });
              if (fileName === 'draft.md') totalWordCount += wc;
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // No chapters directory yet — that's fine for a new book
    }

    // Add source file word counts to total
    totalWordCount += files
      .filter((f) => f.path.startsWith('source/'))
      .reduce((sum, f) => sum + f.wordCount, 0);

    return { meta, files, chapterCount, totalWordCount };
  }

  // ── File Operations ───────────────────────────────────────────────

  async readFile(bookSlug: string, relativePath: string): Promise<string> {
    const filePath = path.join(this.booksDir, bookSlug, relativePath);
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      throw new Error(`File not found: ${relativePath} in book "${bookSlug}"`);
    }
  }

  async writeFile(bookSlug: string, relativePath: string, content: string): Promise<void> {
    const filePath = path.join(this.booksDir, bookSlug, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async renameFile(bookSlug: string, oldPath: string, newPath: string): Promise<void> {
    const sourcePath = path.join(this.booksDir, bookSlug, oldPath);
    const destPath = path.join(this.booksDir, bookSlug, newPath);

    // Verify source exists
    try {
      await fs.access(sourcePath);
    } catch {
      throw new Error(`Cannot rename: source file "${oldPath}" does not exist in book "${bookSlug}"`);
    }

    // Create parent directories of the destination if needed
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.rename(sourcePath, destPath);
  }

  async fileExists(bookSlug: string, relativePath: string): Promise<boolean> {
    const filePath = path.join(this.booksDir, bookSlug, relativePath);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async listDirectory(bookSlug: string, relativePath?: string): Promise<FileEntry[]> {
    const dirPath = path.join(this.booksDir, bookSlug, relativePath ?? '');
    return this.buildFileTree(dirPath, '', 0, 3);
  }

  // ── Word Count ────────────────────────────────────────────────────

  async countWords(bookSlug: string): Promise<number> {
    const chaptersDir = path.join(this.booksDir, bookSlug, 'chapters');
    let entries: string[];
    try {
      entries = await fs.readdir(chaptersDir);
    } catch {
      return 0;
    }

    let total = 0;
    for (const entry of entries) {
      const draftPath = path.join(chaptersDir, entry, 'draft.md');
      const content = await this.safeRead(draftPath);
      total += this.countWordsInText(content);
    }

    return total;
  }

  async countWordsPerChapter(bookSlug: string): Promise<{ slug: string; wordCount: number }[]> {
    const chaptersDir = path.join(this.booksDir, bookSlug, 'chapters');
    let entries: string[];
    try {
      entries = await fs.readdir(chaptersDir);
    } catch {
      return [];
    }

    // Sort numerically by leading number
    entries.sort((a, b) => {
      const numA = parseInt(a, 10) || 0;
      const numB = parseInt(b, 10) || 0;
      return numA - numB;
    });

    const results: { slug: string; wordCount: number }[] = [];
    for (const entry of entries) {
      const stat = await fs.stat(path.join(chaptersDir, entry)).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      const draftPath = path.join(chaptersDir, entry, 'draft.md');
      const content = await this.safeRead(draftPath);
      results.push({ slug: entry, wordCount: this.countWordsInText(content) });
    }

    return results;
  }

  // ── Cover Image ───────────────────────────────────────────────────

  async saveCoverImage(bookSlug: string, sourcePath: string): Promise<string> {
    const ext = path.extname(sourcePath).toLowerCase();
    if (!VALID_COVER_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported image type "${ext}". Supported: ${[...VALID_COVER_EXTENSIONS].join(', ')}`);
    }

    const bookRoot = path.join(this.booksDir, bookSlug);

    // Delete any existing cover with a different extension
    const meta = await this.getBookMeta(bookSlug);
    if (meta.coverImage) {
      const existingExt = path.extname(meta.coverImage).toLowerCase();
      if (existingExt !== ext) {
        const existingPath = path.join(bookRoot, meta.coverImage);
        await fs.unlink(existingPath).catch(() => {
          // Previous cover already gone — not an error
        });
      }
    }

    const destFilename = `cover${ext}`;
    const destPath = path.join(bookRoot, destFilename);
    await fs.copyFile(sourcePath, destPath);

    await this.updateBookMeta(bookSlug, { coverImage: destFilename });

    return destFilename;
  }

  async getCoverImageAbsolutePath(bookSlug: string): Promise<string | null> {
    const meta = await this.getBookMeta(bookSlug);
    if (!meta.coverImage) return null;

    const absPath = path.join(this.booksDir, bookSlug, meta.coverImage);
    try {
      await fs.access(absPath);
      return absPath;
    } catch {
      return null;
    }
  }

  // ── Private Helpers ───────────────────────────────────────────────

  private async safeRead(absolutePath: string): Promise<string> {
    try {
      return await fs.readFile(absolutePath, 'utf-8');
    } catch {
      return '';
    }
  }

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private countWordsInText(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }

  private async buildFileTree(
    basePath: string,
    relativePath: string,
    depth: number,
    maxDepth: number,
  ): Promise<FileEntry[]> {
    if (depth >= maxDepth) return [];

    const dirPath = relativePath ? path.join(basePath, relativePath) : basePath;
    let entries: string[];
    try {
      entries = await fs.readdir(dirPath);
    } catch {
      return [];
    }

    const SKIP_DIRS = new Set(['.git', 'node_modules']);
    const dirs: FileEntry[] = [];
    const files: FileEntry[] = [];

    for (const name of entries) {
      const entryRelPath = relativePath ? path.join(relativePath, name) : name;
      const fullPath = path.join(basePath, entryRelPath);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat) continue;

      if (stat.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        const children = await this.buildFileTree(basePath, entryRelPath, depth + 1, maxDepth);
        dirs.push({ name, path: entryRelPath, isDirectory: true, children });
      } else {
        files.push({ name, path: entryRelPath, isDirectory: false });
      }
    }

    // Sort directories first (alphabetically), then files (alphabetically)
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    return [...dirs, ...files];
  }
}
