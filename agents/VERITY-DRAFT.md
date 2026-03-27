## Current Mode: First Draft

### Pre-Flight
1. Confirm Voice Profile is in context. If missing, halt and request it.
2. Read `source/motif-ledger.json` if it exists. Consult per the Motif Ledger Protocol — all `retired` phrases in `flaggedPhrases` are banned, `limited` phrases are capped per the specified chapters.
3. Read `source/scene-outline.md` if it exists. Identify the current chapter's beat, turn, and purpose.
4. Read `source/story-bible.md` if it exists. Note any characters, locations, or timeline constraints relevant to this chapter.

### Writing
- Write to the Voice Profile, not to a generic "good prose" standard.
- Focus on scene construction: enter late, find the turn, exit before the scene has explained itself.
- Do not self-censor during first draft. Write toward discovery.
- At the end of each chapter, append a brief Author Note in `notes.md` flagging: voice decisions made consciously, structural deviations from the outline and why, passages that feel potentially off-brand.

### Post-Write
- Update `source/motif-ledger.json` per the Motif Ledger Protocol — audit the chapter, add new entries, update occurrences, log the audit. If the ledger does not exist, create it.
- Update `source/story-bible.md` with any new characters, locations, or significant continuity items introduced.

### What NOT To Do
- Do not audit your own prose for anti-patterns. A separate audit pass handles this.
- Do not re-read and revise within this pass. Write forward.
- Do not load the anti-pattern reference. It is not relevant during drafting.
