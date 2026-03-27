## Motif Ledger Protocol

The motif ledger (`source/motif-ledger.json`) is the canonical tracking system for literary motifs, structural devices, narrative foreshadowing, and flagged phrases.

---

### Structure

The ledger is a JSON file with seven sections:

- **systems** — Named motif systems grouping related entries (e.g., "The Teeth System: clicking/touching/counting/weight"). Each has an `arcTrajectory` describing how the system evolves across the book.
- **entries** — Character-owned motif instances. Each entry is tagged to a parent system via `systemId` (or `null` if standalone). Tracks `firstAppearance` and `occurrences` by chapter slug.
- **structuralDevices** — Compositional devices not owned by any character: countdowns, chapter-opening inventory paragraphs, POV rotation patterns, journal dual-voice framing. Each has a `pattern` field describing the exact form.
- **foreshadows** — Narrative debts. Threads planted in the text that haven't paid off yet. Status: `planted`, `paid-off`, or `abandoned`.
- **minorCharacters** — Low-bar catch-all for characters too small for full motif sections. One or two lines each. Prevents motifs from falling through the cracks.
- **flaggedPhrases** — Phrase-level repetition tracking. Categories: `retired` (banned), `limited` (capped usage), `crutch` (avoid, use alternatives), `anti-pattern` (banned construction). Rebuilt from ground truth by Lumen during assessments.
- **auditLog** — Records of which chapters have been audited against the ledger and what was found.

---

### Pre-Write: Consult the Ledger

Before writing or revising any chapter:

1. Read `source/motif-ledger.json` if it exists.
2. Note which **motif systems** are active and their arc trajectories. Your prose should advance these arcs — not repeat static instances.
3. Check **character entries** for the characters appearing in this chapter. Use their established motifs where dramatically appropriate. Don't force them.
4. Review **structural devices** to maintain compositional consistency.
5. Check **foreshadow entries** with status `planted` — if this chapter is the right moment for a payoff, deliver it.
6. Check **flagged phrases**:
   - `retired` — banned. Do not use.
   - `limited` — only in the chapters and counts noted.
   - `crutch` — avoid. Use the listed alternatives or invent new constructions.
   - `anti-pattern` — banned construction. Restructure any sentence that uses it.

---

### During Writing

When you notice yourself doing any of the following, continue writing — don't stop to update the ledger:

- Introducing a new recurring image, gesture, or phrase for a character
- Using a structural device
- Paying off or extending a foreshadowed thread
- Giving a minor character a motif moment

The post-write audit captures everything. Do not interrupt creative flow.

---

### Post-Write: Audit and Update

After completing a chapter draft or revision:

1. Re-read the chapter you just wrote with the ledger in mind.
2. Ask: **"What's in this chapter that isn't in the ledger?"**
3. For each new motif found:
   - If it belongs to an existing system, add an entry tagged to that system.
   - If it represents a new cluster of 2+ related images, create the system first, then add entries.
   - If it's a standalone character-specific image, add it with `systemId: null`.
4. Update `occurrences` arrays: for every existing entry that appeared in this chapter, add the chapter slug.
5. Check **minor characters**: if any non-section character did something with motif weight, add or update their `minorCharacters` entry.
6. Check **foreshadowing**: new planted threads get a foreshadow entry. Paid-off threads get status changed to `paid-off`.
7. Check **structural devices**: add the chapter slug to the device's `chapters` array if it was used. New devices get new entries.
8. Log the audit in `auditLog`.

---

### Ledger Format Rules

- IDs: short lowercase alphanumeric strings, 8–12 characters (e.g., `sys_k8m2p9r4`)
- When updating: read the current file, parse, modify, write the full JSON back.
- Never delete entries. If a motif is retired, note it in the entry's `notes` field.
- Don't create a system for fewer than 2 related entries.
- Don't add entries for one-off descriptions. The ledger tracks **patterns**, not every metaphor.

If the file doesn't exist, create it:

```json
{
  "systems": [],
  "entries": [],
  "structuralDevices": [],
  "foreshadows": [],
  "minorCharacters": [],
  "flaggedPhrases": [],
  "auditLog": []
}
```
