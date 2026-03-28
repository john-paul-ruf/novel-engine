# SESSION-03 — Application: Series-Aware Context Building

> **Feature:** series-bible
> **Layer(s):** Application
> **Depends on:** SESSION-01, SESSION-02
> **Estimated effort:** 25 min

---

## Context

SESSION-01 added domain types and the `ISeriesService` interface. SESSION-02 implemented the concrete `SeriesService`. This session integrates series awareness into the application layer — specifically the `ContextBuilder` and `ChatService`.

When a book belongs to a series, every agent interaction should include the series bible path in the read guidance so agents can access cross-volume context. The `ContextBuilder` already builds file manifests and read guidance per agent — we extend it to include series bible information when available.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/application/ContextBuilder.ts` | Modify | Accept optional `seriesBiblePath`, inject into read guidance and manifest |
| `src/application/ChatService.ts` | Modify | Resolve series bible path before building context, pass to ContextBuilder |

---

## Implementation

### 1. Update `ContextBuilder.build()` in `src/application/ContextBuilder.ts`

Read `src/application/ContextBuilder.ts` in full.

**1a.** Add a new optional parameter `seriesBiblePath?: string` to the `build()` method's params object:

```typescript
build(params: {
  agentName: AgentName;
  agentSystemPrompt: string;
  manifest: ProjectManifest;
  messages: Message[];
  purposeInstructions?: string;
  thinkingBudget?: number;
  authorProfilePath?: string;
  seriesBiblePath?: string;       // NEW
}): AssembledContext {
```

**1b.** In the body of `build()`, after the existing `authorProfilePath` replacement in the guidance section, add a similar replacement for `series-bible.md`:

```typescript
// Replace placeholder 'series-bible.md' with absolute path so the agent can find it
if (guidanceSection && seriesBiblePath) {
  guidanceSection = guidanceSection.replace(/`series-bible\.md`/g, `\`${seriesBiblePath}\``);
}
```

**1c.** In `build()`, after assembling the sections array but before joining, add a series context block if `seriesBiblePath` is provided:

```typescript
if (seriesBiblePath) {
  sections.push(`### Series Context\nThis book is part of a series. The shared series bible is at: \`${seriesBiblePath}\`\nRead it for cross-volume character details, world rules, and timeline.`);
}
```

This ensures the path is always visible in the system prompt regardless of whether the agent has `series-bible.md` in its read guidance.

### 2. Update `ChatService` in `src/application/ChatService.ts`

Read `src/application/ChatService.ts` in full.

**2a.** Add `ISeriesService` as a constructor dependency:

```typescript
import type { ISeriesService } from '@domain/interfaces';

// In constructor:
constructor(
  private settings: ISettingsService,
  private agents: IAgentService,
  private db: IDatabaseService,
  private providers: IProviderRegistry,
  private fs: IFileSystemService,
  private chapterValidator: IChapterValidator,
  private pitchRoom: IPitchRoomService,
  private hotTake: IHotTakeService,
  private adhocRevision: IAdhocRevisionService,
  private streamManager: StreamManager,
  private series: ISeriesService,           // NEW
) {}
```

**2b.** In the `sendMessage()` method, before context assembly, resolve the series bible path:

```typescript
const seriesBiblePath = await this.series.getSeriesBiblePath(bookSlug);
```

**2c.** Pass it to `this.contextBuilder.build()`:

```typescript
const context = this.contextBuilder.build({
  // ...existing params...
  seriesBiblePath: seriesBiblePath ?? undefined,
});
```

---

## Architecture Compliance

- [ ] Application imports only from domain interfaces, not concrete classes
- [ ] `ISeriesService` is injected — not imported from infrastructure
- [ ] ContextBuilder remains a pure utility (no service dependencies)
- [ ] No new IPC channels in this session (that's SESSION-04)

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `ContextBuilder.build()` accepts `seriesBiblePath` parameter
3. `ChatService` constructor accepts `ISeriesService` as a dependency
4. When a book is part of a series, the assembled context includes series bible path in guidance
5. When a book is NOT part of a series, behavior is unchanged (seriesBiblePath is undefined)

---

## State Update

After completing this session, update `prompts/feature/series-bible/STATE.md`:
- Set SESSION-03 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes for the next session
