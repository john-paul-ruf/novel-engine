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

  // Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // Only fix structural issues between lines — NOT inside string values.
  // We split into lines and only apply repairs to lines that are purely
  // structural (closing/opening braces, brackets).
  const lines = text.split('\n');
  const repaired: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    const prevTrimmed = i > 0 ? repaired[repaired.length - 1].trimStart() : '';

    // Fix: previous line ends with } or ] and this line starts with { or " (missing comma)
    // Only match lines that are PURELY structural — not string content
    if (
      repaired.length > 0 &&
      /^[}\]]$/.test(prevTrimmed.trimEnd()) &&
      /^[{"\[]/.test(trimmed)
    ) {
      // Add comma to previous line
      repaired[repaired.length - 1] = repaired[repaired.length - 1].replace(
        /([}\]])\s*$/,
        '$1,',
      );
    }

    // Fix trailing comma before } or ]
    if (/^[}\]]/.test(trimmed) && repaired.length > 0) {
      repaired[repaired.length - 1] = repaired[repaired.length - 1].replace(
        /,\s*$/,
        '',
      );
    }

    repaired.push(lines[i]);
  }

  return repaired.join('\n');
}

/**
 * Attempts to parse JSON, repairing common syntax errors on failure.
 * Returns the parsed object or null if repair also fails.
 * Never writes back to disk — read-only operation.
 */
function safeParse(raw: string): { data: Record<string, unknown> } | null {
  // Fast path — valid JSON
  try {
    return { data: JSON.parse(raw) };
  } catch {
    // fall through to repair
  }

  // Slow path — attempt repair
  try {
    const repaired = repairJson(raw);
    const data = JSON.parse(repaired);
    console.warn('[MotifLedgerService] Loaded motif-ledger.json after repairing malformed JSON');
    return { data };
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

      const { data: parsed } = result;
      return {
        systems: safeArray(parsed.systems).map(normalizeSystem),
        entries: safeArray(parsed.entries).map(normalizeEntry),
        structuralDevices: safeArray(parsed.structuralDevices) as StructuralDevice[],
        foreshadows: safeArray(parsed.foreshadows) as ForeshadowEntry[],
        minorCharacters: safeArray(parsed.minorCharacters) as MinorCharacterMotif[],
        flaggedPhrases: safeArray(parsed.flaggedPhrases) as FlaggedPhrase[],
        auditLog: safeArray(parsed.auditLog).map(normalizeAuditRecord),
      };
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
