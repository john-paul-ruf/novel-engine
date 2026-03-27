# Architecture Issues — Novel Engine

> Reviewed: 2026-03-27

## Overall Assessment

The architecture is solid where it matters — layer boundaries are enforced (verified: zero domain-to-infra imports, zero application-to-infra imports), the composition root is clean, the preload bridge is properly typed, and the domain types are comprehensive. The issues below are about scale management — the system has grown past the point where single-file-per-concern works for the biggest files.

---

## 1. ChatService Is a God Object (1,218 lines)

**Severity: High — the single biggest architectural issue**

`src/application/ChatService.ts` handles:
- Pipeline message orchestration
- Pitch room conversations
- Hot take conversations
- Ad hoc revision flow
- Voice setup and author profile conversations
- Chapter auditing (Verity audit agent)
- Chapter fix passes
- Motif/phrase auditing (Lumen)
- Stream lifecycle management (`activeStreams` map)
- Orphan session recovery
- Conversation CRUD delegation
- Phase-aware Verity prompt assembly

That is 12+ distinct responsibilities in one class. Every new conversation type has become another private `handle*` method bolted onto ChatService. The constructor signature reveals the problem:

```typescript
constructor(
  private settings: ISettingsService,
  private agents: IAgentService,
  private db: IDatabaseService,
  private claude: IClaudeClient,
  private fs: IFileSystemService,
  private usage: UsageService,      // concrete class, not interface
  private chapterValidator: IChapterValidator,
)
```

**Recommendation**: Extract conversation-type handlers into focused services:
- `AuditService` — `auditChapter()`, `fixChapter()`, `runMotifAudit()`
- `PitchRoomService` — `handlePitchRoomMessage()`
- `HotTakeService` — `handleHotTake()`
- `AdhocRevisionService` — `handleAdhocRevision()`

`ChatService` becomes a thin router: look up conversation purpose, delegate to the right service. Each sub-service gets only the dependencies it needs.

---

## 2. constants.ts Is a Junk Drawer (754 lines)

**Severity: Medium-High**

`src/domain/constants.ts` mixes fundamentally different concerns:

| Content | Lines | Belongs In |
|---------|-------|-----------|
| Agent metadata registry | ~60 | Fine here |
| Pipeline phase definitions | ~20 | Fine here |
| Default settings | ~15 | Fine here |
| 50 fun status messages | ~110 | Separate file |
| `MOTIF_AUDIT_INSTRUCTIONS` (long prompt) | ~45 | Agent prompt file |
| `VERITY_FIX_INSTRUCTIONS` (long prompt) | ~30 | Agent prompt file |
| `ADHOC_REVISION_INSTRUCTIONS` | ~15 | Agent prompt file |
| `REVISION_VERIFICATION_PROMPT` | ~15 | Agent prompt file |
| `HOT_TAKE_INSTRUCTIONS` | ~20 | Agent prompt file |
| `VOICE_SETUP_INSTRUCTIONS` | ~30 | Agent prompt file |
| `AUTHOR_PROFILE_INSTRUCTIONS` | ~20 | Agent prompt file |
| `buildPitchRoomInstructions()` | ~100 | Agent prompt file |
| `WRANGLER_SESSION_PARSE_PROMPT` | ~60 | Agent prompt file |
| Verity pipeline file mappings | ~20 | Fine here |
| Token estimation constants | ~20 | Fine here |

Roughly 465 lines (62%) are long-form prompt strings that should be `.md` files in the `agents/` directory — loaded at runtime by `AgentService.loadRaw()`, not hardcoded in the domain layer. This is especially ironic given the architecture already has a mechanism for agent prompts as files.

**Recommendation**:
- Move prompt templates to `agents/` as `.md` files (e.g., `agents/VOICE-SETUP.md`, `agents/MOTIF-AUDIT.md`)
- Move status messages to a separate `src/domain/statusMessages.ts`
- `constants.ts` should be under 300 lines of pure configuration data

---

## 3. The Renderer Imports Values from Domain — Layer Violation

**Severity: Medium**

The architecture rules state:

> "Renderer may import types from domain using `import type` — never values"

But 15 renderer files import runtime values from `@domain/constants`:

```typescript
import { AGENT_REGISTRY } from '@domain/constants';
import { randomRespondingStatus } from '@domain/constants';
import { CHARS_PER_TOKEN } from '@domain/constants';
import { PIPELINE_PHASES } from '@domain/constants';
```

This creates a direct dependency from the renderer into the domain layer's runtime code. Technically the bundler handles this (Vite tree-shakes), but architecturally it means changes to `constants.ts` can break the renderer, and any Node.js-specific code that creeps into constants would crash the browser context.

**Recommendation**: Either:
- **Relax the rule** — acknowledge that static lookup tables (`AGENT_REGISTRY`, `PIPELINE_PHASES`) are safe to share, and document the exception
- **Or expose them via the preload bridge** — `window.novelEngine.config.agentRegistry`, etc.

Relaxing the rule with a documented carve-out for pure data constants is the pragmatic choice. The current usage is harmless.

---

## 4. UsageService and ChatService Bypass the Interface Layer

**Severity: Medium**

The handlers file imports `ChatService` and `UsageService` as concrete types, not interfaces:

```typescript
// src/main/ipc/handlers.ts
import type { ChatService } from '@app/ChatService';
import type { UsageService } from '@app/UsageService';
```

And ChatService itself depends on the concrete `UsageService`:

```typescript
import type { UsageService } from './UsageService';
```

Neither `ChatService` nor `UsageService` has a corresponding interface in `src/domain/interfaces.ts`. This breaks the dependency inversion principle that every other service follows. If you ever wanted to test ChatService in isolation, you cannot mock UsageService without additional gymnastics.

**Recommendation**: Add `IChatService` and `IUsageService` interfaces to `interfaces.ts`. The handlers should depend on those, not the concrete classes.

---

## 5. The Wrangler Two-Call Pattern Is Dead Code (Conceptual Debt)

**Severity: Low-Medium**

The architect system prompt describes an elaborate two-call pattern where a Wrangler agent (Sonnet) plans context before each creative agent call. But looking at the actual code:

- There is no `WRANGLER.md` agent file
- The `Wrangler` entry in `AGENT_REGISTRY` exists but is only used by `RevisionQueueService` for parsing revision plans
- The `ContextBuilder` does static, rule-based context assembly — no Wrangler pre-call
- The architect prompt mentions `IContextWrangler`, `WranglerPlan`, `WranglerInput` — none of these exist in `interfaces.ts`

The system evolved from the Wrangler design to the simpler `ContextBuilder` approach (which is honestly better for an Electron app — one CLI call is faster and cheaper than two). But the `Wrangler` agent name in the registry and type system is vestigial.

**Recommendation**: Either remove `Wrangler` from `AgentName` and the registry, or document it as "reserved for revision plan parsing only."

---

## 6. No Test Infrastructure

**Severity: Medium** (for a project at this stage)

Zero test files exist. The architecture is well-suited for testing — interfaces everywhere, pure functions in `TokenEstimator` and `ContextBuilder`, deterministic pipeline detection logic. But nothing is actually tested.

Given that `PipelineService.isPhaseComplete()` has 14 branches with complex file-existence, word-count, and status-comparison logic, and `ContextBuilder.compactConversation()` makes budget-fraction decisions, these are prime candidates for unit tests.

**Recommendation**: Start with:
1. `PipelineService` — test each phase detection branch
2. `ContextBuilder` — test compaction at each budget threshold
3. `TokenEstimator` — verify estimation accuracy
4. `MotifLedgerService` — test load/save round-trip, graceful fallback

---

## 7. Silent Error Swallowing

**Severity: Low-Medium**

There are 113 bare `catch {}` blocks across the codebase. Many are intentional (file-not-found is expected), but some swallow errors that would be useful for debugging:

```typescript
// This is fine — expected case
catch { /* no voice profile yet */ }

// This loses useful error context
catch {
  return structuredClone(EMPTY_LEDGER);
}
```

**Recommendation**: For non-trivial catch blocks, log a `console.warn` with the error. For truly expected cases (ENOENT), check the error code explicitly rather than catching everything:

```typescript
catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
    console.warn('[MotifLedgerService] Unexpected error loading ledger:', err);
  }
  return structuredClone(EMPTY_LEDGER);
}
```

---

## 8. FileSystemService Is Too Large (1,221 lines)

**Severity: Low-Medium**

`src/infrastructure/filesystem/FileSystemService.ts` handles books, chapters, pitches, shelved pitches, pitch drafts, cover images, manifests, word counting, archiving, slug reconciliation, and directory imports. Similar to ChatService, it has accumulated responsibilities.

**Recommendation**: Extract `PitchService` (shelved pitches + pitch drafts) and `ManifestService` (project manifest + word counting) into their own infrastructure modules.

---

## 9. Database Schema Has No Migration System

**Severity: Low** (but will bite later)

`src/infrastructure/database/schema.ts` uses `CREATE TABLE IF NOT EXISTS` and has one defensive column-existence check. There is no versioned migration system. Adding a column, changing a constraint, or adding a table requires ad hoc `ALTER TABLE` checks.

**Recommendation**: Add a `schema_version` table and a simple migration runner:

```typescript
const MIGRATIONS = [
  { version: 1, sql: '...' },
  { version: 2, sql: 'ALTER TABLE ...' },
];
```

---

## 10. Agent Filename Casing Is Inconsistent

**Severity: Cosmetic**

```
FORGE.MD       <- uppercase .MD
GHOSTLIGHT.md  <- lowercase .md
Quill.md       <- PascalCase
SPARK.md       <- UPPER
VERITY-CORE.md <- UPPER-KEBAB
```

The `AGENT_REGISTRY` hardcodes these exact filenames, so it works. But it is a maintenance trap — anyone adding a new agent has to match the existing (inconsistent) convention.

**Recommendation**: Standardize to `UPPER-CASE.md` and rename the outliers (`FORGE.MD` to `FORGE.md`, `Quill.md` to `QUILL.md`).

---

## Priority Stack

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 1 | Split ChatService into focused sub-services | Medium | High |
| 2 | Extract prompt templates from constants.ts to agent files | Low | Medium-High |
| 4 | Add IChatService + IUsageService interfaces | Low | Medium |
| 6 | Add test infrastructure (Pipeline, ContextBuilder) | Medium | Medium |
| 3 | Document the renderer-imports-values exception | Trivial | Low-Medium |
| 5 | Clean up Wrangler vestige | Low | Low-Medium |
| 7 | Audit catch blocks for silent error swallowing | Low | Low-Medium |
| 8 | Split FileSystemService | Medium | Low-Medium |
| 9 | Add database migration system | Low | Low (but compounds) |
| 10 | Standardize agent filenames | Trivial | Cosmetic |
