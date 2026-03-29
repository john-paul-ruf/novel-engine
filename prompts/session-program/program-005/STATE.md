# State Tracker — Novel Engine / book-switch-resilience

> Generated 2026-03-29.
> Updated by the executing agent after each session.

---

## Program

**Name:** Novel Engine
**Root:** /Users/the.phoenix/WebstormProjects/novel-engine/
**Stack:** TypeScript 5, Electron 33, React 18, Tailwind CSS v4, Zustand, better-sqlite3, Claude Code CLI

## Feature

**Name:** book-switch-resilience
**Intent:** Fix P0 regressions: auto-draft lost on book switch, active book not highlighted prominently, switching books kills user-initiated chat sessions.
**Source documents:** `p0.md`
**Sessions:** 3

---

## Status Key

- `pending` — Not started
- `in-progress` — Started, not verified
- `done` — Completed and verified
- `blocked` — Cannot proceed (see notes)
- `skipped` — Intentionally skipped (see notes)

---

## Session Status

| # | Session | Modules | Status | Completed | Notes |
|---|---------|---------|--------|-----------|-------|
| 1 | SESSION-01 — Active Book Highlight — Bright Orange | M10 | done | 2026-03-29 | Blue→orange in BookPanel + SeriesGroup |
| 2 | SESSION-02 — Preserve User Sessions on Book Switch | M10 | done | 2026-03-29 | switchBook: no abort, per-book convo memory, removed navigate('chat'), eliminated all old localStorage key refs |
| 3 | SESSION-03 — Auto-Draft Recovery on Book Switch | M10 | done | 2026-03-29 | Auto-draft stream marked 'external' on recovery; reconnect() method added; bookStore calls reconnect after switchBook |

---

## Dependency Graph

```
SESSION-01 (visual fix — standalone)

SESSION-02 (switchBook overhaul)
  └── SESSION-03 (auto-draft recovery)
```

**SESSION-01** is independent — pure CSS/styling change.
**SESSION-03** depends on SESSION-02 — builds on the revised switchBook logic.

---

## Architecture Reference

> Full stack, conventions, and architecture rules are in `/Users/the.phoenix/WebstormProjects/novel-engine/FORGE-CONFIG.md`.

### Feature-specific notes

- **All changes are renderer-only (M10).** No backend/IPC/domain changes needed.
- **BookPanel.tsx** and **SeriesGroup.tsx** both render book items — both need the orange highlight treatment.
- **chatStore.switchBook()** is the critical method — currently navigates to 'chat', aborts user streams, and clears all state. Needs to be reworked to preserve per-book state.
- **autoDraftStore** runs per-book loops via `sessions: Record<string, AutoDraftSession>`. The loops survive book switches (they use IPC directly), but the chatStore visual connection is lost.
- **viewStore** now has `'revision-queue'` removed (program-004 SESSION-07 done). Version is 4.
- **bookStore.setActiveBook()** navigates to `'dashboard'` after switchBook completes. This is the final navigation target.

---

## Scope Summary

| ID | Module | Impact | Sessions |
|----|--------|--------|----------|
| `M10` | renderer | Modified: `BookPanel.tsx` (active book orange highlight), `SeriesGroup.tsx` (active book orange highlight), `chatStore.ts` (non-destructive switchBook), `bookStore.ts` (remove redundant navigate), `autoDraftStore.ts` (reconnect on book switch) | SESSION-01, SESSION-02, SESSION-03 |

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Use orange-500 border + orange-950/20 background for active book | User explicitly requested "bright-ish orange." Orange-500 stands out against the zinc dark theme while orange-950/20 gives a subtle warm background. |
| Stop aborting user-initiated streams on book switch | The main process CLI calls continue regardless — aborting them just loses the user's work. Instead, let them run and recover visually when switching back. |
| Navigate to 'dashboard' on book switch (not 'chat') | Keep the program-004 behavior where dashboard is the landing view. The user's chat session for the new book is preserved and accessible via the Chat nav. |
| Per-book conversation memory in localStorage | Store the active conversation ID per book slug so switching back restores the exact conversation, not just "most recent." |
| Auto-draft visual reconnection via chatStore.attachToExternalStream | When switching to a book with a running auto-draft, the chatStore should detect it and reconnect the streaming UI to the active auto-draft call. |

---

## Handoff Notes

> Agents write here after each session to communicate context to the next run.

### Last completed session: SESSION-03

**SESSION-01:** Pure styling change — swapped `blue-500`/`blue-950` to `orange-500`/`orange-950` in BookPanel.tsx (standalone books) and SeriesGroup.tsx (series container border + individual volume active state).

**SESSION-02:** Major switchBook rewrite. Removed stream abort on book switch — CLI calls now continue on main process. Replaced the single `novel-engine-active-conversation` localStorage key with per-book `novel-engine-convo:{bookSlug}` keys. Updated all 5 methods that touch localStorage (loadConversations, createConversation, setActiveConversation, deleteConversation, switchBook). Removed the navigate('chat') call from switchBook — navigation is handled by bookStore's navigate('dashboard'). Removed the unused `useViewStore` import.

**SESSION-03:** Added `useAutoDraftStore` import to chatStore. In switchBook's stream recovery block (Step 4), after recovering an active stream, checks if auto-draft is running for that book and marks `_streamOrigin: 'external'`. Added `reconnect(bookSlug)` method to autoDraftStore that switches chatStore to the auto-draft conversation if the user returns to a book with a running loop. bookStore.setActiveBook now calls `autoDraftStore.reconnect(slug)` after switchBook and navigation complete. Import chain: `bookStore → autoDraftStore → chatStore` — no cycles.
