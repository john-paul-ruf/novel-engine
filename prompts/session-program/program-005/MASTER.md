# MASTER — P0 Hotfix: Book-Switch Resilience & Active Book UX

> **Program:** 005
> **Feature:** book-switch-resilience
> **Priority:** P0 — Panic fix
> **Created:** 2026-03-29

---

## Intent

Three critical regressions/UX failures reported:

1. **Auto-draft lost on book switch** — Switching books while auto-draft is running disconnects the UI from the running loop. When the user switches back, the visual state isn't recovered correctly.
2. **Active book not visually obvious** — The current blue highlight on the selected book in the bookshelf is too subtle. Users can't tell which book they're working on at a glance. Needs bright orange treatment.
3. **Switching books kills user-initiated sessions** — `switchBook()` in chatStore aggressively aborts user-initiated streams and clears all chat state. Users lose their in-flight conversations.

---

## Source

- `prompts/session-program/program-005/input-files/p0.md`

---

## State Tracker

- `prompts/session-program/program-005/STATE.md`

---

## Sessions

| # | File | Title | Modules |
|---|------|-------|---------|
| 1 | `prompts/session-program/program-005/SESSION-01.md` | Active Book Highlight — Bright Orange | M10 (renderer) |
| 2 | `prompts/session-program/program-005/SESSION-02.md` | Preserve User Sessions on Book Switch | M10 (renderer) |
| 3 | `prompts/session-program/program-005/SESSION-03.md` | Auto-Draft Recovery on Book Switch | M10 (renderer) |

---

## Execution Order

```
SESSION-01 (visual fix — independent)
SESSION-02 (switchBook overhaul)
  └── SESSION-03 (auto-draft recovery — depends on SESSION-02's switchBook changes)
```

SESSION-01 is independent and can run in parallel with SESSION-02.
SESSION-03 must run after SESSION-02.

---

## Verification

After all sessions:

```bash
npx tsc --noEmit
```

Manual QA:
1. Active book in bookshelf should have a bright orange left border and subtle orange background — clearly visible at a glance.
2. Start chatting with an agent on Book A. Switch to Book B. Switch back to Book A — the conversation should be restored, and if the stream was still running, it should resume visually.
3. Start auto-draft on Book A. Switch to Book B. Switch back to Book A — auto-draft status should be visible and the loop should still be running.
4. Start auto-draft on Book A, start chatting on Book B — both should proceed without interference.
