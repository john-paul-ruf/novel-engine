# Session 06 — Filesystem Infrastructure

## Context

Novel Engine Electron app. Sessions 01–05 done. Now I need the **filesystem service** — it manages books, the active-book pointer, file I/O, and word counting.

## Architecture Rule

Lives in `src/infrastructure/filesystem/`. Imports from `@domain` and `node:fs/promises`, `node:path`. Implements `IFileSystemService`. No Electron imports.

## Task

Create `src/infrastructure/filesystem/FileSystemService.ts` and `index.ts` barrel.

### Constructor

```typescript
constructor(
  private booksDir: string,        // path to the books/ directory
  private userDataDir: string,     // path to user data root (for active-book.json, author-profile.md)
)
```

### Implementation Details

**`listBooks()`:**
1. Read `active-book.json` from `userDataDir` to get the active slug
2. Read all subdirectories of `booksDir` (skip names starting with `_`)
3. For each, read `about.json`, count words, determine if active
4. Return `BookSummary[]` sorted alphabetically by title
5. If `about.json` is missing or malformed, skip that directory

**`getActiveBookSlug()`:** Read `active-book.json`, return the `book` field. Return empty string if file doesn't exist.

**`setActiveBook(slug)`:** Write `{ "book": slug }` to `active-book.json`.

**`createBook(title, author?)`:**
1. Generate slug from title: lowercase, replace non-alphanumeric with hyphens, trim trailing hyphens
2. Create the full directory tree:
   - `books/{slug}/`
   - `books/{slug}/source/`
   - `books/{slug}/chapters/`
   - `books/{slug}/assets/`
   - `books/{slug}/dist/`
3. Write `about.json` with title, `author` (default `''` if not provided), status `'scaffolded'`, ISO creation date
4. Write starter source files (voice-profile.md, scene-outline.md, story-bible.md) with template content
5. Set as active book
6. Return the `BookMeta`

**`loadBookContext(slug)`:**
Read all source files using a private `safeRead(path)` helper that returns empty string on any error. The field-to-filename mapping is:

| BookContext field | File path |
|---|---|
| `authorProfile` | `{userDataDir}/author-profile.md` (NOTE: lives in user data root, not in the book) |
| `voiceProfile` | `source/voice-profile.md` |
| `sceneOutline` | `source/scene-outline.md` |
| `storyBible` | `source/story-bible.md` |
| `readerReport` | `source/reader-report.md` |
| `devReport` | `source/dev-report.md` |
| `auditReport` | `source/audit-report.md` |
| `styleSheet` | `source/style-sheet.md` |
| `projectTasks` | `source/project-tasks.md` |
| `revisionPrompts` | `source/revision-prompts.md` |

Read all chapter directories sorted numerically, loading `draft.md` and `notes.md` from each. Assemble into `BookContext`.

**`readFile(bookSlug, relativePath)`:** Read from `booksDir/{slug}/{relativePath}`. Throw if not found.

**`writeFile(bookSlug, relativePath, content)`:** Write to `booksDir/{slug}/{relativePath}`. Create parent directories if needed with `{ recursive: true }`.

**`fileExists(bookSlug, relativePath)`:** Check existence, return boolean.

**`listDirectory(bookSlug, relativePath?)`:**
Build a recursive `FileEntry[]` tree, max depth 3. Skip `.git` and `node_modules` directories. Sort directories first, then files, both alphabetically.

**`countWords(slug)`:** Sum words across all `chapters/*/draft.md` files. Words = split on `/\s+/`, filter empty.

**`countWordsPerChapter(slug)`:** Return per-chapter word counts as `{ slug: string; wordCount: number }[]`.

### Private helpers

- `safeRead(absolutePath: string): Promise<string>` — try readFile, catch → return `''`
- `slugify(title: string): string` — lowercase, replace non-`[a-z0-9]` with `-`, collapse runs, trim ends

## Verification

- Compiles with `npx tsc --noEmit`
- Implements `IFileSystemService`
- No imports from Electron, application, renderer, or other infrastructure
- `createBook()` produces the full directory tree with all starter files
- `loadBookContext()` returns a valid `BookContext` even when most files don't exist yet
