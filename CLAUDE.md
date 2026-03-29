# Novel Engine — Project Memory

## Session Program Output Directory

When writing a session program (MASTER.md + STATE.md + SESSION-NN.md files), **always** write to:

```
prompts/session-program/program-NNN/
```

To determine NNN: `ls prompts/session-program/` → find the highest `program-NNN` → increment by 1. Start at `001` if none exist.

Source/input files that the program was built from go in:
```
prompts/session-program/program-NNN/input-files/
```

Internal path references inside MASTER.md must point to `prompts/session-program/program-NNN/STATE.md` and `prompts/session-program/program-NNN/SESSION-NN.md`.

**Never write programs to** `prompts/feature-requests/`, `prompts/feature/`, or any other path.

---

## FORGE-CONFIG.md

Project-level Forge configuration lives at `FORGE-CONFIG.md` (project root). Read it at the start of every Forge run. It contains the module registry, conventions, verification commands, and architecture rules for Novel Engine.
