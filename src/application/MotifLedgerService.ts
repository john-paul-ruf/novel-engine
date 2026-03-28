import type { IFileSystemService, IMotifLedgerService } from '@domain/interfaces';
import type {
  FlaggedPhrase,
  ForeshadowEntry,
  LedgerAuditRecord,
  MinorCharacterMotif,
  MotifEntry,
  MotifLedger,
  MotifSystem,
  StructuralDevice,
} from '@domain/types';

const LEDGER_PATH = 'source/motif-ledger.json';

const EMPTY_LEDGER: MotifLedger = {
  systems: [],
  entries: [],
  structuralDevices: [],
  foreshadows: [],
  minorCharacters: [],
  flaggedPhrases: [],
  auditLog: [],
};

// ── Normalization helpers ─────────────────────────────────────────
// Agents write the JSON with their own field names. The UI expects
// the canonical shapes defined in domain/types. These functions
// bridge the two formats without data loss.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSystem(raw: any): MotifSystem {
  return {
    id: raw.id ?? crypto.randomUUID(),
    name: raw.name ?? '',
    description: raw.description ?? '',
    components: Array.isArray(raw.components) ? raw.components : [],
    arcTrajectory: raw.arcTrajectory ?? '',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeEntry(raw: any): MotifEntry {
  return {
    id: raw.id ?? crypto.randomUUID(),
    character: raw.character ?? '',
    phrase: raw.phrase ?? raw.description ?? '',
    description: raw.description ?? '',
    systemId: raw.systemId ?? null,
    firstAppearance: raw.firstAppearance ?? '',
    occurrences: Array.isArray(raw.occurrences) ? raw.occurrences : [],
    notes: raw.notes ?? '',
  };
}

/**
 * Normalizes audit log records from the on-disk format (written by agents) to
 * the canonical LedgerAuditRecord shape expected by the UI.
 *
 * Agent-written records use: { chapter, date, findings }
 * UI-written records use:    { id, chapterSlug, auditedAt, entriesAdded, entriesUpdated, notes }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeAuditRecord(raw: any): LedgerAuditRecord {
  return {
    id: raw.id ?? crypto.randomUUID(),
    chapterSlug: raw.chapterSlug ?? raw.chapter ?? '',
    auditedAt: raw.auditedAt ?? raw.date ?? new Date().toISOString(),
    entriesAdded: typeof raw.entriesAdded === 'number' ? raw.entriesAdded : 0,
    entriesUpdated: typeof raw.entriesUpdated === 'number' ? raw.entriesUpdated : 0,
    notes: raw.notes ?? raw.findings ?? '',
  };
}

function safeArray(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [];
}

// ── JSON repair ──────────────────────────────────────────────────
// Agents frequently produce JSON with minor syntax errors.
// Rather than silently returning an empty ledger, we attempt to
// repair the most common issues before parsing.

function repairJson(raw: string): string {
  let text = raw;

  // 1. Strip trailing commas before } or ]  (e.g.  { "a": 1, } )
  text = text.replace(/,\s*([}\]])/g, '$1');

  // 2. Insert missing commas between adjacent objects/arrays in arrays:
  //    }\n    {  or  ]\n    [  without a comma between them.
  text = text.replace(/\}(\s*)\{/g, '},$1{');
  text = text.replace(/\](\s*)\[/g, '],$1[');

  // 3. Insert missing commas between a closing } or ] and a quoted key:
  //    }\n    "key"  →  },\n    "key"
  text = text.replace(/([}\]])(\s*)"(?!:)/g, '$1,$2"');

  // 4. Remove single-line JS-style comments  // ...
  text = text.replace(/\/\/[^\n]*/g, '');

  // 5. Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  return text;
}

/**
 * Attempts to parse JSON, repairing common syntax errors on failure.
 * Returns `{ data, repaired }` — `repaired` is true when the raw input
 * required fixes, signalling the caller to write the clean version back.
 */
function safeParse(raw: string): { data: Record<string, unknown>; repaired: boolean } | null {
  // Fast path — valid JSON
  try {
    return { data: JSON.parse(raw), repaired: false };
  } catch {
    // fall through to repair
  }

  // Slow path — attempt repair
  try {
    const repaired = repairJson(raw);
    const data = JSON.parse(repaired);
    console.warn('[MotifLedgerService] Loaded motif-ledger.json after repairing malformed JSON');
    return { data, repaired: true };
  } catch (err) {
    console.error('[MotifLedgerService] Failed to parse motif-ledger.json even after repair:', err);
    return null;
  }
}

export class MotifLedgerService implements IMotifLedgerService {
  constructor(private fs: IFileSystemService) {}

  async load(bookSlug: string): Promise<MotifLedger> {
    try {
      const exists = await this.fs.fileExists(bookSlug, LEDGER_PATH);
      if (!exists) return structuredClone(EMPTY_LEDGER);
      const raw = await this.fs.readFile(bookSlug, LEDGER_PATH);
      const result = safeParse(raw);
      if (!result) return structuredClone(EMPTY_LEDGER);

      const { data: parsed, repaired } = result;
      const ledger: MotifLedger = {
        systems: safeArray(parsed.systems).map(normalizeSystem),
        entries: safeArray(parsed.entries).map(normalizeEntry),
        structuralDevices: safeArray(parsed.structuralDevices) as StructuralDevice[],
        foreshadows: safeArray(parsed.foreshadows) as ForeshadowEntry[],
        minorCharacters: safeArray(parsed.minorCharacters) as MinorCharacterMotif[],
        flaggedPhrases: safeArray(parsed.flaggedPhrases) as FlaggedPhrase[],
        auditLog: safeArray(parsed.auditLog).map(normalizeAuditRecord),
      };

      // If we had to repair the JSON, write the clean version back so
      // the error doesn't persist and future loads hit the fast path.
      if (repaired) {
        try {
          await this.save(bookSlug, ledger);
          console.warn('[MotifLedgerService] Wrote repaired motif-ledger.json back to disk');
        } catch {
          // Non-fatal — we still loaded successfully
        }
      }

      return ledger;
    } catch {
      // ENOENT or other filesystem error
      return structuredClone(EMPTY_LEDGER);
    }
  }

  async save(bookSlug: string, ledger: MotifLedger): Promise<void> {
    const json = JSON.stringify(ledger, null, 2);
    await this.fs.writeFile(bookSlug, LEDGER_PATH, json);
  }

  async getUnauditedChapters(bookSlug: string): Promise<string[]> {
    const ledger = await this.load(bookSlug);
    const auditedSlugs = new Set(ledger.auditLog.map((a) => a.chapterSlug));
    try {
      const entries = await this.fs.listDirectory(bookSlug, 'chapters');
      const chapterSlugs = entries
        .filter((e) => e.isDirectory)
        .map((e) => e.name)
        .sort();
      return chapterSlugs.filter((slug) => !auditedSlugs.has(slug));
    } catch {
      // ENOENT — chapters directory doesn't exist yet
      return [];
    }
  }
}
