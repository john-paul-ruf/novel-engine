# SESSION-05 — Statistics Service + IPC + Preload

> **Program:** Novel Engine
> **Feature:** dashboards-and-revision-modal
> **Modules:** M08, M09
> **Depends on:** SESSION-01, SESSION-02
> **Estimated effort:** 25 min

---

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| `M01` | domain | `src/domain/interfaces.ts, src/domain/types.ts, src/domain/constants.ts` | IStatisticsService interface, BookStatistics type, MODEL_PRICING |
| `M08` | application | `src/application/UsageService.ts` | Existing usage patterns |
| `M09` | main/ipc | `src/main/index.ts, src/main/ipc/handlers.ts, src/preload/index.ts` | Wiring service + IPC + bridge |

---

## Context

SESSION-01 defined `IStatisticsService` and `BookStatistics`. SESSION-02 implemented the database queries (`getUsageOverTime`, `getUsageByAgent`, `getUsageByPhase`, `recordWordCountSnapshot`, `getWordCountHistory`). This session creates the `StatisticsService` that orchestrates those queries, computes cost estimates using `MODEL_PRICING`, and wires it through IPC.

The service also exposes `recordWordCountSnapshot()` which the IPC layer calls after stream completion to track word count over time.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/application/StatisticsService.ts` | Create | Implements `IStatisticsService` |
| `src/main/index.ts` | Modify | Instantiate StatisticsService, inject deps |
| `src/main/ipc/handlers.ts` | Modify | Add `statistics:*` handlers + word count snapshot on stream done |
| `src/preload/index.ts` | Modify | Add `statistics` bridge namespace |

---

## Implementation

### 1. Create `src/application/StatisticsService.ts`

```typescript
import type {
  IStatisticsService,
  IDatabaseService,
  IFileSystemService,
} from '@domain/interfaces';
import type {
  AgentUsageBreakdown,
  BookStatistics,
  PhaseUsageBreakdown,
} from '@domain/types';
import { MODEL_PRICING } from '@domain/constants';

export class StatisticsService implements IStatisticsService {
  constructor(
    private db: IDatabaseService,
    private fs: IFileSystemService,
  ) {}

  async getStatistics(bookSlug?: string): Promise<BookStatistics> {
    const usageOverTime = this.db.getUsageOverTime(bookSlug);
    const perAgentRaw = this.db.getUsageByAgent(bookSlug);
    const perPhaseRaw = this.db.getUsageByPhase(bookSlug);
    const wordCountHistory = this.db.getWordCountHistory(bookSlug);
    const usageSummary = this.db.getUsageSummary(bookSlug);

    let wordsPerChapter: { slug: string; wordCount: number }[] = [];
    if (bookSlug) {
      try {
        wordsPerChapter = await this.fs.countWordsPerChapter(bookSlug);
      } catch {
        // Book may not exist or have no chapters
      }
    }

    const perAgent: AgentUsageBreakdown[] = perAgentRaw.map((r) => ({
      ...r,
      estimatedCost: this.estimateCost(r.inputTokens, r.outputTokens, r.thinkingTokens),
    }));

    const perPhase: PhaseUsageBreakdown[] = perPhaseRaw.map((r) => ({
      ...r,
      estimatedCost: this.estimateCost(r.inputTokens, r.outputTokens, r.thinkingTokens),
    }));

    const totalCostEstimate = this.estimateCost(
      usageSummary.totalInputTokens,
      usageSummary.totalOutputTokens,
      usageSummary.totalThinkingTokens,
    );

    return {
      usageOverTime,
      perAgent,
      perPhase,
      wordCountHistory,
      totalCostEstimate,
      wordsPerChapter,
      totalTokens: {
        input: usageSummary.totalInputTokens,
        output: usageSummary.totalOutputTokens,
        thinking: usageSummary.totalThinkingTokens,
      },
      conversationCount: usageSummary.conversationCount,
    };
  }

  async recordWordCountSnapshot(bookSlug: string): Promise<void> {
    try {
      const chapters = await this.fs.countWordsPerChapter(bookSlug);
      const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
      this.db.recordWordCountSnapshot(bookSlug, totalWords, chapters.length);
    } catch {
      // Silently skip if book doesn't exist or has no chapters
    }
  }

  private estimateCost(inputTokens: number, outputTokens: number, thinkingTokens: number): number {
    const defaultPricing = MODEL_PRICING['claude-opus-4-20250514'];
    if (!defaultPricing) return 0;

    const inputCost = (inputTokens / 1_000_000) * defaultPricing.inputPer1M;
    const outputCost = ((outputTokens + thinkingTokens) / 1_000_000) * defaultPricing.outputPer1M;
    return Math.round((inputCost + outputCost) * 100) / 100;
  }
}
```

Note: Cost estimation uses Opus pricing as a conservative default. Since the app doesn't track which model was used per-usage-record in a way that maps cleanly to breakdowns, we use a single pricing model. The disclaimer "estimated at API rates" is shown in the UI (SESSION-06).

### 2. Wire StatisticsService in composition root

Read `src/main/index.ts`. Add the import:

```typescript
import { StatisticsService } from '@app/StatisticsService';
```

Instantiate after UsageService:

```typescript
const statisticsService = new StatisticsService(databaseService, fileSystemService);
```

Pass to `registerIpcHandlers`:

```typescript
statistics: statisticsService,
```

### 3. Add IPC handlers

In `src/main/ipc/handlers.ts`:

Add `IStatisticsService` to the interface imports:
```typescript
import type { IStatisticsService } from '@domain/interfaces';
```

Add `BookStatistics` to the type imports:
```typescript
import type { BookStatistics } from '@domain/types';
```

Add `statistics: IStatisticsService` to the services parameter object.

Add handlers:

```typescript
// Statistics
ipcMain.handle('statistics:get', async (_event, bookSlug?: string): Promise<BookStatistics> => {
  return services.statistics.getStatistics(bookSlug);
});

ipcMain.handle('statistics:recordSnapshot', async (_event, bookSlug: string): Promise<void> => {
  return services.statistics.recordWordCountSnapshot(bookSlug);
});
```

### 4. Hook word count snapshot into stream completion

In `handlers.ts`, find the `chat:send` handler or the stream event forwarding logic. After a `done` stream event is forwarded to the renderer, record a word count snapshot if files were changed.

Look for where the `chat:send` handler is defined. The `onEvent` callback in the handler processes stream events. After the `done` event, add:

```typescript
if (event.type === 'done' && params.bookSlug && Object.keys(event.filesTouched).length > 0) {
  services.statistics.recordWordCountSnapshot(params.bookSlug).catch(() => {});
}
```

If the stream event forwarding is in a shared location (e.g., a `forwardStreamEvent` helper), add the snapshot there so it fires for all stream sources (chat, revision, hot take, etc.). If it's per-handler, add it to the `chat:send` handler's `onEvent` callback only — the other handlers can be updated later.

### 5. Add preload bridge

In `src/preload/index.ts`:

Add `BookStatistics` to the type imports.

Add the `statistics` namespace to the `api` object:

```typescript
// Statistics
statistics: {
  get: (bookSlug?: string): Promise<BookStatistics> =>
    ipcRenderer.invoke('statistics:get', bookSlug),
  recordSnapshot: (bookSlug: string): Promise<void> =>
    ipcRenderer.invoke('statistics:recordSnapshot', bookSlug),
},
```

---

## Verification

1. Run `npx tsc --noEmit` — must pass with zero errors.
2. Verify `StatisticsService` imports only from `@domain/interfaces`, `@domain/types`, and `@domain/constants` — never concrete infrastructure classes.
3. Verify `handlers.ts` statistics handlers are one-liner delegations.
4. Verify the word count snapshot hook fires only when files were actually changed (not on empty streams).
5. Verify the preload bridge channel names match the handler channel names.

---

## State Update

After completing this session, update `prompts/session-program/program-004/STATE.md`:
- Set SESSION-05 status to `done`
- Set Completed date
- Add notes about decisions or complications
- Update Handoff Notes
