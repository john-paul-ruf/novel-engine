# Session 28 — Shelved Pitches: Domain, Infrastructure, and IPC

## Context

Novel Engine Electron app. Sessions 01–27 built the complete app including agent chat with tool use, pipeline tracking, structured file browser, and the Context Wrangler → Agent Self-Read migration.

**The Gap:** Spark's agent prompt (`SPARK.md`) defines a "Shelve" action where the author can save a pitch for later to `books/_pitches/[slug].md`. The `_pitches/` directory is described as a holding pen — no agent reads from it automatically, and the author can return to a shelved pitch anytime. However, the Electron app has **zero support** for this:

- No `_pitches/` directory management
- No IPC channels for listing, reading, or deleting shelved pitches
- No UI to browse or restore shelved pitches
- `listBooks()` already skips `_` prefixed directories (line 45 of `FileSystemService.ts`), so `_pitches/` won't appear in the book selector — this is correct behavior

**The Fix:** Build the backend plumbing for shelved pitches in this session (domain types, filesystem operations, IPC channels, preload bridge). Session 29 adds the UI.

### Design Decisions

1. **Shelved pitches live in `{booksDir}/_pitches/`** — a flat directory of markdown files, one per pitch. Each file is named `{slug}.md` where slug is derived from the pitch title.

2. **Pitch file format:** Each shelved pitch is a self-contained markdown file. Spark writes the entire pitch card into it. The file also contains a YAML-style front matter block with metadata:

```markdown
---
title: The Last Garden
shelvedAt: 2026-03-21T14:30:00.000Z
shelvedFrom: the-last-garden
logline: A botanist discovers her grandmother's garden grows memories instead of flowers.
---

# The Last Garden

[Full pitch card content as written by Spark...]
```

3. **Operations supported:**
   - `listShelvedPitches()` — returns metadata for all pitches in `_pitches/`
   - `readShelvedPitch(slug)` — returns full content of a pitch file
   - `deleteShelvedPitch(slug)` — removes a pitch file (the "Kill" action)
   - `shelvePitch(bookSlug)` — reads `source/pitch.md` from a book, wraps it with front matter, saves to `_pitches/`, and optionally deletes the source pitch
   - `restorePitch(pitchSlug)` — creates a new book from a shelved pitch (calls `createBook`, writes `source/pitch.md`, deletes from `_pitches/`)

4. **No agent integration changes.** Spark already knows about `_pitches/` from its prompt. When running in agent mode with tool access, Spark can write to `../_pitches/slug.md` relative to the book root. This session adds the app-level support for the UI to manage those files.

---

## Task 1: Add Domain Types

### Update `src/domain/types.ts`

Add these types after the `BookSummary` type:

```typescript
// === Shelved Pitches ===

export type ShelvedPitchMeta = {
  slug: string;              // filename without .md extension
  title: string;             // extracted from front matter or first heading
  logline: string;           // one-line description from front matter
  shelvedAt: string;         // ISO date when the pitch was shelved
  shelvedFrom: string;       // book slug it was shelved from (empty if created directly)
};

export type ShelvedPitch = ShelvedPitchMeta & {
  content: string;           // full markdown content (without front matter)
};
```

---

## Task 2: Add Interface Methods

### Update `src/domain/interfaces.ts`

Add to `IFileSystemService`, after the cover image methods:

```typescript
// Shelved pitches
listShelvedPitches(): Promise<ShelvedPitchMeta[]>;
readShelvedPitch(slug: string): Promise<ShelvedPitch>;
deleteShelvedPitch(slug: string): Promise<void>;
shelvePitch(bookSlug: string, logline?: string): Promise<ShelvedPitchMeta>;
restorePitch(pitchSlug: string): Promise<BookMeta>;
```

Import `ShelvedPitch` and `ShelvedPitchMeta` from types.

---

## Task 3: Implement in FileSystemService

### Update `src/infrastructure/filesystem/FileSystemService.ts`

Add a new section `// ── Shelved Pitches ───` after the Cover Image section. Import `ShelvedPitch` and `ShelvedPitchMeta` from `@domain/types`.

**`listShelvedPitches()`:**

```typescript
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
```

**`readShelvedPitch(slug)`:**

```typescript
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
```

**`deleteShelvedPitch(slug)`:**

```typescript
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
```

**`shelvePitch(bookSlug, logline?)`:**

Reads `source/pitch.md` from the given book, wraps it with front matter, and saves to `_pitches/`.

```typescript
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
```

**`restorePitch(pitchSlug)`:**

Creates a new book from a shelved pitch and removes the pitch from the shelf.

```typescript
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
```

**Private helpers:**

```typescript
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
```

---

## Task 4: Add IPC Handlers

### Update `src/main/ipc/handlers.ts`

Add a new section `// === Shelved Pitches ===` after the Shell section:

```typescript
// === Shelved Pitches ===

ipcMain.handle('pitches:list', () => services.fs.listShelvedPitches());

ipcMain.handle('pitches:read', (_, slug: string) => services.fs.readShelvedPitch(slug));

ipcMain.handle('pitches:delete', (_, slug: string) => services.fs.deleteShelvedPitch(slug));

ipcMain.handle('pitches:shelve', (_, bookSlug: string, logline?: string) =>
  services.fs.shelvePitch(bookSlug, logline),
);

ipcMain.handle('pitches:restore', async (_, pitchSlug: string) => {
  const meta = await services.fs.restorePitch(pitchSlug);
  hooks?.onActiveBookChanged?.(meta.slug);
  return meta;
});
```

---

## Task 5: Update Preload Bridge

### Update `src/preload/index.ts`

Import `ShelvedPitch` and `ShelvedPitchMeta` from `@domain/types`.

Add a new namespace after `build:`:

```typescript
// Shelved Pitches
pitches: {
  list: (): Promise<ShelvedPitchMeta[]> => ipcRenderer.invoke('pitches:list'),
  read: (slug: string): Promise<ShelvedPitch> => ipcRenderer.invoke('pitches:read', slug),
  delete: (slug: string): Promise<void> => ipcRenderer.invoke('pitches:delete', slug),
  shelve: (bookSlug: string, logline?: string): Promise<ShelvedPitchMeta> =>
    ipcRenderer.invoke('pitches:shelve', bookSlug, logline),
  restore: (pitchSlug: string): Promise<BookMeta> =>
    ipcRenderer.invoke('pitches:restore', pitchSlug),
},
```

---

## Summary of Changes by File

| File | Change |
|------|--------|
| `src/domain/types.ts` | Add `ShelvedPitchMeta` and `ShelvedPitch` types |
| `src/domain/interfaces.ts` | Add 5 shelved pitch methods to `IFileSystemService` |
| `src/infrastructure/filesystem/FileSystemService.ts` | Implement all 5 methods + 3 private helpers |
| `src/main/ipc/handlers.ts` | Add 5 `pitches:*` IPC handlers |
| `src/preload/index.ts` | Add `pitches` namespace to preload bridge |

## Architecture Notes

- **Layer boundaries preserved.** All pitch operations live in `IFileSystemService` (infrastructure). No new application-layer service needed — pitch management is pure file I/O with no business logic requiring orchestration.
- **`listBooks()` already skips `_pitches/`.** The `_` prefix check on line 45 of `FileSystemService` ensures shelved pitches never appear in the book selector.
- **Front matter parsing is simple string matching.** No YAML parser dependency — the front matter format is tightly controlled by `shelvePitch()`.
- **`restorePitch` reuses `createBook`.** This ensures all the standard book scaffolding (directories, about.json, copyright page) is created. The pitch content is then written on top.

## Verification

1. **Type check:**
   - `npx tsc --noEmit` passes with zero errors

2. **Manual test — shelve a pitch:**
   - Open a book that has `source/pitch.md`
   - Call `window.novelEngine.pitches.shelve('book-slug')` from the dev console
   - Verify `_pitches/book-slug.md` is created with front matter

3. **Manual test — list pitches:**
   - Call `window.novelEngine.pitches.list()` from the dev console
   - Verify it returns an array with the shelved pitch metadata

4. **Manual test — restore a pitch:**
   - Call `window.novelEngine.pitches.restore('book-slug')` from the dev console
   - Verify a new book is created with the pitch content in `source/pitch.md`
   - Verify the pitch is removed from `_pitches/`

5. **Manual test — delete a pitch:**
   - Shelve a pitch, then call `window.novelEngine.pitches.delete('slug')`
   - Verify the file is removed from `_pitches/`

6. **No cross-contamination:**
   - `window.novelEngine.books.list()` should NOT include `_pitches` as a book
