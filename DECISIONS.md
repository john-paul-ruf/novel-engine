# Decisions Log

## 2026-04-24 session-1 — Ollama provider doesn't write pipeline output files

- **Context**: User ran Ghostlight "Second Read" via Ollama provider. The agent completed (pipeline UI showed "Done") but no `source/reader-report.md` was written. Pipeline phase couldn't actually advance because `PipelineService.isPhaseComplete('second-read')` checks for file existence + differing word counts.
- **Decision**: Implement all three fixes:
  - **(C) Guard**: Warn users when a pipeline agent runs on a provider without tool-use capability.
  - **(A) Post-stream extraction**: After non-tool-use providers finish, extract the chat response and write it to the expected output file automatically.
  - **(B) Ollama function calling**: Implement native tool-use in OllamaCodeClient using Ollama's `/api/chat` tool-calling protocol, making it a true agent-loop provider.
- **Alternatives considered**:
  - Only C (guard): Too limiting — blocks Ollama from pipeline use entirely.
  - Only A (extraction): Works for single-file agents (Ghostlight, Lumen) but fragile for multi-file agents (Forge). Also doesn't let agents read files, so quality suffers.
  - Only B (tool-use): Best long-term but some Ollama models don't support function calling. Need A as fallback.
- **Verification**: `cat PLAN.md` — plan updated with T-C1 through T-D1 task DAG.
- **Follow-ups**: T-C1, T-C2, T-C3, T-A1, T-A2, T-B1, T-B2, T-B3, T-B4, T-D1

## 2026-04-24 session-1 — Root cause analysis of the "Done but no file" bug

- **Context**: Investigated why pipeline showed "Done" without file output.
- **Decision**: The "Done" badge came from the stream session completing (`done` event emitted by OllamaCodeClient), not from pipeline file detection. The StreamManager saves the response as a DB message and ends the session on `done` — this is correct behavior. The bug is that `PipelineService.isPhaseComplete()` checks for files that only tool-use providers can write.
- **Alternatives considered**: None — this is a diagnosis, not a design choice.
- **Verification**: Code trace: `OllamaCodeClient.sendMessage()` → `wrappedOnEvent({type:'done'})` → `StreamManager.streamOnEvent` saves message + ends session. No file write occurs. `PipelineService.isPhaseComplete('second-read')` → `fileExists('source/reader-report.md')` → false.
- **Follow-ups**: T-A1 (post-stream file writer addresses this directly)

## 2026-04-24 session-1 — All three Ollama fixes implemented

- **Context**: Implemented C (guard), A (post-stream extraction), and B (tool-use) in a single session.
- **Decision**: All tasks T-C1 through T-B4 completed. Files changed:
  - `src/domain/types.ts` — Added `warning` StreamEvent variant
  - `src/domain/constants.ts` — Added `PHASE_OUTPUT_FILES` mapping, updated Ollama capabilities to include `tool-use`
  - `src/application/ChatService.ts` — Added provider capability check, warning event, post-stream file extraction with multi-file splitting
  - `src/renderer/stores/streamHandler.ts` — Added `onWarning` callback
  - `src/renderer/stores/chatStore.ts` — Added `warningMessage` state field
  - `src/renderer/components/Chat/StreamingMessage.tsx` — Added amber warning banner
  - `src/infrastructure/ollama-cli/tools.ts` — New: Ollama tool schemas (Read, Write, Edit, LS)
  - `src/infrastructure/ollama-cli/ToolExecutor.ts` — New: Sandboxed tool execution engine
  - `src/infrastructure/ollama-cli/OllamaCodeClient.ts` — Rewritten with multi-turn tool-use agent loop
  - `src/infrastructure/ollama-cli/index.ts` — Updated barrel exports
- **Alternatives considered**: None — all three approaches were requested.
- **Verification**: `npm run lint` (tsc --noEmit) exits 0 with no errors.
- **Follow-ups**: T-D1 (docs/changelog) — deferred.

## 2026-04-24 session-2 — Ollama tool argument normalization

- **Context**: First test of Ollama tool-use showed model passing `{"path": "about.json"}` as the `file_path` value (nested object instead of string). Also, the tool call description text was leaking into the chat as visible content.
- **Decision**: Two fixes:
  1. **ToolExecutor: robust argument extraction** — `requireString()` now tries the primary key, fallback key names (`path`, `file`, `dir`), and recursively unwraps nested objects, arrays, and JSON strings. Also extracts from single-value objects. Falls back to the only string value in args if all keys miss.
  2. **OllamaCodeClient: suppress content during tool calls** — When a chunk contains `tool_calls`, any `content` text in the same chunk is suppressed from `textDelta` emission. This prevents raw tool call JSON from appearing in the chat.
- **Alternatives considered**: Could have required models to produce correct argument formats (too restrictive — many Ollama models have weak function calling).
- **Verification**: `npm run lint` exits 0.
- **Follow-ups**: None immediate. Monitor with different Ollama models to see if further normalization is needed.

## 2026-04-24 session-2 — Extraction fallback based on actual results, not capabilities

- **Context**: Testing with an Ollama model showed it generating a JSON "plan" as text content instead of making actual `tool_calls`. The model doesn't support function calling despite Ollama offering the API. Since we marked Ollama as having `tool-use` capability, the post-stream extraction fallback never triggered.
- **Decision**: Changed extraction trigger from `!providerHasToolUse` to `stream.getChangedFiles().length === 0`. Now the extraction fires whenever NO files were actually written during the stream, regardless of what the provider advertises. This handles:
  1. Provider with no tool-use at all (OpenAI-compatible HTTP)
  2. Provider offers tools but model ignores them (Ollama model without function calling)
  3. Agent that ran tools but failed to write the expected file
- **Alternatives considered**: Could have removed `tool-use` from Ollama provider capabilities — but that's wrong because the OllamaCodeClient code DOES support tool-use. The model just has to use it.
- **Verification**: `npm run lint` exits 0. Logic trace: model generates text only → no `filesChanged` events → `getChangedFiles()` returns `[]` → extraction triggers → response written to `source/reader-report.md`.
- **Follow-ups**: The extracted response may contain the model's "plan" JSON rather than an actual reader report. That's acceptable — the file will exist and the pipeline can advance, and the user can re-run with a better model if needed.

## 2026-04-24 session-2 — Pre-load manuscript content for non-Claude-CLI providers

- **Context**: Ollama model generated a JSON "plan" listing files it wanted to read, instead of using tools or producing a reader report. The model sees a file manifest ("source/pitch.md — 3,000 words") but can't Read files — so it described what it would do as text. Even with tools offered via the API, the model doesn't use them.
- **Decision**: For all non-Claude-CLI providers, pre-load the full manuscript content into the system prompt (same approach as HotTakeService). This ensures the model can actually read the chapters and produce meaningful output regardless of tool support. Key changes:
  1. New `buildInlineManuscriptContent()` method reads all source files + chapter drafts and inlines them
  2. Inline content is appended to the system prompt for pipeline conversations when `activeProvider.providerId !== CLAUDE_CLI_PROVIDER_ID`
  3. Warning banner says "Manuscript content pre-loaded into context" so the user knows what happened
  4. The provider-level `isClaudeCli` check is deliberately broader than `providerHasToolUse` — even if Ollama advertises tool-use, the specific model may not use it. Only Claude CLI is proven reliable.
- **Alternatives considered**: 
  - Check `providerHasToolUse` instead of `isClaudeCli`: rejected because Ollama advertises tool-use at the provider level but individual models may ignore tools entirely.
  - Parse text-based tool calls from model output: too fragile, every model formats them differently.
- **Verification**: `npm run lint` exits 0.
- **Follow-ups**: For very large manuscripts (>100K words), the inlined content may exceed the model's context window. Could add a word-count check and truncate/summarize if needed.

## 2026-04-24 session-3 — Post-stream extraction never fired: two bugs

- **Context**: Ghostlight "First Reader" ran via Ollama on The Warden's Teeth (102K words). Stream completed but `source/reader-report.md` was never written. Post-stream extraction fallback should have caught this.
- **Decision**: Fixed two bugs in the extraction flow:
  1. **`onDone` was async but never awaited** (StreamManager line 148): The `extractResponseToFiles` callback returned a Promise but StreamManager only attached a `.catch()` — never `await`ed. If the main process was interrupted (e.g. HMR rebuild, visible in console logs during the test), the file write was lost mid-flight. **Fix**: Track the pending Promise in StreamManager's `pendingHook`, expose `awaitPendingHook()`, and await it in ChatService after `providers.sendMessage()` resolves.
  2. **No extraction on error path**: If the Ollama stream errored (context overflow, timeout — plausible with 102K words), the `error` event was emitted instead of `done`. The `onDone` callback only fired on `done`, so extraction was silently skipped even when the response buffer had valid content. **Fix**: Added `onError` hook to `StreamOptions`. ChatService now provides an `onError` handler that checks for accumulated response buffer content and extracts it to the pipeline output file.
- **Alternatives considered**: 
  - Move extraction into `streamOnEvent` directly: rejected — it's ChatService domain logic, not StreamManager's concern.
  - Make `streamOnEvent` async: rejected — it's called from synchronous provider event handlers; making it async would require changes to every provider.
- **Verification**: `tsc --noEmit` exits 0 with no errors.
- **Follow-ups**: None. Both the happy path (done) and error path now attempt extraction. The await ensures the write completes before the function returns.

## 2026-04-24 session-3 — Ollama endpoint not configurable (stream stopped immediately)

- **Context**: After the extraction fixes, the stream "stopped right away." Ollama runs on a remote machine at `100.107.130.92`, but `OllamaCodeClient` defaulted to `127.0.0.1:11434`. `OLLAMA_HOST` env var was not set. Connection refused → immediate error → no output.
- **Decision**: Made the Ollama endpoint configurable through the Settings UI:
  1. `OllamaCodeClient` constructor now accepts `configBaseUrl` parameter (priority: config > env > default)
  2. Added `setBaseUrl()` / `getBaseUrl()` methods for runtime updates without restart
  3. Added `OllamaEndpointField` component to the Settings provider card — inline input with Save button
  4. `ProviderRegistry.updateProviderConfig` detects `baseUrl` changes on Ollama providers and calls `setBaseUrl()` + auto-refreshes models via `/api/tags`
  5. Ollama provider is now **always registered** at startup (even when unreachable) so the Settings card appears and the user can configure the endpoint
  6. `fetchOllamaModels` now uses the HTTP API (`/api/tags`) first, falling back to CLI — works for remote Ollama instances
- **Alternatives considered**:
  - Require `OLLAMA_HOST` env var: rejected — GUI app users shouldn't need to set env vars
  - Add `.env` file support: heavier, less discoverable than a UI field
- **Verification**: `tsc --noEmit` exits 0.
- **Follow-ups**: None. The user can now set `http://100.107.130.92:11434` in Settings → Ollama CLI → Endpoint, save, and models will auto-populate.

## 2026-04-24 session-4 — Multi-call orchestration for pipeline agents

- **Context**: Ollama stalls at turn 7/50 during Lumen's Second Assessment on a 102K-word manuscript (1.49M tokens in context). Each pipeline agent (Ghostlight, Lumen, Sable) currently reads the entire manuscript and produces a complete report in a single CLI call. For Ollama models (especially 36B+), the context grows with every tool-call read until the model chokes.
- **Decision**: Implement a hybrid multi-call system (Option C):
  1. **Automatic orchestrator** — `MultiCallOrchestrator` breaks each agent's work into 3–6 sequential `sendMessage` calls with bounded context. Each sub-call writes intermediate findings to `source/.scratch/`. The final synthesis call reads all scratch files and writes the real output file.
  2. **Granular quick actions** — Each sub-step is also exposed as a standalone quick action (e.g. "Pass 2: Continuity" for Sable) so users can run individual passes manually if the orchestrator stalls.
  3. Splits: Sable → 6 steps (5 audit passes + synthesis), Lumen → 4 steps (3 lens groups + synthesis), Ghostlight → 3 steps (2 chapter batches + synthesis). Forge stays single-call (already small).
- **Alternatives considered**:
  - Option A (orchestrator only): rejected — no manual fallback if orchestrator stalls
  - Option B (quick actions only): rejected — too many clicks for routine use, no automation
  - Chunking by chapter count within a single call: rejected — doesn't reduce context; the model still accumulates all prior tool results in its conversation
- **Verification**: `npm run lint` exits 0. All tasks T-O1 through T-U2 complete. Phases 1–4 DONE. Phase 5 (E2E testing) remains TODO.
- **Follow-ups**: T-P1 (Ollama E2E test), T-P2 (Claude CLI E2E test)

### Implementation summary:
- `src/domain/types.ts`: Added `MultiCallStep` type and `multiCallProgress` StreamEvent variant
- `src/domain/constants.ts`: Added `AGENT_MULTI_CALL_STEPS` registry, `MULTI_CALL_SCRATCH_DIR`, step schemas for Sable (6), Lumen (4), Ghostlight (3), granular quick actions for all three agents
- `src/application/MultiCallOrchestrator.ts`: New service — runs sequential sub-calls, emits progress events, computes word-count-based chapter batches for Ghostlight, cleans up scratch files after synthesis
- `src/application/ChatService.ts`: Routes pipeline conversations through orchestrator when agent has multi-call steps and conversation is empty
- `src/renderer/stores/streamHandler.ts`: Added `onMultiCallProgress` callback
- `src/renderer/stores/chatStore.ts`: Added `multiCallProgress` state, wired to handler and reset on done
- `src/renderer/components/Chat/StreamingMessage.tsx`: Progress bar UI with step label and fraction

## 2026-04-24 session-5 — Hot Take multi-call sipping for Ollama

- **Context**: Hot Take was broken on Ollama. HotTakeService hardcoded `HOT_TAKE_MODEL` (Opus) and used a single massive call. Ollama models choke on 100K+ word manuscripts in one context window.
- **Decision**: Split HotTakeService into two modes:
  1. **Claude CLI** → unchanged single call with Opus (200K context handles it fine)
  2. **Ollama / non-Claude-CLI** → multi-call sipping: chapters batched at ~25K words, each batch writes a tracker to `source/.scratch/hot-take-batch-N.md`, final synthesis call reads all trackers and produces the 5-paragraph hot take in chat. Uses the user's selected model, not Opus.
- **Alternatives considered**:
  - Route through `MultiCallOrchestrator`: rejected — hot take is chat-only (no output file), uses different tone instructions (HOT-TAKE.md), and has fundamentally different synthesis (5 paragraphs, no structured report). Keeping it in HotTakeService avoids polluting the pipeline orchestrator with special cases.
  - Always use multi-call for all providers: rejected — Opus handles single-call fine and produces a more cohesive gut reaction from an unbroken read.
- **Verification**: `npm run lint` exits 0. `tsc --noEmit` clean.
- **Follow-ups**: T-P3 added to PLAN.md (marked DONE). Needs manual E2E testing with Ollama (T-P1 scope).

## 2026-04-24 session-6 — Lumen sip-and-track: separate reading from analysis

- **Context**: Lumen's 4-step schema had each lens group reading the full manuscript (~102K words). On Ollama (qwen3.6), the model stalled at turn 6 with ~228K tokens of accumulated context — the same bottleneck the multi-call system was supposed to fix. Each lens step said "Read the full manuscript" so the split into 4 steps didn't reduce per-call context at all.
- **Decision**: Refactored Lumen to use the same sip-and-track pattern as Ghostlight:
  1. **Dynamic read batches** (2 template steps, expanded to N by word count): Read chapters in ~25K-word batches, producing structured tracking notes to `source/.scratch/lumen-read-N.md`. Notes capture: premise signals, protagonist arc beats, cast function, pacing data, scene purposes, prose/craft observations, thematic markers, and key quotes.
  2. **Lens analysis steps** (3 static steps): Work from tracking notes only — never re-read chapters. Use `{{READ_TRACKER_FILES}}` placeholder replaced by orchestrator with explicit batch file list.
  3. **Synthesis** (unchanged): Reads lens analysis scratch files, writes `source/dev-report.md`.
  
  Also refactored `expandDynamicSteps` to be **template-preserving**:
  - Uses each agent's own prompt templates (not hardcoded Ghostlight text)
  - Clones first template for batch 1, subsequent template for batches 2+
  - Adjusts scratch file references via `replaceAll` (higher numbers first to avoid collision)
  - Replaces `{{READ_TRACKER_FILES}}` in static steps with explicit batch file list
  - Detects Ghostlight vs Lumen synthesis pattern by checking if synthesis prompt references read batch files
  - Fixed ordering: read batches → static analysis steps → synthesis (was wrong before for agents with static steps)
- **Alternatives considered**:
  - Keep 4-step schema with lower `maxTurns`: rejected — the model stalls on context size, not turn count
  - Split each lens into its own manuscript read: rejected — 3× redundant reading, worse quality due to fragmented analysis
  - Generate agent-specific prompts in orchestrator: rejected — brittle, hardcodes agent knowledge in infrastructure. Template-preserving approach keeps prompts in constants.ts where they belong
- **Verification**: `tsc --noEmit` clean. `npm run lint` clean. For 102K words: 5 read batches + 3 lens analyses + 1 synthesis = 9 steps, each under ~50K tokens.
- **Follow-ups**: T-P1 (E2E Ollama test) — re-run Lumen assessment to verify the sip-and-track schema completes without stalling.

## 2026-04-26 session-7 — Sable sip-and-track: separate reading from analysis

- **Context**: Sable's 6-step schema had each of 5 audit passes reading the entire manuscript. On Ollama, this causes the same context explosion that was fixed for Lumen in session-6 — each pass accumulates 100K+ words of chapter content in the context window. The multi-call split provided no actual context reduction since every pass still said "Read the manuscript chapters."
- **Decision**: Refactored Sable to the sip-and-track pattern (matching Lumen and Ghostlight):
  1. **Dynamic read batches** (2 template steps, expanded to N by word count): Read chapters in ~25K-word batches, tracking ALL 5 copy-edit categories per chapter: style sheet items, continuity flags, grammar/mechanics, repetition/word-level, and formatting issues. Write to `source/.scratch/sable-read-N.md`.
  2. **Three analysis passes** (static steps, work from tracking notes only — never re-read chapters):
     - Analysis 1: Style Sheet Construction + Continuity Audit (builds `source/style-sheet.md`)
     - Analysis 2: Grammar & Mechanics + Repetition (with crutch word frequency counts)
     - Analysis 3: Formatting & Production
     Uses `{{READ_TRACKER_FILES}}` placeholder replaced by orchestrator.
  3. **Synthesis** (unchanged pattern): Reads 3 analysis files, writes `source/audit-report.md`.
  
  Also updated quick actions to match the new sip-and-track structure (read halves + 3 analysis passes + synthesis).
- **Alternatives considered**:
  - Keep 5-pass schema with dynamic reads per pass: rejected — 5× redundant reading (each pass would re-read the same batches), and the analysis categories are lightweight enough to combine into 3 groups
  - Single analysis pass after reading: rejected — too much content to consolidate in one call; 3 focused analysis groups keeps each call bounded
  - Exact 5 analysis groups (one per original pass): rejected — unnecessary granularity; style+continuity and grammar+repetition are natural pairs that benefit from cross-referencing
- **Verification**: `tsc --noEmit` clean. `npm run lint` clean. For 102K words: ~4 read batches + 3 analysis passes + 1 synthesis = 8 steps, each under ~50K tokens.
- **Follow-ups**: T-P1 (E2E Ollama test) — re-run Sable copy edit to verify the sip-and-track schema completes without stalling.

## 2026-04-27 session-8 — Forge 2-step multi-call: write both files reliably

- **Context**: Forge produces two output files (`source/project-tasks.md` and `source/revision-prompts.md`). Previously excluded from multi-call orchestration, it relied on a fragile regex-based `splitResponseByFiles` extraction when running on providers without tool-use (Ollama, llama-server). This was inconsistent — the split depended on the model emitting a heading matching the secondary filename.
- **Decision**: Added Forge to `AGENT_MULTI_CALL_STEPS` with a 2-step schema:
  1. **Build Task List** (maxTurns 15): reads diagnostic reports + reference docs → writes `source/project-tasks.md`
  2. **Write Session Prompts** (maxTurns 20, synthesis): reads task list + reports → appends session map & checklist to `project-tasks.md`, writes `source/revision-prompts.md`
  Each step gets the orchestrator's file-existence verification after completion, matching the same reliability pattern as Sable/Lumen/Ghostlight. No scratch files needed — both outputs are real files. Cleanup is a no-op (no scratch files to delete).
- **Alternatives considered**:
  - Keep single-call + improve splitResponseByFiles regex: rejected — inherently fragile; depends on model formatting a heading a specific way. The orchestrator's per-step verification is strictly more reliable.
  - 3 steps (separate session map from prompts): rejected — the session map is appended to `project-tasks.md` (same file as step 1), and prompts need the map for context. Two steps is the natural split.
- **Verification**: `tsc --noEmit` clean. `npm run lint` clean.
- **Follow-ups**: T-P1/T-P2 (E2E tests) — verify Forge pipeline produces both files on Ollama and Claude CLI.
