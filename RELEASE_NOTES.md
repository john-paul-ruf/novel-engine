# Release Notes - v0.7.0

v0.5.4 (2026-03-25) to v0.7.0 (2026-03-28) | 73 commits | 218 files

## Highlights

Multi-model provider support, content version control, massive architecture cleanup.

## Features

- Multi-model provider architecture - Pluggable AI providers. Settings UI.
- Content version control - SHA-256 snapshots. Diff viewer. One-click revert.
- Catalog export - ZIP archive of all books.
- Pitch room history - Persistent conversations.

## Improvements

- Verity pipeline decomposition - 8 purpose-built sub-agents.
- Auto-draft orchestration - Phase-complete gating, progress UI.
- Phrase to motif consolidation - Eliminated phrase ledger.
- Forge agent overhaul - +309 lines of instructions.
- Kill CLI on demand, thinking budget correction.

## Bug Fixes

- Motif Ledger data loss from bad JSON repair regex. Fixed.
- Audit Log tab crash from agent data shape mismatch. Normalized.
- Hot Take button hidden after auto-draft. Added fileRevision sub.
- MotifLedgerView startup crash. Added optional chaining guards.
- BookSelector nested button DOM violation. Fixed.
- SystemsTab crash on undefined components. Guarded.
- Pitch room send bug, sandbox issues, startup bug. All fixed.

## Refactoring

- ChatService decomposition (r001) - 1,218 to 403 lines. 5 extracted services.
- Stream architecture fixes (r002) - 9 fixes. Shared stream handler.
- Race condition fixes (r003) - 8 fixes. DB batching. StreamEventSource.
- Database migration system. Agent filename standardization.
- Stream router eliminated - replaced by streamHandler.ts factory.

## Infrastructure

- Prompt directory reorganization into build-out/arch/feature/meta.
- 5 meta-prompts: intake, release-notes, repo-eval, update-website, address-issues.
- New deps: diff + @types/diff.

## Documentation

- 6 architecture docs covering all 5 layers.
- 6-page GitHub Pages website.
- README full rewrite from codebase analysis.

## Breaking Changes

- IChatService.sendMessage returns { changedFiles } instead of void.
- IChatService.getLastChangedFiles() removed.
- IPC rename: verity:runPhraseAudit to verity:runMotifAudit.
- Schema v2: New file_versions table. Auto-migrates.
- AppSettings extended with providers and activeProviderId.
- All services use IProviderRegistry instead of IClaudeClient.

## Upgrade Notes

1. Database migration runs automatically. Non-destructive.
2. Agent files updated via bootstrap. No overwrite of customizations.
3. Settings migration transparent. Missing fields filled from defaults.
4. Phrase ledger deprecated. Migrate to motif-ledger.json if desired.
5. Pull, npm install (for diff package), and rebuild.

---

Suggested version: v0.7.0
Reason: Multiple new features with internal breaking changes. Minor bump.
