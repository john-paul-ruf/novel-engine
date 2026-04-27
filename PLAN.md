# Goal

Break the heavy single-call pipeline agents (Ghostlight, Lumen, Sable, Forge) into multiple smaller CLI calls with automatic orchestration, plus expose granular quick actions as a manual fallback.

"Done" looks like: when the user clicks a pipeline quick action (e.g. "Copy edit" for Sable), the system automatically breaks the work into 3–6 sequential smaller calls — each with a bounded context — and chains them together. The user sees sub-step progress in the chat UI (e.g. "Sable: Pass 2/5 — Continuity"). Each sub-call writes intermediate results to `source/.scratch/` and the final call synthesizes them into the expected output file. The pipeline phase detection still works identically. Additionally, each sub-step is exposed as its own quick action so the user can run individual passes manually.

# Non-goals

- Do NOT change the pipeline phase detection logic (`PipelineService.isPhaseComplete`).
- Do NOT change how Claude CLI works — orchestration is provider-agnostic (benefits both Claude CLI and Ollama).
- Do NOT break existing single-call behavior — if the user types a freeform message, it still goes as one call.
- Do NOT change the agent system prompt files (`agents/*.md`) — orchestration is layered on top.
- Do NOT touch the revision queue or auto-draft flows — those already have their own multi-call orchestration.

# Constraints

- Scratch files go in `source/.scratch/` and are cleaned up after the final synthesis call writes the real output.
- Each sub-call must be a standalone `sendMessage` invocation so it gets its own context window, token tracking, and abort support.
- The orchestrator must handle partial failure gracefully: if call 3/5 fails, scratch files from calls 1–2 survive so the user can resume or retry.
- Sub-calls share the same conversation so the user sees the full flow in chat history.
- Must work for both Claude CLI and Ollama providers (the whole point is smaller contexts).
- Keep `maxTurns` per sub-call low (5–10) since each sub-call has a focused task.

# Task DAG

## Phase 1: Orchestration Infrastructure

### T-O1: Define multi-call step schemas per agent
- **Outcome**: New constant `AGENT_MULTI_CALL_STEPS` in `src/domain/constants.ts` maps each agent to an ordered list of sub-steps. Each step has: `id`, `label` (for UI), `promptTemplate` (the sub-prompt text), `scratchFile` (where to write intermediate output), `maxTurns`, and `isSynthesis` (final step that writes to the real output file).
- **Verification**: `tsc --noEmit` exits 0. Pure data addition.
- **Files**: `src/domain/constants.ts`, `src/domain/types.ts`
- **Status**: DONE

### T-O2: MultiCallOrchestrator service
- **Outcome**: New file `src/application/MultiCallOrchestrator.ts` that accepts an agent name + book slug, looks up the step schema from T-O1, and runs each step as a sequential `sendMessage` call. Between steps it emits `multiCallProgress` events (`{ step: 2, totalSteps: 5, label: 'Continuity Pass' }`). Each step's prompt includes instructions to read scratch files from prior steps. The final synthesis step reads all scratch files and writes the real output file.
- **Verification**: Build passes. Service can be instantiated and called from ChatService.
- **Files**: `src/application/MultiCallOrchestrator.ts` (new)
- **Status**: DONE
- **Notes**: Depends on T-O1

### T-O3: Integrate orchestrator into ChatService
- **Outcome**: When `sendMessage` is called for a pipeline conversation whose agent has multi-call steps defined, ChatService delegates to `MultiCallOrchestrator` instead of making a single call. The decision is based on whether `AGENT_MULTI_CALL_STEPS[agentName]` exists. Non-pipeline conversations and agents without steps (Spark, Quill) bypass the orchestrator.
- **Verification**: Build passes. A pipeline Sable conversation routes through the orchestrator.
- **Files**: `src/application/ChatService.ts`
- **Status**: DONE
- **Notes**: Depends on T-O2

### T-O4: Scratch file cleanup
- **Outcome**: After the synthesis step succeeds (and the real output file is verified to exist), the orchestrator deletes `source/.scratch/` contents for this agent run. If the synthesis step fails, scratch files are preserved. Add `source/.scratch/` to `.gitignore` patterns.
- **Verification**: After a successful multi-call run, `source/.scratch/` is empty. After a failed run, scratch files persist.
- **Files**: `src/application/MultiCallOrchestrator.ts`, file system operations
- **Status**: DONE
- **Notes**: Depends on T-O2. Cleanup implemented in MultiCallOrchestrator.cleanupScratchFiles()

## Phase 2: Agent Step Definitions

### T-S1: Sable (Copy Edit) — sip-and-track schema
- **Outcome**: Sable uses the same sip-and-track pattern as Lumen/Ghostlight. Dynamic read batches (~25K words each) scan chapters and track ALL copy-edit categories per chapter to `source/.scratch/sable-read-N.md`. Three analysis passes work from tracking notes only (never re-read chapters): (1) Style Sheet & Continuity → `sable-analysis-1.md`, (2) Grammar & Repetition → `sable-analysis-2.md`, (3) Formatting → `sable-analysis-3.md`. Synthesis reads the 3 analysis files and writes `source/audit-report.md` + updates `source/style-sheet.md`. Read batches have `dynamic: true` and use `{{CHAPTER_LIST}}` / `{{READ_TRACKER_FILES}}` placeholders.
- **Verification**: `tsc --noEmit` clean. `npm run lint` clean.
- **Files**: `src/domain/constants.ts`
- **Status**: DONE
- **Notes**: Depends on T-O1. Refactored from 5 full-manuscript passes to sip-and-track in session-7. See DECISIONS.md.

### T-S2: Lumen (Dev Editor) — sip-and-track schema
- **Outcome**: Define 7-step sip-and-track schema for Lumen: (1–2) Dynamic read batches (~25K words each) produce structural tracking notes to `source/.scratch/lumen-read-N.md`, (3) Lenses 1–3 analysis from tracking notes, (4) Lenses 4–5 analysis from tracking notes, (5) Lenses 6–7 analysis from tracking notes, (6–7) Synthesize full dev report. Read batches are expanded at runtime by word count (e.g. 102K words → 5 read batches → 9 total steps). Analysis steps use `{{READ_TRACKER_FILES}}` placeholder replaced by orchestrator with explicit batch file list.
- **Verification**: Schema compiles. `tsc --noEmit` clean. `expandDynamicSteps` correctly handles both Ghostlight and Lumen patterns.
- **Files**: `src/domain/constants.ts`, `src/application/MultiCallOrchestrator.ts`
- **Status**: DONE
- **Notes**: Depends on T-O1. Refactored `expandDynamicSteps` to be template-preserving (uses agent's own prompt text instead of hardcoded Ghostlight prompts). See DECISIONS.md session-6.

### T-S3: Ghostlight (First Read) — 3-step schema
- **Outcome**: Define 3 steps for Ghostlight: (1) Read chapters 1–N/2, tracking engagement/emotions/questions in scratch, (2) Read chapters N/2+1–N, continuing the tracker, (3) Synthesize reader report from both scratch files. The chapter split point is determined dynamically from the manifest at orchestration time.
- **Verification**: Schema compiles. Dynamic split logic works for books with 5, 15, and 30 chapters.
- **Files**: `src/domain/constants.ts`, `src/application/MultiCallOrchestrator.ts` (dynamic prompt building)
- **Status**: DONE
- **Notes**: Depends on T-O1, T-O2. Dynamic word-count-based chapter batching in computeChapterBatches()

### T-S4: Forge (Task Planner) — keep single call
- **Outcome**: Forge reads 2 small reports and produces 2 files. No multi-call needed. Explicitly document that Forge is excluded from orchestration.
- **Verification**: Forge still works as a single call.
- **Files**: Documentation only (comment in constants)
- **Status**: DONE

## Phase 3: Quick Actions (Manual Fallback)

### T-Q1: Add granular quick actions for Sable
- **Outcome**: Add per-pass quick actions to `AGENT_QUICK_ACTIONS.Sable`: "Pass 1: Style Sheet", "Pass 2: Continuity", "Pass 3: Grammar", "Pass 4: Repetition", "Pass 5: Formatting", "Synthesize Report". Each mirrors the sub-prompt from the orchestrator but can be triggered independently.
- **Verification**: Quick actions appear in the Sable dropdown. Each sends the correct prompt.
- **Files**: `src/domain/constants.ts`
- **Status**: DONE
- **Notes**: Depends on T-S1 (reuse the same prompt text)

### T-Q2: Add granular quick actions for Lumen
- **Outcome**: Add per-lens-group quick actions to `AGENT_QUICK_ACTIONS.Lumen`: "Lenses 1–3: Story Structure", "Lenses 4–5: Pacing & Scenes", "Lenses 6–7: Craft & Theme", "Synthesize Report". Plus keep existing single-call "Full assessment".
- **Verification**: Quick actions appear in the Lumen dropdown.
- **Files**: `src/domain/constants.ts`
- **Status**: DONE
- **Notes**: Depends on T-S2

### T-Q3: Add granular quick actions for Ghostlight
- **Outcome**: Add chunked-read quick actions to `AGENT_QUICK_ACTIONS.Ghostlight`: "Read first half", "Read second half", "Synthesize report". Plus keep existing "Read the manuscript" single-call.
- **Verification**: Quick actions appear in the Ghostlight dropdown.
- **Files**: `src/domain/constants.ts`
- **Status**: DONE
- **Notes**: Depends on T-S3

## Phase 4: UI — Sub-Step Progress

### T-U1: Add `multiCallProgress` stream event type
- **Outcome**: New stream event type `multiCallProgress` with `{ step: number, totalSteps: number, label: string }`. Emitted by the orchestrator before each sub-call starts.
- **Verification**: `tsc --noEmit` passes. Event type is in the StreamEvent union.
- **Files**: `src/domain/types.ts`
- **Status**: DONE

### T-U2: Display multi-call progress in chat UI
- **Outcome**: When a `multiCallProgress` event arrives, the chat shows an inline progress indicator (e.g. a step bar or label like "Step 2/5 — Continuity Pass"). Appears above the streaming response for each sub-call.
- **Verification**: Visual — progress indicator appears and updates during a multi-call run.
- **Files**: `src/renderer/components/Chat/StreamingMessage.tsx`, `src/renderer/stores/streamHandler.ts`, `src/renderer/stores/chatStore.ts`
- **Status**: DONE
- **Notes**: Depends on T-U1. Progress bar with step label + fraction indicator.

## Phase 5: Testing & Polish

### T-P1: End-to-end test with Ollama
- **Outcome**: Run Sable copy-edit via Ollama on a real book. All 6 sub-calls complete without stalling. Scratch files are created and cleaned up. `source/audit-report.md` exists with content from all 5 passes.
- **Verification**: `source/audit-report.md` has > 200 words. `source/.scratch/` is empty or absent.
- **Files**: None (manual test)
- **Status**: TODO
- **Notes**: Depends on T-O3, T-S1

### T-P2: End-to-end test with Claude CLI
- **Outcome**: Same test with Claude CLI to verify the orchestrator doesn't break the existing provider path.
- **Verification**: `source/audit-report.md` is produced. Pipeline advances.
- **Files**: None (manual test)
- **Status**: TODO

### T-P3: Hot Take multi-call sipping for Ollama
- **Outcome**: HotTakeService uses multi-call sipping when the active provider is not Claude CLI. Chapters are batched by word count (~25K/batch), each batch writes a tracker to `source/.scratch/hot-take-batch-N.md`, and a final synthesis call reads all trackers to produce the 5-paragraph hot take in chat. Uses the user's selected model, not hardcoded Opus. Claude CLI path unchanged (single call, Opus).
- **Verification**: `npm run lint` exits 0. Build passes.
- **Files**: `src/application/HotTakeService.ts`
- **Status**: DONE
- **Notes**: Follows same sipping pattern as MultiCallOrchestrator. Intermediate done/error events intercepted to prevent chatStore teardown.

# Open questions

*All resolved — see DECISIONS.md session-4.*

1. ~~**Chapter split strategy for Ghostlight**~~ → **Word count**. Split by cumulative word count targeting ~50K words per sub-call. More balanced than chapter count.
2. ~~**Existing conversation continuity**~~ → **Scratch files only**. Strip prior sub-call responses from conversation history. Each sub-call sees only the system prompt + its own task prompt + scratch file references. Clean up scratch files after successful synthesis.
3. ~~**Quick action vs. orchestrator routing**~~ → **Direct sendMessage**. Granular quick actions bypass the orchestrator entirely — they're plain messages sent through ChatService.
