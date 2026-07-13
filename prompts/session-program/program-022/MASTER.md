# Forge Build — Novel Engine / web-search-all-providers

## Program
- **P_NAME**: Novel Engine
- **P_SLUG**: novel-engine
- **F_NAME**: web-search-all-providers
- **Directory**: `prompts/session-program/program-022/`

## Protocol — Each iteration:
1. Read FORGE-CONFIG.md (registry, stack, conventions, verification) — **not present**, see project `AGENTS.md` + `docs/architecture/` for conventions
2. Read `prompts/session-program/program-022/STATE.md` (done, pending, blocked)
3. Pick next pending session whose dependencies are all done
4. Read `prompts/session-program/program-022/SESSION-NN.md` fully + Module Context files
5. Read affected files before modifying
6. Execute precisely. Follow conventions.
7. Verify — session checks + `npm run lint` (tsc --noEmit)
8. Update `prompts/session-program/program-022/STATE.md` (status, date, notes, handoff)
9. Update architecture docs per `AGENTS.md` workflow (only what changed)
10. Commit (format from `AGENTS.md` changelog rules — append CHANGELOG.md entry)
11. Loop. All done → Final Report.

## Crash Recovery
- Read STATE.md → check in-progress/pending
- Read Handoff Notes + git status/log
- Partial session: complete remaining or `git reset --hard HEAD` and restart
- Update STATE.md before stopping (voluntary or forced)

## Stopping Conditions
- All done → Final Report
- Blocked → set blocked, skip to next eligible
- Context limit → update STATE.md + Handoff Notes
- User input needed → set blocked with question

## Final Report
Summary, sessions done/total, files created/modified, architecture impact, verification, follow-up.

## Sessions

| # | Title | Modules | Depends | Est |
|---|-------|---------|---------|-----|
| 01 | WebSearch tool definition + executor for Ollama/llama-server | M06 | — | 15 min |
| 02 | Codex CLI: enable standalone_web_search + parse web_search events | M05 | — | 15 min |
| 03 | Docs + changelog | M06, M05 | 01, 02 | 10 min |

01 and 02 are independent — can be executed in parallel. 03 depends on both.