# Forge Build — Novel Engine / query-auto-populate

## Protocol — Each iteration:
1. Read FORGE-CONFIG.md (not applicable — no FORGE-CONFIG; use AGENTS.md conventions)
2. Read `prompts/session-program/program-021/STATE.md` (done, pending, blocked)
3. Pick next pending session whose dependencies are all done
4. Read `prompts/session-program/program-021/SESSION-NN.md` fully + Module Context files
5. Read affected files before modifying
6. Execute precisely. Follow conventions:
   - TypeScript strict mode
   - `@domain/`, `@infra/`, `@app/` path aliases
   - Zustand store pattern: `(set, get) => ({...})`
   - IPC handlers use `ipcMain.handle`, preload uses `ipcRenderer.invoke`
   - Tailwind v4 utility classes with `ne-*` custom color tokens
   - Components return `React.ReactElement`
7. Verify — `npx tsc --noEmit` + `npm run lint` + session-specific checks
8. Update `prompts/session-program/program-021/STATE.md` (status, date, notes, handoff)
9. Update architecture if new module or changed public API (AGENTS.md rules)
10. Commit (format: `feat(query): ...` or `fix(query): ...`)
11. Loop. All done → Final Report.

## Crash Recovery
- Read `prompts/session-program/program-021/STATE.md` → check in-progress/pending
- Read Handoff Notes + git status/log
- Partial session: complete remaining or `git reset --hard HEAD` and restart
- Update STATE.md before stopping (voluntary or forced)

## Stopping Conditions
- All done → Final Report
- Blocked → set blocked, skip to next eligible
- Context limit → update STATE.md + Handoff Notes
- User input needed → set blocked with question

## Final Report
Summary, sessions done/total, files created/modified, architecture impact, verification, follow-up

---

## Session Index

| # | Session | File | Modules | Depends | Est |
|---|---------|------|---------|---------|-----|
| 01 | Add WebSearch to CLI | `SESSION-01.md` | M-CLI | — | 15m |
| 02 | Domain types & interface | `SESSION-02.md` | M-DOMAIN | — | 20m |
| 03 | QueryService research + fill | `SESSION-03.md` | M-APP | 02 | 25m |
| 04 | IPC + preload bridge | `SESSION-04.md` | M-IPC, M-PRELOAD | 03 | 15m |
| 05 | queryStore actions | `SESSION-05.md` | M-RENDERER | 04 | 15m |
| 06 | ResearchPanel + View | `SESSION-06.md` | M-RENDERER | 05 | 20m |
| 07 | TargetCard AI buttons | `SESSION-07.md` | M-RENDERER | 05 | 20m |
| 08 | Quill prompt Phase 7 | `SESSION-08.md` | M-AGENTS | 03 | 15m |
| 09 | Documentation | `SESSION-09.md` | M-DOCS | 01–08 | 15m |

## Parallel Opportunities
- SESSION-01 and SESSION-02 have no dependencies → run in parallel
- SESSION-06 and SESSION-07 both depend only on SESSION-05 → run in parallel
- SESSION-08 depends on SESSION-03 (for prompt content) but can be drafted in parallel with 04–07