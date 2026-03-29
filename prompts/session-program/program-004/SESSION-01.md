# SESSION-01 — Domain Types & Interfaces

> **Program:** Novel Engine
> **Feature:** dashboards-and-revision-modal
> **Modules:** M01
> **Depends on:** Nothing
> **Estimated effort:** 20 min

---

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| `M01` | domain | `src/domain/types.ts, src/domain/interfaces.ts, src/domain/constants.ts` | Extending all three with new types, interfaces, and constants |

---

## Context

This session adds the domain-layer foundation for three features: a Book Overview Dashboard (project status at a glance), a Writing Statistics Dashboard (charts and cost tracking), and a Revision Queue Modal refactor. All three need new types and service interfaces defined before any implementation can begin.

The existing domain has `UsageSummary` (aggregate totals), `PipelinePhase`, `BookMeta`, `FileEntry`, and `FileVersionSummary`. We extend it with types for dashboard data, time-series statistics, per-agent/per-phase usage breakdowns, and word count tracking.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/domain/types.ts` | Modify | Add dashboard, statistics, and word-count-snapshot types |
| `src/domain/interfaces.ts` | Modify | Add `IDashboardService`, `IStatisticsService`; extend `IDatabaseService` and `IFileSystemService` |
| `src/domain/constants.ts` | Modify | Add `MODEL_PRICING` constant for cost estimation |

---

## Implementation

### 1. Add types to `src/domain/types.ts`

Append these type definitions at the end of the file, before the closing of the module (after `ManuscriptAssembly`):

```typescript
// === Book Overview Dashboard ===

export type RecentFile = {
  path: string;
  modifiedAt: string;
  wordCount: number;
};

export type RevisionTaskItem = {
  text: string;
  isCompleted: boolean;
  taskNumber: number;
};

export type BookDashboardData = {
  bookSlug: string;
  pipeline: {
    currentPhase: PipelinePhase | null;
    completedCount: number;
    totalCount: number;
  };
  wordCount: {
    current: number;
    target: number | null;
    perChapter: { slug: string; wordCount: number }[];
  };
  lastInteraction: {
    agentName: AgentName;
    timestamp: string;
    conversationTitle: string;
  } | null;
  revisionTasks: {
    total: number;
    completed: number;
    items: RevisionTaskItem[];
  };
  recentFiles: RecentFile[];
  daysInProgress: number;
  bookTitle: string;
  bookStatus: BookStatus;
};

// === Writing Statistics ===

export type UsageTimePoint = {
  date: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
};

export type AgentUsageBreakdown = {
  agentName: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  conversationCount: number;
  estimatedCost: number;
};

export type PhaseUsageBreakdown = {
  phase: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  conversationCount: number;
  estimatedCost: number;
};

export type WordCountSnapshot = {
  bookSlug: string;
  wordCount: number;
  chapterCount: number;
  recordedAt: string;
};

export type BookStatistics = {
  usageOverTime: UsageTimePoint[];
  perAgent: AgentUsageBreakdown[];
  perPhase: PhaseUsageBreakdown[];
  wordCountHistory: WordCountSnapshot[];
  totalCostEstimate: number;
  wordsPerChapter: { slug: string; wordCount: number }[];
  totalTokens: {
    input: number;
    output: number;
    thinking: number;
  };
  conversationCount: number;
};
```

### 2. Add `MODEL_PRICING` constant to `src/domain/constants.ts`

Add after `CONTEXT_RESERVE_TOKENS`:

```typescript
export type ModelPricing = {
  inputPer1M: number;
  outputPer1M: number;
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-20250514': { inputPer1M: 15, outputPer1M: 75 },
  'claude-sonnet-4-20250514': { inputPer1M: 3, outputPer1M: 15 },
};
```

### 3. Extend `IDatabaseService` in `src/domain/interfaces.ts`

Add these methods before the `close()` method in the `IDatabaseService` interface:

```typescript
  // Dashboard & Statistics queries
  getLastConversation(bookSlug: string): { agentName: string; title: string; updatedAt: string } | null;
  getUsageOverTime(bookSlug?: string): UsageTimePoint[];
  getUsageByAgent(bookSlug?: string): { agentName: string; inputTokens: number; outputTokens: number; thinkingTokens: number; conversationCount: number }[];
  getUsageByPhase(bookSlug?: string): { phase: string; inputTokens: number; outputTokens: number; thinkingTokens: number; conversationCount: number }[];
  recordWordCountSnapshot(bookSlug: string, wordCount: number, chapterCount: number): void;
  getWordCountHistory(bookSlug?: string, limit?: number): WordCountSnapshot[];
```

Add the import for `WordCountSnapshot` to the existing import block at the top of the file.

### 4. Extend `IFileSystemService` in `src/domain/interfaces.ts`

Add this method after `countWordsPerChapter`:

```typescript
  getRecentFiles(bookSlug: string, limit?: number): Promise<RecentFile[]>;
```

Add the import for `RecentFile` to the existing import block.

### 5. Add `IDashboardService` to `src/domain/interfaces.ts`

Add after the `IFindReplaceService` interface:

```typescript
export interface IDashboardService {
  getDashboardData(bookSlug: string): Promise<BookDashboardData>;
}
```

Add the import for `BookDashboardData` to the existing import block.

### 6. Add `IStatisticsService` to `src/domain/interfaces.ts`

Add after `IDashboardService`:

```typescript
export interface IStatisticsService {
  getStatistics(bookSlug?: string): Promise<BookStatistics>;
  recordWordCountSnapshot(bookSlug: string): Promise<void>;
}
```

Add the import for `BookStatistics` to the existing import block.

---

## Verification

1. Run `npx tsc --noEmit` — must pass with zero errors.
2. Confirm no imports were added to `src/domain/types.ts` — it must remain import-free.
3. Confirm `src/domain/constants.ts` only imports from `./types` (type imports).
4. Confirm `src/domain/interfaces.ts` only imports from `./types`.

---

## State Update

After completing this session, update `prompts/session-program/program-004/STATE.md`:
- Set SESSION-01 status to `done`
- Set Completed date
- Add notes about decisions or complications
- Update Handoff Notes
