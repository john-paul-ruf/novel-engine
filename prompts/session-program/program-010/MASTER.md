# Forge Build — Novel Engine / streamlined-workspace-ui

> Converts the current renderer UI to the **Streamlined Workspace** design:
> icon rail + pipeline-as-navigation + split chat/manuscript workbench +
> bottom activity drawer + command palette.
>
> Design reference (open in a browser while working):
> `design/ui-redesign/mockups/streamlined-workspace/index.html`
> Scope authority: `prompts/session-program/program-010/input-files/coverage-matrix.md` (66 features, all mapped)

## Protocol — Each iteration:

1. Read `FORGE-CONFIG.md` (module registry, stack, conventions, verification)
2. Read `prompts/session-program/program-010/STATE.md` (done, pending, blocked)
3. Pick the next `pending` session whose dependencies are all `done`
4. Read `prompts/session-program/program-010/SESSION-NN.md` fully + the Module Context files it lists
5. Read every affected file before modifying it
6. Execute precisely. Follow conventions (Tailwind v4 classes, Zustand patterns, `window.novelEngine` bridge only)
7. Verify — run session verification + `npx tsc --noEmit` + architecture compliance from FORGE-CONFIG
8. Update STATE.md (status, date, notes, handoff)
9. Update architecture docs if a module's public API changed
10. Commit: `feat(streamlined-ui): SESSION-NN — {title}`
11. Loop. All sessions done → Final Report.

## Global Rules for This Program

- **The app must boot after every session.** Old and new UI coexist during the migration; legacy views stay routable until SESSION-14 removes them.
- **No behavior regressions.** Every feature move is listed in `input-files/coverage-matrix.md`. If a session displaces a feature, its new entry point must work before the old one is deleted.
- **Reuse over rewrite.** Chat internals (MessageList, StreamingMessage, ThinkingBlock), MotifLedgerView, FileEditor, RevisionQueue, Import/Series wizards, Settings and Statistics internals are moved/embedded, not rebuilt.
- **All views stay mounted** (hidden via CSS) to preserve stream listeners and scroll — mirror the existing `ViewContent` pattern in `src/renderer/components/Layout/AppLayout.tsx`.
- **No emoji icons** in new components — inline SVG (Lucide-style, 1.5px stroke) via the shared `Icon` component created in SESSION-03.
- **Both themes.** New tokens must work in dark AND light mode (`.dark` class variant, see `src/renderer/styles/globals.css`).

## Crash Recovery

- Read STATE.md → check `in-progress` / `pending`
- Read Handoff Notes + `git status` / `git log --oneline -5`
- Partial session: complete the remaining steps, or `git reset --hard HEAD` and restart the session
- Update STATE.md before stopping (voluntary or forced)

## Stopping Conditions

- All sessions done → Final Report
- Blocked → set session `blocked` with reason, skip to next eligible session
- Context limit → update STATE.md + Handoff Notes, stop cleanly
- User input needed → set `blocked` with the specific question

## Phases

| Phase | Sessions | Goal |
|-------|----------|------|
| A — Foundation | 01–05 | Tokens, routing, rail, palette, status bar/drawer — shell in place, legacy views intact |
| B — Screens | 06–11 | Library, pipeline spine, workbench split, companion, manuscript |
| C — Consolidation | 12–14 | Exports/stats/settings routing, pitch room + modal actions, legacy removal + tours |

## Final Report

When all sessions are done, produce: summary, sessions done/total, files created/modified/deleted,
coverage-matrix audit (every row's new home verified), verification results (`npx tsc --noEmit`, `npm start` smoke test),
and follow-up recommendations.
