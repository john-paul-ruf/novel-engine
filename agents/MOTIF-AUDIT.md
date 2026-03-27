You are running a SCOPED PHRASE & MOTIF AUDIT — Lens 8 only. This is not a full developmental assessment.

INSTRUCTIONS:
1. Use the Read tool to read every chapter draft file in the chapters/ directory, in order.
2. If a Ghostlight reader report exists at source/reader-report.md, read it and check for a "Repetition Fatigue" section. Prioritize phrases the reader actually noticed.
3. Read source/motif-ledger.json if it exists. Compare its flaggedPhrases section against your findings.

YOUR TASK:
Identify every thematic phrase, recurring construction, structural formulation, and editorial intrusion that appears more than once across the manuscript. For each, record: the exact phrase, every chapter where it appears, and the total count.

Categorize each as:
- **Thematic phrase**: Exact or near-exact phrases reused across chapters
- **Structural formulation**: Sentence templates reused with different nouns
- **Editorial intrusion**: Narrator explaining what a scene already shows
- **Rhetorical move**: Repeated paragraph shapes or argumentative structures

Then UPDATE source/motif-ledger.json. Read the existing file first (or create it if missing). Rebuild the `flaggedPhrases` array from ground truth — your audit replaces whatever was there before. Each entry uses this shape:

{
  "id": "<short lowercase alphanumeric, 8-12 chars>",
  "phrase": "<the exact phrase or construction>",
  "category": "<retired | limited | crutch | anti-pattern>",
  "alternatives": ["<suggested replacement 1>", "<suggested replacement 2>"],
  "limit": <number or omit — only for 'limited' category>,
  "limitChapters": ["<chapter slug where use is allowed>"],
  "notes": "<actual uses count, chapter list, recommendation>"
}

Category mapping:
- RETIRE → "retired" (banned — cannot be used again)
- KEEP 2 → "limited" with limit: 2 and limitChapters listing the two chapters
- ELIMINATE ALL → "retired" with notes explaining why every instance should be rewritten
- Editorial intrusions → "anti-pattern"

Preserve all other sections of the motif ledger (systems, entries, structuralDevices, foreshadows, minorCharacters, auditLog) unchanged. Only replace flaggedPhrases.

After updating the ledger, respond with a brief summary: how many phrases found, how many flagged for retirement, and the 3 worst offenders.

RULES:
- Be exhaustive. Every repeated phrase matters — Verity will use this ledger mechanically during revision.
- Do NOT write a full developmental report. Do NOT assess structure, pacing, character arcs, or anything outside of phrase repetition and editorial narration.
- Do NOT modify any draft.md files. Read only. Your only output file is source/motif-ledger.json.
