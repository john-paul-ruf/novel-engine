# Session 19 — Agent Output Persistence (Save to Files)

## Context

Novel Engine Electron app. Sessions 01–18 built the complete app. However, there is a critical missing piece: **when an agent produces output (a chapter draft, a reader report, a dev report, etc.), that output only lives as a chat `Message` in the database. It is never written to the filesystem as a `.md` file.** This means the pipeline can never advance — phase detection checks for files that are never created.

This session adds a "Save to File" mechanism that bridges agent chat responses to the filesystem.

---

## Architecture

This is a **user-driven** save, not automatic. The user reads the agent's response, decides it's good, and clicks "Save to File" on the message. This matches the original novel engine workflow where the user reviews and curates agent output.

---

## Task 1: File Persistence Rules

Define which agent + phase combinations produce which files. Add this to `src/domain/constants.ts`:

```typescript
// A single save target for an agent's output.
type OutputTarget = {
  targetPath: string;                       // relative to book root
  description: string;                      // shown as the save button label
  isChapter?: boolean;                      // if true, prompt for chapter slug
};

// Maps pipeline phase to one or more target files where agent output can be saved.
// When a phase has multiple targets, the UI shows one save button per target so the
// user can save different assistant messages to different files.
// Example: Verity's scaffold phase produces both a scene outline and a story bible —
// the user clicks "Save as Scene Outline" on one message and "Save as Story Bible" on another.
const AGENT_OUTPUT_TARGETS: Partial<Record<PipelinePhaseId, OutputTarget[]>> = {
  'pitch':              [{ targetPath: 'source/pitch.md',            description: 'Save as Pitch' }],
  'scaffold':           [
                          { targetPath: 'source/scene-outline.md',   description: 'Save as Scene Outline' },
                          { targetPath: 'source/story-bible.md',     description: 'Save as Story Bible' },
                        ],
  'first-draft':        [{ targetPath: 'chapters/{slug}/draft.md',   description: 'Save as Chapter Draft', isChapter: true }],
  'first-read':         [{ targetPath: 'source/reader-report.md',    description: 'Save as Reader Report' }],
  'first-assessment':   [{ targetPath: 'source/dev-report.md',       description: 'Save as Dev Report' }],
  'revision-plan-1':    [{ targetPath: 'source/project-tasks.md',    description: 'Save as Project Tasks' }],
  'revision':           [{ targetPath: 'chapters/{slug}/draft.md',   description: 'Save as Revised Chapter', isChapter: true }],
  'second-read':        [{ targetPath: 'source/reader-report.md',    description: 'Save as Reader Report (v2)' }],
  'second-assessment':  [{ targetPath: 'source/dev-report.md',       description: 'Save as Dev Report (v2)' }],
  'copy-edit':          [{ targetPath: 'source/audit-report.md',     description: 'Save as Audit Report' }],
  'revision-plan-2':    [{ targetPath: 'source/revision-prompts.md', description: 'Save as Revision Prompts' }],
  'mechanical-fixes':   [{ targetPath: 'chapters/{slug}/draft.md',   description: 'Save as Fixed Chapter', isChapter: true }],
  'publish':            [{ targetPath: 'source/metadata.md',         description: 'Save as Metadata' }],
};
```

Export the `OutputTarget` type and the `AGENT_OUTPUT_TARGETS` constant.

---

## Task 2: FilePersistenceService

Create `src/application/FilePersistenceService.ts`:

```typescript
class FilePersistenceService {
  constructor(private fs: IFileSystemService) {}

  async saveAgentOutput(params: {
    bookSlug: string;
    pipelinePhase: PipelinePhaseId;
    targetPath: string;            // the specific target path selected by the user
    content: string;
    chapterSlug?: string;
  }): Promise<{ savedPath: string }>
}
```

### Version Archiving Logic

When saving a file that already exists AND the phase implies a new version, archive the old file first:

- Before writing `source/reader-report.md` during `second-read`: rename existing to `source/reader-report-v1.md`
- Before writing `source/dev-report.md` during `second-assessment`: rename existing to `source/dev-report-v1.md`

### Steps

1. Validate that `params.targetPath` is a known target for the given phase by looking it up in `AGENT_OUTPUT_TARGETS`. Throw a descriptive error if the target path is not found in the phase's targets array.
2. If the target has `isChapter: true`, replace `{slug}` in `targetPath` with `params.chapterSlug`. Throw if `chapterSlug` is not provided. Create the chapter directory if it doesn't exist.
3. If archiving is needed (`second-read` or `second-assessment`), check if the target file exists and rename it with a `-v1` suffix before writing.
4. Write the content via `this.fs.writeFile(bookSlug, resolvedPath, content)`
5. Return `{ savedPath: resolvedPath }`

### Imports

Import from `@domain` only (types, interfaces, and `AGENT_OUTPUT_TARGETS` constant). This is an application service — no infrastructure imports.

---

## Task 3: IPC Channel

Add to `src/main/ipc/handlers.ts`:

```typescript
ipcMain.handle('chat:saveToFile', async (_, params: {
  bookSlug: string;
  pipelinePhase: string;
  targetPath: string;
  content: string;
  chapterSlug?: string;
}) => {
  return services.filePersistence.saveAgentOutput(params);
});
```

Add `filePersistence: FilePersistenceService` to the services object in `registerIpcHandlers`.

Update `src/preload/index.ts` — add to the `chat` section:

```typescript
saveToFile: (params: {
  bookSlug: string;
  pipelinePhase: string;
  targetPath: string;
  content: string;
  chapterSlug?: string;
}): Promise<{ savedPath: string }> =>
  ipcRenderer.invoke('chat:saveToFile', params),
```

---

## Task 4: "Save to File" Buttons on Assistant Messages

Update `src/renderer/components/Chat/MessageBubble.tsx`:

For **assistant messages** in a conversation that has a non-null `pipelinePhase`:

- Look up the targets array from `AGENT_OUTPUT_TARGETS[pipelinePhase]` — import the constant using `import type` for `OutputTarget` and a regular import for `AGENT_OUTPUT_TARGETS` from `@domain/constants`. (This is an exception to the "renderer imports no domain values" rule — `AGENT_OUTPUT_TARGETS` is a pure constant with no side effects, and routing it through IPC would add unnecessary complexity for static config data.)
- Render **one button per target** below the message content. Each button uses the target's `description` as its label (e.g., "Save as Pitch", "Save as Scene Outline").
- Button styling: right-aligned row, `text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded px-3 py-1`, with `gap-2` between buttons when there are multiple targets.
- If the target has `isChapter: true`, clicking shows a small inline input for the chapter slug (e.g., `01-the-beginning`) before saving.
- On click: call `window.novelEngine.chat.saveToFile({ bookSlug, pipelinePhase, targetPath: target.targetPath, content: message.content, chapterSlug })`
- On success: show a green "Saved to {path}" confirmation below the button, disable **that specific button** (change to "Saved ✓"). Other target buttons for the same message remain active — the user may want to save the same content to multiple targets.
- On error: show a red error message below the button
- Track save state per message per target: use local component state `savedPaths: Record<string, Record<string, string>>` keyed by `messageId` then `targetPath`

**Data access:** Read `chatStore.activeConversation.pipelinePhase` and `bookStore.activeSlug` to determine whether to show the buttons and what params to send.

---

## Task 5: Composition Root Update

In `src/main/index.ts`, add:

```typescript
import { FilePersistenceService } from '@app/FilePersistenceService';

// In initializeApp():
const filePersistence = new FilePersistenceService(fs);

// Add to registerIpcHandlers services object:
registerIpcHandlers(
  { settings, agents, db, fs, chat, pipeline, build, usage, filePersistence },
  { userDataPath, booksDir }
);
```

Update the `registerIpcHandlers` function signature in `src/main/ipc/handlers.ts` to include `filePersistence`.

Update `src/application/index.ts` to export `FilePersistenceService`.

---

## Task 6: Pipeline Refresh After Save

After a successful save, the pipeline state may have changed (a new phase might now be complete). The "Save to File" success handler in `MessageBubble` should:

1. Call `pipelineStore.loadPipeline(activeSlug)` to refresh the pipeline tracker in the sidebar
2. The file tree will refresh on next book switch or manual refresh

---

## Verification

- After chatting with Spark, the user sees one save button: "Save as Pitch"
- Clicking "Save as Pitch" writes `source/pitch.md` — this advances the pipeline from `pitch` to `scaffold`
- After chatting with Verity in the scaffold phase, the user sees two save buttons: "Save as Scene Outline" and "Save as Story Bible"
- Clicking "Save as Scene Outline" writes `source/scene-outline.md` — this advances the pipeline from `scaffold` to `first-draft`
- The story bible is a secondary output — the pipeline gates on the scene outline
- After chatting with Verity and getting a chapter, clicking "Save to File" prompts for a chapter slug and writes `chapters/{slug}/draft.md`
- After a `first-read` save, the reader report appears in the file tree
- The `second-read` phase correctly archives the old reader report to `reader-report-v1.md` before saving the new one
- The file tree shows newly created files after refresh
- The button shows "Saved ✓" after successful save and is disabled to prevent double-saves
- `npx tsc --noEmit` passes with all new files
