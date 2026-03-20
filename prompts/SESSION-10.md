# Session 10 — Pipeline Service + Build Service

## Context

Novel Engine Electron app. Sessions 01–09 done. Now I need two small application services: **PipelineService** (detects which phase a book is in) and **BuildService** (runs Pandoc to produce output files).

## Architecture Rule

Both live in `src/application/`. PipelineService imports from `@domain` and depends on `IFileSystemService`. BuildService depends on `IFileSystemService` and needs access to the Pandoc binary path (injected as a string).

---

## Task 1: `src/application/PipelineService.ts`

Implements `IPipelineService`.

### Constructor

```typescript
constructor(private fs: IFileSystemService) {}
```

### `detectPhases(bookSlug: string): Promise<PipelinePhase[]>`

Detect which pipeline phases are complete by checking whether their key output files exist. Use `this.fs.fileExists(bookSlug, path)` for each check.

**Detection logic — check these files in order:**

| Phase | Complete if file exists |
|-------|----------------------|
| `pitch` | `source/scene-outline.md` (Spark creates this) |
| `first-draft` | Any `chapters/*/draft.md` exists (check via `countWordsPerChapter` — if result has length > 0 and total words > 1000) |
| `first-read` | `source/reader-report.md` |
| `first-assessment` | `source/dev-report.md` |
| `revision-plan-1` | `source/project-tasks.md` |
| `revision` | `source/reader-report-v1.md` (the archived first report means revision happened) |
| `second-read` | Check if `reader-report.md` exists AND `reader-report-v1.md` exists (new report + archived old one) |
| `second-assessment` | `source/dev-report-v1.md` (archived first dev report) |
| `copy-edit` | `source/audit-report.md` |
| `revision-plan-2` | `source/revision-prompts.md` AND `source/audit-report.md` (Forge produces prompts from audit) |
| `mechanical-fixes` | This one is hard to detect automatically. Mark complete if `audit-report.md` exists AND book status is `'copy-edit'` or later. |
| `build` | `dist/output.md` |
| `publish` | `source/metadata.md` |

**Algorithm:**
1. Run all checks concurrently using `Promise.all`
2. Find the first phase that is NOT complete — that's the `active` phase
3. All phases before it are `complete`
4. All phases after it are `locked`
5. Map against `PIPELINE_PHASES` from `@domain/constants` to produce the full `PipelinePhase[]`

**Design note:** This assumes a strictly linear pipeline. If phases are completed out of order (e.g., a user manually creates `reader-report.md` before writing any chapters), the algorithm still treats the first incomplete phase as `active` and everything after it as `locked`. This is intentional — the pipeline enforces a sequential workflow.

### `getActivePhase(bookSlug): Promise<PipelinePhase | null>`

Call `detectPhases`, return the one with `status === 'active'`, or null if all complete.

### `getAgentForPhase(phaseId): AgentName | null`

Look up in `PIPELINE_PHASES` constant. Return the agent name or null for the build phase.

---

## Task 2: `src/application/BuildService.ts`

Implements `IBuildService`.

### Constructor

```typescript
constructor(
  private fs: IFileSystemService,
  private pandocPath: string,      // absolute path to pandoc binary
  private booksDir: string,        // absolute path to books/ directory
) {}
```

### `isPandocAvailable(): Promise<boolean>`

Try to run `{pandocPath} --version` using `execa`. Return true if it exits with code 0, false otherwise. Import `execa` directly — this is one of the few infrastructure concerns allowed in an application service because the build step IS a system operation.

### `build(bookSlug, onProgress): Promise<BuildResult>`

**Step by step:**

1. `onProgress('Checking Pandoc...')`
   - Call `isPandocAvailable()`. If false, return a failed `BuildResult`.

2. `onProgress('Loading book metadata...')`
   - Get `BookMeta` via `this.fs.getBookMeta(bookSlug)`

3. `onProgress('Assembling chapters...')`
   - Get chapter word counts via `this.fs.countWordsPerChapter(bookSlug)`
   - For each chapter, read the draft via `this.fs.readFile(bookSlug, \`chapters/${slug}/draft.md\`)`
   - Concatenate into a single markdown string with the title, author, and `---` separators
   - Report each chapter: `onProgress(\`  Added ${slug} (${wordCount} words)\`)`

4. `onProgress('Writing assembled markdown...')`
   - Write the concatenated markdown to `dist/output.md` via `this.fs.writeFile`

5. **Generate each format.** For each of `['docx', 'epub', 'pdf']`:
   - `onProgress(\`Generating ${format.toUpperCase()}...\`)`
   - Build the Pandoc command args
   - Run via `execa`
   - On success: `onProgress(\`${format.toUpperCase()} ✓\`)`
   - On failure: `onProgress(\`${format.toUpperCase()} failed: ${error.message}\`)`, record the error

   **Pandoc args per format:**
   ```
   DOCX: [inputPath, '-o', outputPath, '--from=markdown', '--to=docx', '--metadata=title:...', '--metadata=author:...']
   EPUB: [inputPath, '-o', outputPath, '--from=markdown', '--to=epub3', '--metadata=title:...', '--metadata=author:...']
   PDF:  [inputPath, '-o', outputPath, '--from=markdown', '--to=pdf', '--metadata=title:...', '--metadata=author:...']
   ```

   The input path and output paths are absolute: `{booksDir}/{slug}/dist/output.{ext}`.

6. `onProgress('Build complete!')`

7. Return `BuildResult` with the success status, formats array, and total word count.

**Note:** PDF generation requires a LaTeX engine (e.g., `pdflatex`, `xelatex`, or `tectonic`) to be installed on the system. Pandoc uses LaTeX as its default PDF engine. If no LaTeX engine is available, the PDF step will fail. That's fine — catch the error, report it, and continue. The build succeeds partially (md + docx + epub).

## Task 3: `src/application/UsageService.ts`

A lightweight service that centralizes cost calculation in the application layer.

### Constructor

```typescript
constructor(private db: IDatabaseService) {}
```

### Methods

`recordUsage(params)` - Calculate `estimatedCost` using `MODEL_PRICING` from `@domain/constants`, then delegate to `this.db.recordUsage(...)`.

Cost formula:
```typescript
const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['claude-opus-4-20250514'];
const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
```

`getSummary(bookSlug?)` - Delegates to `this.db.getUsageSummary(bookSlug)`.

`getByConversation(conversationId)` - Delegates to `this.db.getUsageByConversation(conversationId)`.

### Integration with ChatService (Session 09)

Add `UsageService` as a 7th constructor dependency to `ChatService`. Replace inline `calculateCost` + `db.recordUsage` with `usage.recordUsage(...)`.

### Integration with composition root (Session 12)

```typescript
const usage = new UsageService(db);
const chat = new ChatService(settings, agents, db, fs, anthropicClient, contextBuilder, usage);
```

---

## Task 4: `src/application/index.ts`

```typescript
export { ContextBuilder } from './ContextBuilder';
export { ChatService } from './ChatService';
export { PipelineService } from './PipelineService';
export { BuildService } from './BuildService';
export { UsageService } from './UsageService';
```

---

## Verification

- All services compile with `npx tsc --noEmit`
- `PipelineService` implements `IPipelineService`
- `BuildService` implements `IBuildService`
- Pipeline detection runs all checks concurrently
- Build service handles partial failures gracefully (one format failing doesn't block the others)
- `UsageService` compiles with `npx tsc --noEmit`
- Cost calculation is centralized in `UsageService.recordUsage`
- `src/application/index.ts` barrel exports all 5 application services
