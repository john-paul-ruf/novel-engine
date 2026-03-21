# Chapter Validator — Automatic Chapter File Structure Enforcement

## Overview

The **ChapterValidator** is a quality-assurance service that automatically detects and corrects chapter files that are placed in incorrect folder structures when agents (especially Verity) write chapters.

## The Problem

When Verity writes a new chapter, the Claude Code CLI may sometimes place the file in an incorrect location, such as:

- `chapters/draft.md` instead of `chapters/01-the-beginning/draft.md`
- `chapters/01-the-beginning-draft.md` instead of `chapters/01-the-beginning/draft.md`
- `draft.md` at the root level instead of in a chapter subdirectory
- Misnamed files like `chapter-1.md` instead of `draft.md` or `notes.md`

## The Solution

The ChapterValidator runs **automatically after every agent interaction** and:

1. **Scans** the chapters directory for misplaced files
2. **Detects** chapter files that don't follow the spec
3. **Moves** or **renames** them to the correct location
4. **Logs** corrections for diagnostics
5. **Reports** to the UI that corrections were made

## Specification

All chapters must follow this exact structure:

```
chapters/
├── 01-the-beginning/
│   ├── draft.md          (required — the prose)
│   └── notes.md          (optional — author annotations)
├── 02-the-meeting/
│   ├── draft.md
│   └── notes.md
└── ...
```

**Rules:**
- Chapter directories: `NN-slug` (e.g., `01-the-beginning`, `02-the-meeting`)
- Chapter files: only `draft.md` or `notes.md` allowed
- No files directly in `chapters/` root
- No nested subdirectories within chapter folders

## How It Works

### 1. Integration Point

The validator runs in `ChatService.sendMessage()` after the agent finishes writing:

```typescript
// After agent response is received and saved
const correctedChapters = await this.chapterValidator.validateAndCorrect(bookSlug);
if (correctedChapters.length > 0) {
  console.log('Corrected chapter placement:', correctedChapters);
  onEvent({
    type: 'status',
    message: `Fixed ${correctedChapters.length} chapter file placement issue(s)`,
  });
}
```

### 2. Detection Patterns

The validator detects and corrects these patterns:

#### Files in chapters root
- **Input:** `chapters/draft.md`
- **Output:** `chapters/01-unnamed/draft.md`

#### Files with chapter slug prefix
- **Input:** `chapters/01-the-beginning-draft.md`
- **Output:** `chapters/01-the-beginning/draft.md`

#### Chapter notation variations
- **Input:** `chapters/chapter-5-draft.md` or `chapters/ch-5-notes.md`
- **Output:** `chapters/05-chapter/draft.md` or `chapters/05-chapter/notes.md`

#### Misnamed chapter files
- **Input:** `chapters/01-the-beginning/chapter-1.md`
- **Output:** `chapters/01-the-beginning/draft.md`

#### Automatic slug extraction
- If a file has a number pattern (e.g., `01`, `5`, `99`), it extracts it
- If no number found, creates a default slug like `01-unnamed`

### 3. Conflict Resolution

If a file already exists at the target location:
- The misplaced file is **deleted** (not overwritten)
- The existing file is **preserved**
- A note is logged: `"moved from root, existing file preserved"`

## Architecture

### IChapterValidator Interface

```typescript
export interface IChapterValidator {
  /**
   * Validate and correct chapter file placement in a book.
   * Returns a list of corrected file paths.
   */
  validateAndCorrect(bookSlug: string): Promise<string[]>;
}
```

### ChapterValidator Implementation

**File:** `src/application/ChapterValidator.ts`

**Key Methods:**
- `validateAndCorrect()` — Main entry point (public)
- `moveToCorrectChapter()` — Handles files in chapters root
- `validateChapterDirectory()` — Handles files in chapter subdirectories
- `extractChapterSlug()` — Parses chapter identifiers from filenames
- `normalizeChapterFileName()` — Converts to standard names (draft.md/notes.md)

**Dependencies:**
- Node.js `fs/promises` for file operations
- Node.js `path` for path manipulation
- No external packages required

## Integration

### In ChatService
The ChapterValidator is injected and called after each agent interaction:

```typescript
constructor(
  private settings: ISettingsService,
  private agents: IAgentService,
  private db: IDatabaseService,
  private claude: IClaudeClient,
  private fs: IFileSystemService,
  private usage: UsageService,
  private chapterValidator: IChapterValidator,  // ← injected
) {}
```

### In Composition Root (main/index.ts)
```typescript
const chapterValidator = new ChapterValidator(booksDir);
const chat = new ChatService(
  settings, agents, db, claudeClient, fs, usage, chapterValidator
);
```

## Error Handling

The validator is **fail-safe**:
- If validation fails, the error is logged but doesn't break the workflow
- All async operations are wrapped in try/catch
- The app continues functioning even if chapter validation errors occur
- Errors are logged to the console for diagnostics

## Output & Diagnostics

### Console Logging
```
Corrected chapter placement: [
  'chapters/01-the-beginning/draft.md',
  'chapters/02-the-meeting/notes.md (renamed from chapter-2-notes.md)'
]
```

### UI Notification
The renderer receives a status event:
```
"Fixed 2 chapter file placement issue(s)"
```

## Performance

- **O(n)** where n = number of files/directories in chapters folder
- Runs asynchronously after agent completes
- Non-blocking — UI remains responsive
- Typical execution: < 100ms for typical manuscript

## Testing

To manually test the validator:

1. Create a misplaced file manually:
   ```bash
   echo "Test content" > ~/Library/Application\ Support/novel-engine/books/my-book/chapters/draft.md
   ```

2. Send a message to any agent (Verity, Ghostlight, etc.)

3. Check the console log for correction notice:
   ```
   Corrected chapter placement: ['chapters/01-unnamed/draft.md']
   ```

4. Verify the file was moved:
   ```bash
   ls ~/Library/Application\ Support/novel-engine/books/my-book/chapters/01-unnamed/
   ```

## Future Enhancements

Possible improvements:
- **Smart slug detection** — Use ML to infer chapter names from content
- **Rename suggestions** — Offer alternative names to the author
- **Batch validation** — Run across entire manuscript at once
- **UI dashboard** — Show validation history and corrections
- **Conflict recovery** — Merge content from duplicate chapter files

## Summary

The ChapterValidator ensures Verity's (and any agent's) chapter output always follows the strict specification, maintaining a consistent project structure regardless of how the agent writes files. It's automatic, transparent, and fail-safe.
