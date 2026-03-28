# SESSION-06 — Multi-Agent Source Document Generation

> **Feature:** manuscript-import
> **Layer(s):** Domain, Application, IPC, Renderer
> **Depends on:** SESSION-05
> **Estimated effort:** 30 min

---

## Context

Sessions 01–05 built the import flow: file selection, chapter detection, book creation, and the wizard UI. The success screen in SESSION-04 included a naive "Generate Source Documents" handler that tried to generate all source files in a single Verity chat message. That approach is fragile (too many files in one turn) and missed `motif-ledger.json`.

This session replaces that with a proper multi-agent sequential generation pipeline:

1. **Spark** → `source/pitch.md` — story concept, genre, themes, hook
2. **Verity** → `source/scene-outline.md` + `source/story-bible.md` — structure and canon
3. **Verity** → `source/voice-profile.md` — prose style analysis
4. **Verity** → `source/motif-ledger.json` — motifs, symbols, foreshadowing, flagged phrases

Each step runs as a separate CLI call in sequence, with progress tracked in the import wizard. The wizard gains a new `'generating'` step between success and final completion.

This is a cross-cutting session: it adds a domain type, an application service, an IPC channel, and renderer changes.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | Modify | Add `SourceGenerationEvent` discriminated union |
| `src/domain/interfaces.ts` | Modify | Add `ISourceGenerationService` interface |
| `src/application/SourceGenerationService.ts` | Create | Orchestrates 4 sequential agent calls |
| `src/main/index.ts` | Modify | Instantiate `SourceGenerationService`, pass to handlers |
| `src/main/ipc/handlers.ts` | Modify | Add `import:generateSources` handler with progress broadcast |
| `src/preload/index.ts` | Modify | Add `generateSources` and `onGenerationProgress` to `import` namespace |
| `src/renderer/stores/importStore.ts` | Modify | Add `'generating'` step, generation progress state, `startGeneration` action |
| `src/renderer/components/Import/ImportWizard.tsx` | Modify | Add generating step UI with progress checklist |

---

## Implementation

### 1. Add `SourceGenerationEvent` type to `src/domain/types.ts`

Read `src/domain/types.ts`. Append after the `// === Manuscript Import ===` section:

```typescript
// === Source Document Generation ===

export type SourceGenerationStep = {
  index: number;
  label: string;
  agentName: AgentName;
  status: 'pending' | 'running' | 'done' | 'error';
  error?: string;
};

export type SourceGenerationEvent =
  | { type: 'started'; steps: SourceGenerationStep[] }
  | { type: 'step-started'; index: number }
  | { type: 'step-done'; index: number }
  | { type: 'step-error'; index: number; message: string }
  | { type: 'done' }
  | { type: 'error'; message: string };
```

### 2. Add `ISourceGenerationService` to `src/domain/interfaces.ts`

Read `src/domain/interfaces.ts`. Add `SourceGenerationEvent` and `StreamEvent` (already imported) to the type imports. Append the interface after `IManuscriptImportService`:

```typescript
export interface ISourceGenerationService {
  /**
   * Generate source documents for an imported book by running sequential
   * agent calls: Spark for pitch, Verity for outline/bible/voice/motif.
   *
   * Emits SourceGenerationEvent progress updates and StreamEvent for
   * individual agent streams. Resolves when all steps are complete
   * (or rejects on unrecoverable error).
   */
  generate(params: {
    bookSlug: string;
    onProgress: (event: SourceGenerationEvent) => void;
    onStreamEvent: (event: StreamEvent) => void;
  }): Promise<void>;
}
```

### 3. Create `src/application/SourceGenerationService.ts`

This service orchestrates 4 sequential agent calls. It follows the same pattern as `RevisionQueueService`: it depends on injected interfaces and uses `IProviderRegistry.sendMessage()` for each CLI call.

```typescript
import { nanoid } from 'nanoid';
import type {
  ISourceGenerationService,
  IAgentService,
  IDatabaseService,
  IFileSystemService,
  IProviderRegistry,
  ISettingsService,
} from '@domain/interfaces';
import type {
  SourceGenerationEvent,
  SourceGenerationStep,
  StreamEvent,
  AgentName,
} from '@domain/types';
import { AGENT_REGISTRY } from '@domain/constants';
import { ContextBuilder } from './ContextBuilder';

type GenerationStep = {
  label: string;
  agentName: AgentName;
  prompt: string;
};

const GENERATION_STEPS: GenerationStep[] = [
  {
    label: 'Generating pitch',
    agentName: 'Spark',
    prompt: 'This book was imported from an existing manuscript. Read every chapter in the chapters/ directory from beginning to end. Then produce a complete pitch card and write it to source/pitch.md. Include: title, genre, logline, themes, central conflict, protagonist, antagonist/antagonistic force, stakes, and hook.',
  },
  {
    label: 'Generating outline & story bible',
    agentName: 'Verity',
    prompt: 'This book was imported from an existing manuscript. Read every chapter in the chapters/ directory from beginning to end. Then generate two source documents:\n\n1. **source/scene-outline.md** — A chapter-by-chapter structural plan. For each chapter: number, title, scene beats, POV character, timeline placement, and dramatic purpose.\n\n2. **source/story-bible.md** — Characters (name, role, arc, wants, needs, flaws, key relationships), world rules, locations (with descriptions), and a timeline of major events.\n\nBe thorough — these documents will guide the editorial pipeline.',
  },
  {
    label: 'Generating voice profile',
    agentName: 'Verity',
    prompt: 'This book was imported from an existing manuscript. Read every chapter in the chapters/ directory, paying close attention to prose style. Then generate source/voice-profile.md covering:\n\n- Sentence rhythm patterns (length variation, fragment use, compound structures)\n- Vocabulary tendencies (register, recurring words, domain-specific language)\n- POV approach (distance, interiority, tense)\n- Dialogue voice (attribution patterns, dialect handling, subtext style)\n- Tonal range (humor, gravity, lyricism, restraint)\n- Narrative habits (scene entry/exit patterns, transition style, exposition technique)\n- Distinctive signatures (any unique stylistic fingerprints)\n\nThis profile will be used to maintain voice consistency during revisions.',
  },
  {
    label: 'Generating motif ledger',
    agentName: 'Verity',
    prompt: 'This book was imported from an existing manuscript. Read every chapter in the chapters/ directory. Then create source/motif-ledger.json with the following JSON structure:\n\n```json\n{\n  "systems": [...],\n  "entries": [...],\n  "structuralDevices": [...],\n  "foreshadows": [...],\n  "minorCharacters": [...],\n  "flaggedPhrases": [...],\n  "auditLog": [...]\n}\n```\n\nCatalog all recurring motifs and symbols (with character associations, first appearances, and occurrences by chapter). Document structural devices (framing, mirroring, callbacks). Track foreshadowing threads (planted vs paid-off vs abandoned). Note minor character motifs. Flag any overused phrases, crutch words, or anti-patterns. Each entry needs a unique nanoid-style ID string.\n\nBe comprehensive — this ledger drives the motif audit system.',
  },
];

export class SourceGenerationService implements ISourceGenerationService {
  constructor(
    private settings: ISettingsService,
    private agents: IAgentService,
    private db: IDatabaseService,
    private fs: IFileSystemService,
    private providers: IProviderRegistry,
  ) {}

  async generate(params: {
    bookSlug: string;
    onProgress: (event: SourceGenerationEvent) => void;
    onStreamEvent: (event: StreamEvent) => void;
  }): Promise<void> {
    const { bookSlug, onProgress, onStreamEvent } = params;

    // Build initial step list
    const steps: SourceGenerationStep[] = GENERATION_STEPS.map((s, i) => ({
      index: i,
      label: s.label,
      agentName: s.agentName,
      status: 'pending' as const,
    }));

    onProgress({ type: 'started', steps });

    const appSettings = await this.settings.load();
    const contextBuilder = new ContextBuilder();

    for (let i = 0; i < GENERATION_STEPS.length; i++) {
      const step = GENERATION_STEPS[i];

      onProgress({ type: 'step-started', index: i });

      try {
        // Load the agent
        const agent = await this.agents.load(step.agentName);

        // Create a conversation for this step
        const conversation = this.db.createConversation({
          id: nanoid(),
          bookSlug,
          agentName: step.agentName,
          pipelinePhase: null,
          purpose: 'pipeline',
          title: step.label,
        });

        // Save the user message
        this.db.saveMessage({
          conversationId: conversation.id,
          role: 'user',
          content: step.prompt,
          thinking: '',
        });

        // Build context (manifest + system prompt)
        const manifest = await this.fs.getProjectManifest(bookSlug);
        const messages = this.db.getMessages(conversation.id);
        const context = contextBuilder.build({
          agent,
          manifest,
          messages,
          settings: appSettings,
        });

        // Accumulate the response
        let responseText = '';
        let thinkingText = '';
        const sessionId = nanoid();

        await this.providers.sendMessage({
          model: appSettings.model,
          systemPrompt: context.systemPrompt,
          messages: context.conversationMessages,
          maxTokens: appSettings.maxTokens,
          thinkingBudget: appSettings.enableThinking
            ? (AGENT_REGISTRY[step.agentName]?.thinkingBudget ?? 4000)
            : undefined,
          maxTurns: AGENT_REGISTRY[step.agentName]?.maxTurns ?? 10,
          bookSlug,
          sessionId,
          conversationId: conversation.id,
          onEvent: (event) => {
            if (event.type === 'textDelta') responseText += event.text;
            if (event.type === 'thinkingDelta') thinkingText += event.text;
            onStreamEvent(event);
          },
        });

        // Save the assistant response
        if (responseText.trim()) {
          this.db.saveMessage({
            conversationId: conversation.id,
            role: 'assistant',
            content: responseText,
            thinking: thinkingText,
          });
        }

        onProgress({ type: 'step-done', index: i });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onProgress({ type: 'step-error', index: i, message });
        // Continue to next step — partial generation is better than nothing
      }
    }

    onProgress({ type: 'done' });
  }
}
```

**Key design decisions:**
- Each step creates its own conversation so the user can review each agent's work independently.
- Errors on individual steps don't abort the entire generation — partial results are better than nothing.
- Uses `IProviderRegistry.sendMessage()` directly (same pattern as `RevisionQueueService`), not `ChatService`, to avoid circular complexity.
- `ContextBuilder.build()` provides the manifest-aware system prompt.

### 4. Wire in composition root

Read `src/main/index.ts`. Add:

```typescript
import { SourceGenerationService } from '@app/SourceGenerationService';
```

Instantiate after the existing services (near `manuscriptImport`):

```typescript
const sourceGeneration = new SourceGenerationService(settings, agents, db, fs, providerRegistry);
```

Add `sourceGeneration` to the `registerIpcHandlers` call.

### 5. Add IPC handler

Read `src/main/ipc/handlers.ts`. Add `ISourceGenerationService` to interface imports, `SourceGenerationEvent` to type imports. Add `sourceGeneration` to the services parameter.

Add the handler in the `// === Manuscript Import ===` section:

```typescript
ipcMain.handle('import:generateSources', async (event, bookSlug: string) => {
  const broadcastGenProgress = (genEvent: SourceGenerationEvent) => {
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.send('import:generationProgress', genEvent);
      } catch { /* window closing */ }
    }
  };

  const broadcastStreamEvent = (streamEvent: StreamEvent) => {
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.send('chat:streamEvent', {
          ...streamEvent,
          callId: `source-gen:${bookSlug}`,
          conversationId: `source-gen:${bookSlug}`,
          source: 'chat',
        });
      } catch { /* window closing */ }
    }
  };

  await services.sourceGeneration.generate({
    bookSlug,
    onProgress: broadcastGenProgress,
    onStreamEvent: broadcastStreamEvent,
  });
});
```

### 6. Update preload bridge

Read `src/preload/index.ts`. Add `SourceGenerationEvent` to the type imports.

Add to the existing `import` namespace:

```typescript
generateSources: (bookSlug: string): Promise<void> =>
  ipcRenderer.invoke('import:generateSources', bookSlug),
onGenerationProgress: (callback: (event: SourceGenerationEvent) => void) => {
  const handler = (_: Electron.IpcRendererEvent, event: SourceGenerationEvent) => callback(event);
  ipcRenderer.on('import:generationProgress', handler);
  return () => ipcRenderer.removeListener('import:generationProgress', handler);
},
```

### 7. Update `importStore.ts`

Read `src/renderer/stores/importStore.ts`.

**Add `'generating'` to the `ImportStep` type:**

```typescript
type ImportStep = 'idle' | 'loading' | 'preview' | 'importing' | 'success' | 'generating' | 'generated' | 'error';
```

**Add state fields:**

```typescript
generationSteps: SourceGenerationStep[];
generationCleanup: (() => void) | null;
```

**Add `startGeneration` action:**

```typescript
startGeneration: async () => {
  const { result } = get();
  if (!result) return;

  set({ step: 'generating', generationSteps: [] });

  const cleanup = window.novelEngine.import.onGenerationProgress((event) => {
    if (event.type === 'started') {
      set({ generationSteps: event.steps });
    } else if (event.type === 'step-started') {
      set((s) => ({
        generationSteps: s.generationSteps.map((step) =>
          step.index === event.index ? { ...step, status: 'running' } : step
        ),
      }));
    } else if (event.type === 'step-done') {
      set((s) => ({
        generationSteps: s.generationSteps.map((step) =>
          step.index === event.index ? { ...step, status: 'done' } : step
        ),
      }));
    } else if (event.type === 'step-error') {
      set((s) => ({
        generationSteps: s.generationSteps.map((step) =>
          step.index === event.index ? { ...step, status: 'error', error: event.message } : step
        ),
      }));
    } else if (event.type === 'done') {
      set({ step: 'generated' });
    } else if (event.type === 'error') {
      set({ step: 'error', error: event.message });
    }
  });

  set({ generationCleanup: cleanup });

  try {
    await window.novelEngine.import.generateSources(result.bookSlug);
  } catch (err) {
    set({ step: 'error', error: err instanceof Error ? err.message : String(err) });
  }
},
```

**Update `reset` to clean up the listener:**

```typescript
reset: () => {
  const { generationCleanup } = get();
  if (generationCleanup) generationCleanup();
  set({ step: 'idle', preview: null, result: null, error: '', title: '', author: '', chapters: [], generationSteps: [], generationCleanup: null });
},
```

### 8. Update `ImportWizard.tsx`

Read `src/renderer/components/Import/ImportWizard.tsx`.

**Replace the old `handleGenerateSources` function.** Remove the single-prompt Verity approach from SESSION-04. Replace with:

```typescript
const handleGenerateSources = () => {
  startGeneration();
};
```

Where `startGeneration` is destructured from `useImportStore`.

**Add the `'generating'` step rendering** (between `'success'` and `'error'`):

```tsx
{step === 'generating' && (
  <div className="p-6">
    <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
      Generating Source Documents
    </h3>
    <div className="space-y-3">
      {generationSteps.map((gs) => (
        <div key={gs.index} className="flex items-center gap-3">
          <div className="w-5 shrink-0 text-center">
            {gs.status === 'done' && <span className="text-green-500">✓</span>}
            {gs.status === 'running' && (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            )}
            {gs.status === 'pending' && <span className="text-zinc-400">○</span>}
            {gs.status === 'error' && <span className="text-red-500">✗</span>}
          </div>
          <div className="flex-1 min-w-0">
            <span className={`text-sm ${gs.status === 'running' ? 'font-medium text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'}`}>
              {gs.label}
            </span>
            <span className="ml-2 text-xs text-zinc-400">({gs.agentName})</span>
            {gs.error && <p className="mt-0.5 text-xs text-red-500">{gs.error}</p>}
          </div>
        </div>
      ))}
    </div>
    <p className="mt-4 text-xs text-zinc-500">
      Each step reads the full manuscript. This may take several minutes.
    </p>
  </div>
)}
```

**Add the `'generated'` step rendering** (all steps complete):

```tsx
{step === 'generated' && (
  <div className="p-6 text-center">
    <div className="mb-3 text-3xl text-green-500">✓</div>
    <h3 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
      Source Documents Generated
    </h3>
    <p className="mb-4 text-xs text-zinc-500">
      {generationSteps.filter((s) => s.status === 'done').length} of {generationSteps.length} steps completed successfully.
    </p>
    {generationSteps.some((s) => s.status === 'error') && (
      <p className="mb-4 text-xs text-amber-500">
        Some steps had errors. You can generate missing documents manually using the agents.
      </p>
    )}
  </div>
)}
```

Footer for `'generated'` step: single "Open Book" button that calls `handleOpenBook`.

No footer buttons for `'generating'` step (user waits for completion).

---

## Architecture Compliance

- [x] Domain files import from nothing (`types.ts` only adds types, `interfaces.ts` imports from `./types`)
- [x] Application imports only from domain interfaces (not concrete classes)
- [x] `SourceGenerationService` depends on interfaces: `ISettingsService`, `IAgentService`, `IDatabaseService`, `IFileSystemService`, `IProviderRegistry`
- [x] IPC handler is a thin adapter — broadcasts progress events, delegates to service
- [x] Renderer accesses backend only through `window.novelEngine`
- [x] IPC listener cleanup in store's `reset()` action
- [x] All new IPC channels namespaced (`import:generateSources`, `import:generationProgress`)
- [x] All async operations have error handling — step errors don't abort the sequence
- [x] No `any` types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `SourceGenerationService` implements `ISourceGenerationService`
3. 4 sequential agent calls execute: Spark (pitch), Verity (outline+bible), Verity (voice profile), Verity (motif ledger)
4. Each step creates its own conversation in the database
5. Step errors are caught and reported without aborting remaining steps
6. Import wizard shows real-time progress: pending → running → done/error for each step
7. `'generated'` step shows completion summary with error count
8. IPC listener is cleaned up when the wizard is dismissed
9. Stream events are broadcast to the renderer (visible in CLI Activity Monitor)

---

## State Update

After completing this session, update `prompts/feature/manuscript-import/STATE.md`:
- Set SESSION-06 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes: "Feature complete. All 6 sessions done."
