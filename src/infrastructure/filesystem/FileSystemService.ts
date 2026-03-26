import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IFileSystemService } from '@domain/interfaces';
import type {
  BookMeta,
  BookStatus,
  BookSummary,
  FileEntry,
  FileManifestItem,
  PitchDraft,
  ProjectManifest,
  ShelvedPitch,
  ShelvedPitchMeta,
} from '@domain/types';
import { PITCH_ROOM_SLUG } from '@domain/constants';

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

  getAuthorProfilePath(): string {
    return path.join(this.userDataDir, 'author-profile.md');
  }

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
      if (entry.startsWith('_') || entry.startsWith('.')) continue;
      if (entry === PITCH_ROOM_SLUG) continue;

      const entryPath = path.join(this.booksDir, entry);
      const stat = await fs.stat(entryPath).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      const aboutPath = path.join(entryPath, 'about.json');

      let meta: BookMeta;
      try {
        const raw = await fs.readFile(aboutPath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;

        meta = {
          slug: entry,
          title: String(parsed.title ?? ''),
          author: String(parsed.author ?? ''),
          status: String(parsed.status ?? 'scaffolded') as BookStatus,
          created: String(parsed.created ?? ''),
          coverImage: String(parsed.coverImage ?? ''),
        };
      } catch (err) {
        const isNotFound = (err as NodeJS.ErrnoException).code === 'ENOENT';
        if (!isNotFound) {
          // about.json exists but is malformed — skip to avoid clobbering user data
          continue;
        }
        // about.json is absent — auto-import this directory as a new book
        meta = await this.importExternalBookDirectory(entry, entryPath, aboutPath);
      }

      const wordCount = await this.countWords(entry);

      summaries.push({
        ...meta,
        wordCount,
        isActive: entry === activeSlug,
      });
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

    // NOTE: Do NOT create starter source files that serve as pipeline phase
    // completion gates. `scene-outline.md` in particular gates the "scaffold"
    // phase — creating it here would mark scaffold as immediately "complete"
    // before the user has actually done any work with Verity.

    await fs.mkdir(path.join(bookRoot, 'chapters', '00-0-copyright'), { recursive: true });
    await fs.writeFile(
      path.join(bookRoot, 'chapters', '00-0-copyright', 'draft.md'),
      this.generateCopyrightContent(meta.title, meta.author),
      'utf-8',
    );

    await fs.mkdir(path.join(bookRoot, 'chapters', '00-1-dedication'), { recursive: true });
    await fs.writeFile(
      path.join(bookRoot, 'chapters', '00-1-dedication', 'draft.md'),
      '# Dedication\n\n',
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

  async updateBookMeta(slug: string, partial: Partial<BookMeta>): Promise<BookMeta> {
    const existing = await this.getBookMeta(slug);

    const newSlug = partial.title ? this.slugify(partial.title) : slug;
    let currentSlug = slug;

    for (const key of Object.keys(partial) as (keyof BookMeta)[]) {
      if (KNOWN_BOOK_META_KEYS.has(key) && partial[key] !== undefined) {
        (existing as Record<string, unknown>)[key] = partial[key];
      }
    }

    if (newSlug && newSlug !== slug) {
      const oldDir = path.join(this.booksDir, slug);
      const newDir = path.join(this.booksDir, newSlug);

      try {
        await fs.access(newDir);
        throw new Error(`Cannot rename book: a book with slug "${newSlug}" already exists`);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Cannot rename book')) throw err;
      }

      await fs.rename(oldDir, newDir);
      currentSlug = newSlug;
      existing.slug = newSlug;

      const activeSlug = await this.getActiveBookSlug();
      if (activeSlug === slug) {
        await this.setActiveBook(newSlug);
      }
    }

    const aboutPath = path.join(this.booksDir, currentSlug, 'about.json');
    await fs.writeFile(
      aboutPath,
      JSON.stringify(
        { title: existing.title, author: existing.author, status: existing.status, created: existing.created, coverImage: existing.coverImage },
        null,
        2,
      ),
      'utf-8',
    );

    return existing;
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
    // Use the absolute path so the CLI agent can Read it from the book's cwd
    try {
      const authorProfilePath = path.join(this.userDataDir, 'author-profile.md');
      const content = await fs.readFile(authorProfilePath, 'utf-8');
      if (content.trim()) {
        const wordCount = content.split(/\s+/).filter(Boolean).length;
        files.push({ path: authorProfilePath, wordCount });
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

        // Skip front-matter chapters — these are publishing artifacts
        // (auto-generated copyright page, author-written dedication).
        // They are concatenated by BuildService/Pandoc, not read by agents.
        if (/^00-\d+-/.test(entry.name)) continue;

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

    // totalWordCount is manuscript prose only (chapter drafts).
    // Source documents (pitch, story-bible, reports, etc.) are listed
    // in the manifest for agents to read, but are NOT part of the
    // manuscript word count — they're planning/analysis artifacts.
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

  async deleteFile(bookSlug: string, relativePath: string): Promise<void> {
    const filePath = path.join(this.booksDir, bookSlug, relativePath);
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      // Ignore "file not found" — treat as already deleted
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async deletePath(bookSlug: string, relativePath: string): Promise<void> {
    const fullPath = path.join(this.booksDir, bookSlug, relativePath);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
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
    const bookRoot = path.join(this.booksDir, bookSlug);
    return this.buildFileTree(bookRoot, relativePath ?? '', 0, 3);
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
      // Skip front-matter chapters (00-0-copyright, 00-1-dedication, etc.)
      // to match the manuscript word count reported by agents via getProjectManifest()
      if (/^00-\d+-/.test(entry)) continue;

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

    // Sort: front matter (00, 01) → body (02-99) → back matter (z0, z1, …)
    entries.sort((a, b) => this.chapterSortKey(a) - this.chapterSortKey(b));

    const results: { slug: string; wordCount: number }[] = [];
    for (const entry of entries) {
      const stat = await fs.stat(path.join(chaptersDir, entry)).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      // Front-matter chapters (00-0-copyright, 00-1-dedication) are included
      // in the list so BuildService can assemble them, but report 0 words
      // so manuscript word counts match what agents report via getProjectManifest().
      const isFrontMatter = /^00-\d+-/.test(entry);

      const draftPath = path.join(chaptersDir, entry, 'draft.md');
      const content = await this.safeRead(draftPath);
      results.push({
        slug: entry,
        wordCount: isFrontMatter ? 0 : this.countWordsInText(content),
      });
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

  // ── Book Archiving ──────────────────────────────────────────────

  async archiveBook(slug: string): Promise<void> {
    const bookDir = path.join(this.booksDir, slug);
    const archivedDir = path.join(this.booksDir, '_archived');
    const destDir = path.join(archivedDir, slug);

    // Verify the book exists
    try {
      await fs.access(bookDir);
    } catch {
      throw new Error(`Book "${slug}" not found — cannot archive`);
    }

    // Ensure _archived directory exists
    await fs.mkdir(archivedDir, { recursive: true });

    // Check destination doesn't already exist
    try {
      await fs.access(destDir);
      throw new Error(`An archived book with slug "${slug}" already exists`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('An archived book')) throw err;
      // Doesn't exist — safe to move
    }

    await fs.rename(bookDir, destDir);

    // If the archived book was the active book, clear active selection
    const activeSlug = await this.getActiveBookSlug();
    if (activeSlug === slug) {
      await this.setActiveBook('');
    }
  }

  async unarchiveBook(slug: string): Promise<BookMeta> {
    const archivedDir = path.join(this.booksDir, '_archived', slug);
    const destDir = path.join(this.booksDir, slug);

    // Verify the archived book exists
    try {
      await fs.access(archivedDir);
    } catch {
      throw new Error(`Archived book "${slug}" not found — cannot unarchive`);
    }

    // Check destination doesn't already exist (name collision with an active book)
    try {
      await fs.access(destDir);
      throw new Error(`A book with slug "${slug}" already exists — cannot unarchive`);
    } catch (err) {
      if (err instanceof Error && err.message.includes('already exists')) throw err;
      // Doesn't exist — safe to move
    }

    await fs.rename(archivedDir, destDir);

    // Read and return the meta
    return this.getBookMeta(slug);
  }

  async listArchivedBooks(): Promise<BookSummary[]> {
    const archivedDir = path.join(this.booksDir, '_archived');
    let entries: string[];
    try {
      entries = await fs.readdir(archivedDir);
    } catch {
      return [];
    }

    const summaries: BookSummary[] = [];

    for (const entry of entries) {
      if (entry.startsWith('.')) continue;

      const entryPath = path.join(archivedDir, entry);
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

        summaries.push({
          ...meta,
          wordCount: 0, // Don't scan chapters for archived books — keep it lightweight
          isActive: false,
        });
      } catch {
        // Skip unreadable entries
      }
    }

    summaries.sort((a, b) => a.title.localeCompare(b.title));
    return summaries;
  }

  // ── Slug Reconciliation ───────────────────────────────────────────

  /**
   * Scans every book folder and renames any whose directory name no longer
   * matches the slug derived from the title stored in about.json.
   *
   * This handles the case where the user (or an agent) edits about.json on
   * disk without going through the updateBookMeta UI path.
   *
   * Returns an array of { oldSlug, newSlug } pairs for every rename performed
   * so the caller can migrate database records accordingly.
   */
  async reconcileBookSlugs(): Promise<Array<{ oldSlug: string; newSlug: string }>> {
    const migrations: Array<{ oldSlug: string; newSlug: string }> = [];

    let entries: string[];
    try {
      entries = await fs.readdir(this.booksDir);
    } catch {
      return migrations;
    }

    for (const entry of entries) {
      if (entry.startsWith('_') || entry.startsWith('.')) continue;

      const entryPath = path.join(this.booksDir, entry);
      const stat = await fs.stat(entryPath).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      const aboutPath = path.join(entryPath, 'about.json');
      try {
        const raw = await fs.readFile(aboutPath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const title = String(parsed.title ?? '').trim();
        if (!title) continue;

        const expectedSlug = this.slugify(title);
        if (!expectedSlug || expectedSlug === entry) continue;

        // Slug mismatch — check the target directory doesn't already exist
        const newDir = path.join(this.booksDir, expectedSlug);
        try {
          await fs.access(newDir);
          // Target already exists — skip to avoid clobbering another book
          console.warn(
            `[FileSystemService] Cannot auto-rename "${entry}" → "${expectedSlug}": target already exists`,
          );
          continue;
        } catch {
          // Target doesn't exist — safe to rename
        }

        await fs.rename(entryPath, newDir);

        // Keep active-book.json in sync
        const activeSlug = await this.getActiveBookSlug();
        if (activeSlug === entry) {
          await this.setActiveBook(expectedSlug);
        }

        console.log(`[FileSystemService] Auto-renamed book folder: "${entry}" → "${expectedSlug}"`);
        migrations.push({ oldSlug: entry, newSlug: expectedSlug });
      } catch (err) {
        console.warn(`[FileSystemService] reconcileBookSlugs: skipping "${entry}":`, err);
      }
    }

    return migrations;
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

  // ── Shelved Pitches ──────────────────────────────────────────────

  async listShelvedPitches(): Promise<ShelvedPitchMeta[]> {
    const pitchesDir = path.join(this.booksDir, '_pitches');
    let entries: string[];
    try {
      entries = await fs.readdir(pitchesDir);
    } catch {
      return []; // Directory doesn't exist yet — no pitches
    }

    const pitches: ShelvedPitchMeta[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const slug = entry.replace(/\.md$/, '');
      try {
        const filePath = path.join(pitchesDir, entry);
        const raw = await fs.readFile(filePath, 'utf-8');
        const meta = this.parsePitchFrontMatter(slug, raw);
        pitches.push(meta);
      } catch {
        // Skip unreadable files
      }
    }

    // Sort by shelvedAt descending (newest first)
    pitches.sort((a, b) => b.shelvedAt.localeCompare(a.shelvedAt));
    return pitches;
  }

  async readShelvedPitch(slug: string): Promise<ShelvedPitch> {
    const filePath = path.join(this.booksDir, '_pitches', `${slug}.md`);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch {
      throw new Error(`Shelved pitch "${slug}" not found`);
    }

    const meta = this.parsePitchFrontMatter(slug, raw);
    const content = this.stripFrontMatter(raw);
    return { ...meta, content };
  }

  async deleteShelvedPitch(slug: string): Promise<void> {
    const filePath = path.join(this.booksDir, '_pitches', `${slug}.md`);
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async shelvePitch(bookSlug: string, logline?: string): Promise<ShelvedPitchMeta> {
    // Read the book's pitch
    const pitchContent = await this.readFile(bookSlug, 'source/pitch.md');
    if (!pitchContent.trim()) {
      throw new Error(`Book "${bookSlug}" has no pitch to shelve`);
    }

    const meta = await this.getBookMeta(bookSlug);
    const slug = this.slugify(meta.title);
    const now = new Date().toISOString();

    // Extract logline from first non-heading paragraph if not provided
    const resolvedLogline = logline || this.extractLogline(pitchContent);

    // Build the shelved pitch file with front matter
    const frontMatter = [
      '---',
      `title: ${meta.title}`,
      `shelvedAt: ${now}`,
      `shelvedFrom: ${bookSlug}`,
      `logline: ${resolvedLogline}`,
      '---',
      '',
    ].join('\n');

    const fileContent = frontMatter + pitchContent;

    // Ensure _pitches directory exists
    const pitchesDir = path.join(this.booksDir, '_pitches');
    await fs.mkdir(pitchesDir, { recursive: true });

    // Write the pitch file (overwrites if same slug exists)
    await fs.writeFile(path.join(pitchesDir, `${slug}.md`), fileContent, 'utf-8');

    return {
      slug,
      title: meta.title,
      logline: resolvedLogline,
      shelvedAt: now,
      shelvedFrom: bookSlug,
    };
  }

  async restorePitch(pitchSlug: string): Promise<BookMeta> {
    const pitch = await this.readShelvedPitch(pitchSlug);

    // Create a new book with the pitch title
    const bookMeta = await this.createBook(pitch.title);

    // Write the pitch content to the new book's source/pitch.md
    await this.writeFile(bookMeta.slug, 'source/pitch.md', pitch.content);

    // Remove from shelf
    await this.deleteShelvedPitch(pitchSlug);

    return bookMeta;
  }

  // ── Pitch Room Drafts ────────────────────────────────────────────

  getPitchDraftPath(conversationId: string): string {
    const draftDir = path.join(this.booksDir, PITCH_ROOM_SLUG, 'drafts', conversationId);
    // Synchronous path resolution — directory creation happens lazily when the CLI runs
    return draftDir;
  }

  async listPitchDrafts(): Promise<PitchDraft[]> {
    const draftsDir = path.join(this.booksDir, PITCH_ROOM_SLUG, 'drafts');
    let entries: string[];
    try {
      entries = await fs.readdir(draftsDir);
    } catch {
      return [];
    }

    const drafts: PitchDraft[] = [];
    for (const entry of entries) {
      const entryPath = path.join(draftsDir, entry);
      const stat = await fs.stat(entryPath).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      const draft = await this.buildPitchDraft(entry, entryPath, stat);
      drafts.push(draft);
    }

    // Sort by updatedAt descending (newest first)
    drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return drafts;
  }

  async getPitchDraft(conversationId: string): Promise<PitchDraft | null> {
    const draftDir = path.join(this.booksDir, PITCH_ROOM_SLUG, 'drafts', conversationId);
    const stat = await fs.stat(draftDir).catch(() => null);
    if (!stat || !stat.isDirectory()) return null;

    return this.buildPitchDraft(conversationId, draftDir, stat);
  }

  async readPitchDraftContent(conversationId: string): Promise<string> {
    const resolved = await this.resolvePitchFile(conversationId);
    if (!resolved) {
      throw new Error(`No pitch.md found for draft conversation "${conversationId}"`);
    }
    return fs.readFile(resolved, 'utf-8');
  }

  async deletePitchDraft(conversationId: string): Promise<void> {
    const draftDir = path.join(this.booksDir, PITCH_ROOM_SLUG, 'drafts', conversationId);
    try {
      await fs.rm(draftDir, { recursive: true, force: true });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async promotePitchToBook(conversationId: string): Promise<BookMeta> {
    const pitchContent = await this.readPitchDraftContent(conversationId);

    // Extract title from first heading
    const titleMatch = pitchContent.match(/^#\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() || 'Untitled Book';

    // Create a real book
    const bookMeta = await this.createBook(title);

    // Copy pitch content to the new book
    await this.writeFile(bookMeta.slug, 'source/pitch.md', pitchContent);

    // Delete the draft folder
    await this.deletePitchDraft(conversationId);

    return bookMeta;
  }

  async shelvePitchDraft(conversationId: string, logline?: string): Promise<ShelvedPitchMeta> {
    const pitchContent = await this.readPitchDraftContent(conversationId);

    // Extract title from first heading
    const titleMatch = pitchContent.match(/^#\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() || 'Untitled Pitch';
    const slug = this.slugify(title);
    const now = new Date().toISOString();

    // Extract logline from first non-heading paragraph if not provided
    const resolvedLogline = logline || this.extractLogline(pitchContent);

    // Build the shelved pitch file with front matter
    const frontMatter = [
      '---',
      `title: ${title}`,
      `shelvedAt: ${now}`,
      `shelvedFrom: `,
      `logline: ${resolvedLogline}`,
      '---',
      '',
    ].join('\n');

    const fileContent = frontMatter + pitchContent;

    // Ensure _pitches directory exists
    const pitchesDir = path.join(this.booksDir, '_pitches');
    await fs.mkdir(pitchesDir, { recursive: true });

    // Write the pitch file
    await fs.writeFile(path.join(pitchesDir, `${slug}.md`), fileContent, 'utf-8');

    // Delete the draft folder
    await this.deletePitchDraft(conversationId);

    return {
      slug,
      title,
      logline: resolvedLogline,
      shelvedAt: now,
      shelvedFrom: '',
    };
  }

  private async buildPitchDraft(
    conversationId: string,
    draftDir: string,
    stat: { mtime: Date; birthtime: Date },
  ): Promise<PitchDraft> {
    let hasPitch = false;
    let title = 'Untitled Draft';

    const resolved = await this.resolvePitchFile(conversationId);
    if (resolved) {
      try {
        const content = await fs.readFile(resolved, 'utf-8');
        hasPitch = content.trim().length > 0;
        if (hasPitch) {
          const titleMatch = content.match(/^#\s+(.+)$/m);
          if (titleMatch?.[1]) {
            title = titleMatch[1].trim();
          }
        }
      } catch {
        // File resolved but couldn't be read — treat as no pitch
      }
    }

    return {
      conversationId,
      title,
      hasPitch,
      createdAt: stat.birthtime.toISOString(),
      updatedAt: stat.mtime.toISOString(),
    };
  }

  /**
   * Resolve the pitch file for a draft conversation.
   *
   * Checks the canonical path first (`source/pitch.md`), then falls back to
   * scanning the draft directory for any `.md` file. Agents sometimes write
   * the pitch with a custom filename or to the root instead of `source/`.
   *
   * Returns the absolute path to the pitch file, or null if none found.
   */
  private async resolvePitchFile(conversationId: string): Promise<string | null> {
    const draftDir = path.join(this.booksDir, PITCH_ROOM_SLUG, 'drafts', conversationId);

    // 1. Check canonical path
    const canonicalPath = path.join(draftDir, 'source', 'pitch.md');
    try {
      await fs.access(canonicalPath);
      return canonicalPath;
    } catch {
      // Not at canonical path — try fallbacks
    }

    // 2. Check source/ directory for any .md file
    try {
      const sourceDir = path.join(draftDir, 'source');
      const sourceEntries = await fs.readdir(sourceDir);
      const mdFile = sourceEntries.find((f) => f.endsWith('.md'));
      if (mdFile) {
        return path.join(sourceDir, mdFile);
      }
    } catch {
      // source/ doesn't exist — try root
    }

    // 3. Check draft root for any .md file (agent wrote to root instead of source/)
    try {
      const rootEntries = await fs.readdir(draftDir);
      const mdFile = rootEntries.find((f) => f.endsWith('.md'));
      if (mdFile) {
        return path.join(draftDir, mdFile);
      }
    } catch {
      // Draft directory doesn't exist
    }

    return null;
  }

  // ── Private Helpers ───────────────────────────────────────────────

  /**
   * Sort key for chapter folder names that correctly orders:
   *   00-0-copyright, 00-1-dedication → front matter (sub-indexed under 00)
   *   02-chapter … 99-chapter         → body (2–99)
   *   z0-notes, z1-afterword …     → back matter (10000+)
   *
   * Without this, `parseInt('z0-...', 10)` returns NaN → 0, wrongly
   * placing back matter before the copyright page.
   */
  private chapterSortKey(name: string): number {
    if (name.toLowerCase().startsWith('z')) {
      const n = parseInt(name.slice(1), 10);
      return 10000 + (isNaN(n) ? 0 : n);
    }
    const fmMatch = name.match(/^00-(\d+)-/);
    if (fmMatch) {
      return parseInt(fmMatch[1], 10) * 0.01;
    }
    const n = parseInt(name, 10);
    return isNaN(n) ? 5000 : n;
  }

  /**
   * Generate the auto-populated content for the 00-0-copyright chapter.
   * This is written at book-creation time and regenerated during build
   * if the draft is empty.
   */
  generateCopyrightContent(title: string, author: string): string {
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

  private async safeRead(absolutePath: string): Promise<string> {
    try {
      return await fs.readFile(absolutePath, 'utf-8');
    } catch {
      return '';
    }
  }

  /**
   * Auto-import a directory that exists in booksDir but has no about.json.
   *
   * Creates a minimal about.json from the directory name and ensures the
   * required subdirectories (source/, chapters/, dist/, assets/) exist.
   * This is idempotent: subsequent calls to listBooks() will read the
   * newly-created about.json normally.
   */
  private async importExternalBookDirectory(
    slug: string,
    dirPath: string,
    aboutPath: string,
  ): Promise<BookMeta> {
    // Humanize the slug into a presentable title: "my-great-novel" → "My Great Novel"
    const title = slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const meta: BookMeta = {
      slug,
      title,
      author: '',
      status: 'scaffolded',
      created: new Date().toISOString(),
      coverImage: '',
    };

    // Write the stub about.json (best-effort — non-fatal if the dir is read-only)
    await fs
      .writeFile(
        aboutPath,
        JSON.stringify(
          {
            title: meta.title,
            author: meta.author,
            status: meta.status,
            created: meta.created,
            coverImage: meta.coverImage,
          },
          null,
          2,
        ),
        'utf-8',
      )
      .catch((err: unknown) => {
        console.warn(`[FileSystemService] Could not write stub about.json for "${slug}":`, err);
      });

    // Ensure the standard subdirectories exist (best-effort)
    await Promise.all([
      fs.mkdir(path.join(dirPath, 'source'), { recursive: true }),
      fs.mkdir(path.join(dirPath, 'chapters'), { recursive: true }),
      fs.mkdir(path.join(dirPath, 'dist'), { recursive: true }),
      fs.mkdir(path.join(dirPath, 'assets'), { recursive: true }),
    ]).catch((err: unknown) => {
      console.warn(`[FileSystemService] Could not create subdirectories for "${slug}":`, err);
    });

    return meta;
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

  private parsePitchFrontMatter(slug: string, raw: string): ShelvedPitchMeta {
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      // No front matter — extract title from first heading
      const titleMatch = raw.match(/^#\s+(.+)$/m);
      return {
        slug,
        title: titleMatch?.[1]?.trim() || slug,
        logline: '',
        shelvedAt: '',
        shelvedFrom: '',
      };
    }

    const fm = fmMatch[1];
    const getValue = (key: string): string => {
      const match = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
      return match?.[1]?.trim() || '';
    };

    return {
      slug,
      title: getValue('title') || slug,
      logline: getValue('logline'),
      shelvedAt: getValue('shelvedAt'),
      shelvedFrom: getValue('shelvedFrom'),
    };
  }

  private stripFrontMatter(raw: string): string {
    return raw.replace(/^---\n[\s\S]*?\n---\n*/, '');
  }

  private extractLogline(pitchContent: string): string {
    // Find the first non-empty, non-heading line
    const lines = pitchContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('---')) continue;
      // Return first 200 chars of the first content line
      return trimmed.length > 200 ? trimmed.slice(0, 197) + '...' : trimmed;
    }
    return '';
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
