# Tracked Chapter Editing — Design Proposal (Input Document)

> Source: Forge design conversation, 2026-07-07. Approved by user ("do it").

## Problem

Verity-authored chapter drafts (`chapters/NN-slug/draft.md`, N ≥ 2) are read-only in the
Manuscript editor (`isVerityDraft()` gate in `ManuscriptView.tsx`). The user wants to edit
chapters directly — but every change must be **tracked and made visible to the AI** so
Verity respects (or deliberately reworks) user edits during subsequent revisions.

## Existing Infrastructure (reuse, don't rebuild)

- `VersionService` (application) — SQLite snapshots with `source: 'user' | 'agent' | 'revert'`,
  hash dedup, structured diff, revert. `files:write` IPC already snapshots as `'user'`;
  the book watcher snapshots agent writes as `'agent'` (`src/main/index.ts:702`).
- `DiffViewer`, `VersionHistoryPanel`, `FileEditor` renderer components.
- `ContextBuilder` assembles agent system prompts; consumed by `ChatService`,
  `MultiCallOrchestrator`, `RevisionQueueService`.

## Core Design: Agent Baseline + User Delta

The **latest `source='agent'` snapshot is the baseline**. Diff(baseline → current disk
content) = the user's edits. Cycle is self-resetting: when Verity next writes the chapter,
her new agent snapshot becomes the baseline and prior user edits are considered absorbed.

Flow:

1. Verity writes draft → snapshot saved as agent baseline
2. User edits chapter in Editor → save creates user snapshot (already automatic)
3. Rail shows an EDITED badge; user can view/discard their delta
4. When Verity next touches the chapter, her context includes the user-edit diff with a
   preserve-by-default instruction
5. Verity's new draft becomes the new baseline (automatic via watcher snapshot)

## Confirmed Design Decisions

1. **Derive edits from version history** — no new storage (no edits.md, no new table).
   Mitigation for pruning: pin the latest `agent` snapshot during prune so the baseline
   is never deleted.
2. **Preserve-by-default policy** — Verity is instructed to keep author edits unless the
   revision request explicitly asks to rework them, and to call out conflicts.
3. **Scope: chapters only** (`chapters/NN-slug/draft.md`). Source files stay as they are.

## Feature Components

- **Domain**: `ChapterEditStatus` type.
- **Application**: `VersionService.getUserEditsSinceAgentBaseline()`,
  `getChapterEditStatuses()`, `buildAuthorEditsSection()`; prune pinning.
- **Database**: latest-version-by-source query; prune SQL that pins latest agent version.
- **IPC/preload**: expose the two new queries on `window.novelEngine.versions`.
- **Renderer**: unlock editor with tracked-edit banner, "View my changes" diff modal,
  "Discard my edits" revert-to-baseline, EDITED rail badges, concurrency guard
  (read-only while agent is active for this book), reload-on-external-change.
- **AI context**: `ContextBuilder.build()` accepts an `authorEditsSection`; injected by
  ChatService, MultiCallOrchestrator, RevisionQueueService.
