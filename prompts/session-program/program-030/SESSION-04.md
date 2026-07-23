# SESSION-04 — AutoTurnResumer class + composition-root wiring

> **Program:** Novel Engine
> **Feature:** auto-resume-max-turns
> **Modules:** M08 (application), M09 (main/ipc), M15 (providers)
> **Depends on:** SESSION-01, SESSION-02, SESSION-03
> **Estimated effort:** 30 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M01 | domain | `src/domain/interfaces.ts` (IProviderRegistry), `src/domain/types.ts` (StreamEvent) | Interface to implement; types for event handling |
| M15 | providers | `src/infrastructure/providers/ProviderRegistry.ts` | Class being wrapped — understand its `sendMessage`, `abortStream`, etc. |
| M08 | application | `src/application/index.ts` | Barrel export — add AutoTurnResumer |
| M09 | main/ipc | `src/main/index.ts` or `src/main/bootstrap.ts` | Composition root — wrap ProviderRegistry in AutoTurnResumer |

## Context

All 18+ application services call `this.providers.sendMessage(...)` where
`this.providers` is typed as `IProviderRegistry`. The composition root
(`src/main/index.ts` or `src/main/bootstrap.ts`) creates a `ProviderRegistry`
instance and passes it to each service constructor.

We add a new `AutoTurnResumer` class that implements `IProviderRegistry` and
wraps the real `ProviderRegistry`. It intercepts the `sendMessage` call:

1. Calls the real registry's `sendMessage` with a wrapped `onEvent`
2. The wrapped `onEvent` forwards all non-terminal events normally
3. On `done` with `isMaxTurns: true` or `error` with `isMaxTurns: true`:
   - Suppresses the terminal event (does not forward it)
   - Captures accumulated text from the stream
   - Re-spawns with: `messages` + partial assistant text + "continue" instruction,
     and `maxTurns` bumped by `AUTO_RESUME_EXTRA_TURNS` (10)
   - Emits a `maxTurnsResume` event so the UI knows a resume happened
4. On normal `done` (no `isMaxTurns`) or normal `error` (no `isMaxTurns`):
   - Forwards the terminal event as-is
   - Returns normally

No cap on resume attempts — the loop continues until the model finishes.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/application/AutoTurnResumer.ts` | **Create** | New class implementing `IProviderRegistry` |
| `src/application/AutoTurnResumer.test.ts` | **Create** | Co-located tests |
| `src/application/index.ts` | Modify | Export `AutoTurnResumer` |
| `src/main/index.ts` or `src/main/bootstrap.ts` | Modify | Wrap `ProviderRegistry` in `AutoTurnResumer` |

## Implementation

### 1. Read the `IProviderRegistry` interface

Read `src/domain/interfaces.ts`. Find `IProviderRegistry` — note every method
signature. `AutoTurnResumer` must implement all of them, delegating to the
wrapped instance for everything except `sendMessage`.

Key methods to delegate:
- `registerProvider(provider, config)` → `this.inner.registerProvider(...)`
- `removeProvider(providerId)` → `this.inner.removeProvider(...)`
- `getProvider(providerId)` → `this.inner.getProvider(...)`
- `getDefaultProvider()` → `this.inner.getDefaultProvider()`
- `getProviderForModel(modelId)` → `this.inner.getProviderForModel(...)`
- `resolveModelSelection(requestedModel, preferredProviderId?)` → `this.inner.resolveModelSelection(...)`
- `listProviders()` → `this.inner.listProviders()`
- `listAllModels()` → `this.inner.listAllModels()`
- `checkProviderStatus(providerId)` → `this.inner.checkProviderStatus(...)`
- `getProviderConfig(providerId)` → `this.inner.getProviderConfig(...)`
- `updateProviderConfig(providerId, partial)` → `this.inner.updateProviderConfig(...)`
- `setDefaultProvider(providerId)` → `this.inner.setDefaultProvider(...)`
- `abortStream(conversationId)` → `this.inner.abortStream(...)`
- `hasActiveProcesses()` → `this.inner.hasActiveProcesses()`
- `hasActiveProcessesForBook(bookSlug)` → `this.inner.hasActiveProcessesForBook(...)`
- `sendMessage(params)` → **intercepted** (custom logic below)

### 2. Create `src/application/AutoTurnResumer.ts`

```typescript
import { nanoid } from 'nanoid';
import type {
  IModelProvider,
  IProviderRegistry,
  ISettingsService,
} from '@domain/interfaces';
import type {
  FileTouchMap,
  MessageRole,
  ModelInfo,
  ProviderConfig,
  ProviderId,
  ProviderStatus,
  ResolvedModelSelection,
  StreamEvent,
} from '@domain/types';

/** Extra turns added to the budget on each resume attempt. */
const AUTO_RESUME_EXTRA_TURNS = 10;

/** Instruction appended on resume so the model picks up where it left off. */
const RESUME_INSTRUCTION = 'Continue where you left off. You had more work to do.';

/**
 * AutoTurnResumer — transparent wrapper around IProviderRegistry that
 * auto-resumes CLI calls when the max-turns limit is reached.
 *
 * When a provider emits `done` or `error` with `isMaxTurns: true`, this
 * wrapper suppresses the terminal event, captures the partial assistant
 * text, and re-spawns the call with:
 *   - The original messages + the partial assistant output + a "continue" instruction
 *   - A higher turn budget (original + AUTO_RESUME_EXTRA_TURNS per attempt)
 *   - A fresh sessionId (for DB orphan-recovery tracking)
 *
 * No cap on resume attempts — keeps going until the task finishes naturally.
 *
 * Token usage and file touches are accumulated across all attempts and emitted
 * in a single merged `done` event when the task finally completes.
 */
export class AutoTurnResumer implements IProviderRegistry {
  constructor(
    private inner: IProviderRegistry,
  ) {}

  // ── Intercepted ──────────────────────────────────────────────

  async sendMessage(params: {
    model: string;
    systemPrompt: string;
    messages: { role: MessageRole; content: string }[];
    maxTokens: number;
    thinkingBudget?: number;
    maxTurns?: number;
    bookSlug?: string;
    workingDir?: string;
    sessionId?: string;
    conversationId?: string;
    onEvent: (event: StreamEvent) => void;
  }): Promise<void> {
    const baseMaxTurns = params.maxTurns ?? 30;
    let currentMessages = [...params.messages];
    let attempt = 0;

    // Accumulators across all resume attempts
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalThinkingTokens = 0;
    let allFilesTouched: FileTouchMap = {};

    // Track whether the first callStart has been forwarded
    let callStartForwarded = false;

    while (true) {
      attempt++;
      const currentMaxTurns = baseMaxTurns + (attempt - 1) * AUTO_RESUME_EXTRA_TURNS;
      const resumeSessionId = nanoid();

      let maxTurnsExhausted = false;
      let partialText = '';
      let partialThinking = '';
      let terminalEvent: StreamEvent | null = null;

      const wrappedOnEvent = (event: StreamEvent): void => {
        // Accumulate output text across this attempt
        if (event.type === 'textDelta') {
          partialText += event.text;
        } else if (event.type === 'thinkingDelta') {
          partialThinking += event.text;
        }

        // Track terminal events without forwarding
        if (event.type === 'done') {
          terminalEvent = event;
          if (event.isMaxTurns) maxTurnsExhausted = true;
          // Accumulate token usage
          totalInputTokens += event.inputTokens;
          totalOutputTokens += event.outputTokens;
          totalThinkingTokens += event.thinkingTokens;
          // Merge file touches
          allFilesTouched = { ...allFilesTouched, ...event.filesTouched };
          return; // suppress
        }

        if (event.type === 'error') {
          terminalEvent = event;
          if (event.isMaxTurns) maxTurnsExhausted = true;
          return; // suppress
        }

        // Forward callStart only from the first attempt
        if (event.type === 'callStart') {
          if (callStartForwarded) return;
          callStartForwarded = true;
        }

        // Forward all other non-terminal events
        params.onEvent(event);
      };

      try {
        await this.inner.sendMessage({
          ...params,
          messages: currentMessages,
          maxTurns: currentMaxTurns,
          sessionId: resumeSessionId,
          onEvent: wrappedOnEvent,
        });
      } catch (err) {
        // If maxTurns was exhausted, the provider rejected the promise
        // (Claude CLI pattern). Swallow and continue the loop.
        if (!maxTurnsExhausted) {
          // Genuine error — re-throw after any cleanup
          throw err;
        }
        // Max-turns: continue to resume logic below
      }

      if (!maxTurnsExhausted) {
        // Task completed normally — forward the terminal event
        if (terminalEvent) {
          if (terminalEvent.type === 'done') {
            // Emit a merged done with accumulated totals
            params.onEvent({
              type: 'done',
              inputTokens: totalInputTokens || (terminalEvent.type === 'done' ? terminalEvent.inputTokens : 0),
              outputTokens: totalOutputTokens || (terminalEvent.type === 'done' ? terminalEvent.outputTokens : 0),
              thinkingTokens: totalThinkingTokens || (terminalEvent.type === 'done' ? terminalEvent.thinkingTokens : 0),
              filesTouched: Object.keys(allFilesTouched).length > 0
                ? allFilesTouched
                : (terminalEvent.type === 'done' ? terminalEvent.filesTouched : {}),
            });
          } else {
            // Forward error as-is
            params.onEvent(terminalEvent);
          }
        }
        return;
      }

      // ── Max turns exhausted — prepare resume ──────────────────
      console.log(
        `[AutoTurnResumer] Max turns exhausted (attempt ${attempt}), ` +
        `re-spawning with ${currentMaxTurns + AUTO_RESUME_EXTRA_TURNS} turns, ` +
        `partialText=${partialText.length} chars`,
      );

      // Append partial assistant output + continue instruction
      if (partialText.trim()) {
        currentMessages = [
          ...currentMessages,
          { role: 'assistant' as MessageRole, content: partialText },
          { role: 'user' as MessageRole, content: RESUME_INSTRUCTION },
        ];
      } else {
        // No text was emitted — just add the continue instruction
        currentMessages = [
          ...currentMessages,
          { role: 'user' as MessageRole, content: RESUME_INSTRUCTION },
        ];
      }

      // Notify UI
      const nextMaxTurns = currentMaxTurns + AUTO_RESUME_EXTRA_TURNS;
      params.onEvent({ type: 'maxTurnsResume', attempt, newMaxTurns: nextMaxTurns });
      params.onEvent({
        type: 'warning',
        message: `Max turns reached — auto-resuming (attempt ${attempt}, ${nextMaxTurns} turns)...`,
      });
    }
  }

  // ── Pass-through delegation for all other IProviderRegistry methods ──

  registerProvider(provider: IModelProvider, config: ProviderConfig): void {
    this.inner.registerProvider(provider, config);
  }

  removeProvider(providerId: ProviderId): void {
    this.inner.removeProvider(providerId);
  }

  getProvider(providerId: ProviderId): IModelProvider | null {
    return this.inner.getProvider(providerId);
  }

  getDefaultProvider(): IModelProvider {
    return this.inner.getDefaultProvider();
  }

  getProviderForModel(modelId: string): IModelProvider | null {
    return this.inner.getProviderForModel(modelId);
  }

  resolveModelSelection(requestedModel: string, preferredProviderId?: ProviderId): ResolvedModelSelection {
    return this.inner.resolveModelSelection(requestedModel, preferredProviderId);
  }

  listProviders(): ProviderConfig[] {
    return this.inner.listProviders();
  }

  listAllModels(): ModelInfo[] {
    return this.inner.listAllModels();
  }

  async checkProviderStatus(providerId: ProviderId): Promise<ProviderStatus> {
    return this.inner.checkProviderStatus(providerId);
  }

  getProviderConfig(providerId: ProviderId): ProviderConfig | null {
    return this.inner.getProviderConfig(providerId);
  }

  updateProviderConfig(providerId: ProviderId, partial: Partial<ProviderConfig>): void {
    this.inner.updateProviderConfig(providerId, partial);
  }

  setDefaultProvider(providerId: ProviderId): void {
    this.inner.setDefaultProvider(providerId);
  }

  abortStream(conversationId: string): void {
    this.inner.abortStream(conversationId);
  }

  hasActiveProcesses(): boolean {
    return this.inner.hasActiveProcesses();
  }

  hasActiveProcessesForBook(bookSlug: string): boolean {
    return this.inner.hasActiveProcessesForBook(bookSlug);
  }
}
```

**Note:** Read `src/domain/interfaces.ts` to verify the EXACT method signatures
of `IProviderRegistry` before writing the delegation methods. The signatures
above are based on `ProviderRegistry` (the concrete class). The interface may
have slightly different parameter names. Match the interface exactly.

**Important:** The `IProviderRegistry` interface might not include
`registerProvider`, `removeProvider`, `updateProviderConfig`, etc. if they're
only on the concrete class. Check the interface — only implement what
`IProviderRegistry` declares. If `IProviderRegistry` doesn't define registration
methods, the composition root can call them on the raw `ProviderRegistry`
before wrapping.

### 3. Create `src/application/AutoTurnResumer.test.ts`

Create a test file with the following test cases (adapt to the project's
existing test patterns — see `src/infrastructure/providers/ProviderRegistry.test.ts`
for the mock pattern with `makeProvider`):

```typescript
import { describe, expect, it, vi } from 'vitest';
import type { IModelProvider, IProviderRegistry, ISettingsService } from '@domain/interfaces';
import type { ModelInfo, ProviderConfig, StreamEvent } from '@domain/types';
import { AutoTurnResumer } from './AutoTurnResumer';

// Reuse the mock patterns from ProviderRegistry.test.ts

describe('AutoTurnResumer', () => {
  it('forwards done normally when isMaxTurns is not set', async () => {
    const events: StreamEvent[] = [];
    const inner = makeMockRegistry({ doneIsMaxTurns: false });
    const resumer = new AutoTurnResumer(inner);

    await resumer.sendMessage({
      model: 'test-model',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 4096,
      maxTurns: 10,
      conversationId: 'conv-1',
      onEvent: (e) => events.push(e),
    });

    const done = events.find(e => e.type === 'done');
    expect(done).toBeDefined();
    expect(events.filter(e => e.type === 'error')).toHaveLength(0);
  });

  it('auto-resumes when error has isMaxTurns: true, then forwards done', async () => {
    // Provider errors with isMaxTurns on first call, succeeds on second
    const events: StreamEvent[] = [];
    let callCount = 0;
    const inner = makeMockRegistry({
      onSend: (onEvent) => {
        callCount++;
        if (callCount === 1) {
          onEvent({ type: 'textDelta', text: 'partial work' });
          onEvent({ type: 'error', message: 'max turns', isMaxTurns: true });
          return Promise.reject(new Error('max turns'));
        }
        onEvent({ type: 'textDelta', text: ' finished' });
        onEvent({ type: 'done', inputTokens: 10, outputTokens: 20, thinkingTokens: 0, filesTouched: {} });
        return Promise.resolve();
      },
    });
    const resumer = new AutoTurnResumer(inner);

    await resumer.sendMessage({
      model: 'test-model',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'do work' }],
      maxTokens: 4096,
      maxTurns: 30,
      conversationId: 'conv-1',
      onEvent: (e) => events.push(e),
    });

    expect(callCount).toBe(2);
    const resumeEvents = events.filter(e => e.type === 'maxTurnsResume');
    expect(resumeEvents).toHaveLength(1);
    expect(resumeEvents[0]).toMatchObject({ type: 'maxTurnsResume', attempt: 1, newMaxTurns: 40 });
    const done = events.find(e => e.type === 'done');
    expect(done).toBeDefined();
    // No error event should reach the caller
    expect(events.filter(e => e.type === 'error')).toHaveLength(0);
  });

  it('auto-resumes when done has isMaxTurns: true (Ollama/Llama pattern)', async () => {
    const events: StreamEvent[] = [];
    let callCount = 0;
    const inner = makeMockRegistry({
      onSend: (onEvent) => {
        callCount++;
        if (callCount === 1) {
          onEvent({ type: 'textDelta', text: 'partial' });
          onEvent({ type: 'done', inputTokens: 5, outputTokens: 10, thinkingTokens: 0, filesTouched: {}, isMaxTurns: true });
          return Promise.resolve();
        }
        onEvent({ type: 'done', inputTokens: 5, outputTokens: 15, thinkingTokens: 0, filesTouched: {} });
        return Promise.resolve();
      },
    });
    const resumer = new AutoTurnResumer(inner);

    await resumer.sendMessage({
      model: 'test-model',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'do work' }],
      maxTokens: 4096,
      maxTurns: 30,
      conversationId: 'conv-1',
      onEvent: (e) => events.push(e),
    });

    expect(callCount).toBe(2);
    expect(events.filter(e => e.type === 'maxTurnsResume')).toHaveLength(1);
    const done = events.find(e => e.type === 'done');
    expect(done).toBeDefined();
    // Token totals should be accumulated
    if (done?.type === 'done') {
      expect(done.inputTokens).toBe(10); // 5 + 5
      expect(done.outputTokens).toBe(25); // 10 + 15
    }
  });

  it('forwards genuine errors (non-maxTurns) without resuming', async () => {
    const events: StreamEvent[] = [];
    const inner = makeMockRegistry({
      onSend: (onEvent) => {
        onEvent({ type: 'error', message: 'CLI crashed' });
        return Promise.reject(new Error('CLI crashed'));
      },
    });
    const resumer = new AutoTurnResumer(inner);

    await expect(resumer.sendMessage({
      model: 'test-model',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 4096,
      maxTurns: 30,
      conversationId: 'conv-1',
      onEvent: (e) => events.push(e),
    })).rejects.toThrow('CLI crashed');

    expect(events.filter(e => e.type === 'error')).toHaveLength(1);
    expect(events.filter(e => e.type === 'maxTurnsResume')).toHaveLength(0);
  });

  it('delegates abortStream to the inner registry', () => {
    const inner = makeMockRegistry({});
    const resumer = new AutoTurnResumer(inner);
    resumer.abortStream('conv-1');
    expect(inner.abortStream).toHaveBeenCalledWith('conv-1');
  });
});

// Helper: create a mock IProviderRegistry
function makeMockRegistry(opts: {
  doneIsMaxTurns?: boolean;
  onSend?: (onEvent: (e: StreamEvent) => void) => Promise<void>;
}): IProviderRegistry {
  return {
    registerProvider: vi.fn(),
    removeProvider: vi.fn(),
    getProvider: vi.fn(() => null),
    getDefaultProvider: vi.fn(() => ({
      providerId: 'test',
      capabilities: ['text-completion', 'streaming'],
      isAvailable: vi.fn(async () => true),
      invalidateAvailabilityCache: vi.fn(),
      sendMessage: vi.fn(),
      abortStream: vi.fn(),
      hasActiveProcesses: vi.fn(() => false),
      hasActiveProcessesForBook: vi.fn(() => false),
    } as unknown as IModelProvider)),
    getProviderForModel: vi.fn(() => null),
    resolveModelSelection: vi.fn((m: string) => ({ requestedModel: m, model: m, providerId: 'test', didFallback: false, reason: 'available' })),
    listProviders: vi.fn(() => []),
    listAllModels: vi.fn(() => []),
    checkProviderStatus: vi.fn(async () => 'available'),
    getProviderConfig: vi.fn(() => null),
    updateProviderConfig: vi.fn(),
    setDefaultProvider: vi.fn(),
    sendMessage: vi.fn(async (params: { onEvent: (e: StreamEvent) => void }) => {
      if (opts.onSend) return opts.onSend(params.onEvent);
      params.onEvent({ type: 'done', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, filesTouched: {} });
    }),
    abortStream: vi.fn(),
    hasActiveProcesses: vi.fn(() => false),
    hasActiveProcessesForBook: vi.fn(() => false),
  } as unknown as IProviderRegistry;
}
```

Adapt the mock and assertions to the actual `IProviderRegistry` interface
methods — read the interface first to ensure all method names match.

### 4. Export from `src/application/index.ts`

Read `src/application/index.ts`. Add:

```typescript
export { AutoTurnResumer } from './AutoTurnResumer';
```

### 5. Wire in the composition root

Read `src/main/index.ts` (and/or `src/main/bootstrap.ts` if the composition
root is there — check which file creates the `ProviderRegistry`).

Find where `ProviderRegistry` is instantiated. It should look like:

```typescript
const providers = new ProviderRegistry(settings);
```

After registering all providers (Claude CLI, Ollama, etc.), wrap it:

```typescript
import { AutoTurnResumer } from '@application/AutoTurnResumer';

// ... after all provider registrations ...
const wrappedProviders = new AutoTurnResumer(providers);
```

Then pass `wrappedProviders` (instead of `providers`) to every service
constructor that takes `IProviderRegistry`:

```typescript
const chatService = new ChatService(settings, agents, db, wrappedProviders, ...);
```

**IMPORTANT:** The registration calls (`providers.registerProvider(...)`)
must happen on the **raw** `ProviderRegistry` — not the wrapper. Only `sendMessage`
and read methods need the wrapper. So:

1. Create `providers = new ProviderRegistry(settings)`
2. Register all providers on `providers`
3. Create `wrappedProviders = new AutoTurnResumer(providers)`
4. Pass `wrappedProviders` to all services

This ensures registration (which only happens at startup) bypasses the
wrapper, while all runtime `sendMessage` calls go through the auto-resume logic.

## Verification

1. `npx tsc --noEmit` — clean. Pay special attention to:
   - `AutoTurnResumer` correctly implements `IProviderRegistry` (all methods)
   - No `any` types
   - No layer-boundary violations (application imports only domain interfaces + types)

2. Run the AutoTurnResumer tests:
   ```bash
   npx vitest run src/application/AutoTurnResumer.test.ts
   ```

3. Run the ProviderRegistry tests (should be unaffected — the wrapper doesn't
   change the inner registry):
   ```bash
   npx vitest run src/infrastructure/providers/ProviderRegistry.test.ts
   ```

4. Run the ChatService tests (the wiring change should be transparent):
   ```bash
   npx vitest run src/application/ChatService.test.ts
   ```

5. Architecture compliance:
   - `AutoTurnResumer` imports only from `@domain/interfaces` and `@domain/types`
     (type imports) + `nanoid` (already a project dependency)
   - No concrete infrastructure classes imported
   - No `any` types
   - Error handling: genuine errors (non-maxTurns) are re-thrown; max-turns
     errors are swallowed and the call is resumed

## State Update

Update `prompts/session-program/program-030/STATE.md`:
- SESSION-04 status → `done`, completion date
- Handoff note: confirm AutoTurnResumer class created, tests pass, composition
  root wraps ProviderRegistry. List which file was modified for wiring
  (`src/main/index.ts` or `src/main/bootstrap.ts`).