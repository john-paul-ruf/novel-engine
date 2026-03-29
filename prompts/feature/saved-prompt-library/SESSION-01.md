# SESSION-01 — Domain Types + Saved Prompt Infrastructure

> **Feature:** saved-prompt-library
> **Layer(s):** Domain, Infrastructure
> **Depends on:** Nothing
> **Estimated effort:** 20 min

---

## Context

This is the first session for the Saved Prompt Library feature. There is no existing code to build on.

The goal: users can bank their own reusable prompts (name + text + optional agent scope) that persist globally in `userData`. This session defines the domain type and interface, then implements the infrastructure service that stores prompts as a JSON file on disk.

No IPC, no renderer, no application service. This session ends with a compilable infra module that passes `npx tsc --noEmit`.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | Modify | Add `SavedPrompt` type |
| `src/domain/interfaces.ts` | Modify | Add `ISavedPromptService` interface |
| `src/infrastructure/saved-prompts/SavedPromptService.ts` | Create | JSON-backed implementation of `ISavedPromptService` |
| `src/infrastructure/saved-prompts/index.ts` | Create | Barrel export |

---

## Implementation

### 1. Add `SavedPrompt` to `src/domain/types.ts`

Read `src/domain/types.ts` first. Append the following block at the very end of the file (after the `FindReplaceApplyResult` type):

```typescript
// === Saved Prompts ===

export type SavedPrompt = {
  id: string;              // nanoid
  name: string;            // short label shown in the dropdown
  prompt: string;          // full text inserted into the chat input on select
  agentName: AgentName | null;  // null = show for all agents; otherwise scoped to one agent
  createdAt: string;       // ISO 8601 date
  updatedAt: string;       // ISO 8601 date
};
```

`AgentName` is already defined earlier in the file — no new import needed.

---

### 2. Add `ISavedPromptService` to `src/domain/interfaces.ts`

Read `src/domain/interfaces.ts` first.

**Step A:** Add `SavedPrompt` to the existing `from './types'` import list at the top of the file.

**Step B:** Append the following interface at the bottom of the file:

```typescript
export interface ISavedPromptService {
  /**
   * Return all saved prompts, ordered by `createdAt` ascending.
   */
  list(): Promise<SavedPrompt[]>;

  /**
   * Create a new saved prompt. Assigns a nanoid and timestamps automatically.
   * Returns the created prompt.
   */
  create(params: {
    name: string;
    prompt: string;
    agentName: AgentName | null;
  }): Promise<SavedPrompt>;

  /**
   * Update an existing prompt's name, text, or agent scope.
   * Bumps `updatedAt`. Throws if the id does not exist.
   * Returns the updated prompt.
   */
  update(
    id: string,
    partial: Partial<Pick<SavedPrompt, 'name' | 'prompt' | 'agentName'>>,
  ): Promise<SavedPrompt>;

  /**
   * Delete a prompt by id. No-op if the id does not exist.
   */
  delete(id: string): Promise<void>;
}
```

Note: `AgentName` is already imported in `interfaces.ts` (used by `IAgentService`). No additional import needed.

---

### 3. Create `src/infrastructure/saved-prompts/SavedPromptService.ts`

The service stores all prompts as a JSON array in `{userData}/saved-prompts.json`. It maintains an in-memory cache that is invalidated on every write, following the same pattern as `SettingsService`.

```typescript
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import type { AgentName, SavedPrompt } from '@domain/types';
import type { ISavedPromptService } from '@domain/interfaces';

export class SavedPromptService implements ISavedPromptService {
  private readonly filePath: string;
  private _cache: SavedPrompt[] | null = null;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'saved-prompts.json');
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async read(): Promise<SavedPrompt[]> {
    if (this._cache !== null) return this._cache;
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      this._cache = JSON.parse(raw) as SavedPrompt[];
      return this._cache;
    } catch {
      // ENOENT or malformed JSON — start with empty list
      this._cache = [];
      return this._cache;
    }
  }

  private async write(prompts: SavedPrompt[]): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(prompts, null, 2), 'utf-8');
    this._cache = prompts;
  }

  // ── ISavedPromptService ─────────────────────────────────────────

  async list(): Promise<SavedPrompt[]> {
    const prompts = await this.read();
    // Return a stable copy, sorted oldest-first
    return [...prompts].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  async create(params: {
    name: string;
    prompt: string;
    agentName: AgentName | null;
  }): Promise<SavedPrompt> {
    const prompts = await this.read();
    const now = new Date().toISOString();
    const entry: SavedPrompt = {
      id: nanoid(),
      name: params.name.trim(),
      prompt: params.prompt,
      agentName: params.agentName,
      createdAt: now,
      updatedAt: now,
    };
    await this.write([...prompts, entry]);
    return entry;
  }

  async update(
    id: string,
    partial: Partial<Pick<SavedPrompt, 'name' | 'prompt' | 'agentName'>>,
  ): Promise<SavedPrompt> {
    const prompts = await this.read();
    const index = prompts.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`SavedPrompt not found: ${id}`);
    }
    const updated: SavedPrompt = {
      ...prompts[index],
      ...(partial.name !== undefined ? { name: partial.name.trim() } : {}),
      ...(partial.prompt !== undefined ? { prompt: partial.prompt } : {}),
      ...(partial.agentName !== undefined ? { agentName: partial.agentName } : {}),
      updatedAt: new Date().toISOString(),
    };
    const next = [...prompts];
    next[index] = updated;
    await this.write(next);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const prompts = await this.read();
    const next = prompts.filter((p) => p.id !== id);
    if (next.length !== prompts.length) {
      await this.write(next);
    }
    // Silently no-op if id not found
  }
}
```

---

### 4. Create `src/infrastructure/saved-prompts/index.ts`

```typescript
export { SavedPromptService } from './SavedPromptService';
```

---

## Architecture Compliance

- [x] Domain files import from nothing
- [x] Infrastructure imports only from domain + external packages (`nanoid`, `node:fs/promises`, `node:path`)
- [x] Application imports only from domain interfaces (not concrete classes) — N/A this session
- [x] IPC handlers are one-liner delegations — N/A this session
- [x] Renderer accesses backend only through `window.novelEngine` — N/A this session
- [x] All new IPC channels are namespaced (`domain:action`) — N/A this session
- [x] All async operations have error handling
- [x] No `any` types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors.
2. `SavedPromptService` satisfies `ISavedPromptService` — TypeScript confirms via the `implements` declaration.
3. New `SavedPrompt` type is exported from `src/domain/types.ts`.
4. New `ISavedPromptService` interface is exported from `src/domain/interfaces.ts`.

---

## State Update

After completing this session, update `prompts/feature/saved-prompt-library/STATE.md`:
- Set SESSION-01 status to `done`
- Set Completed date to today
- Add notes about any decisions or complications
- Update Handoff Notes for SESSION-02
