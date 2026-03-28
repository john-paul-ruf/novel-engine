import type { IFileSystemService, IMotifLedgerService, IProviderRegistry } from '@domain/interfaces';
import type {
  MotifLedger,
  StreamEvent,
} from '@domain/types';
import { WRANGLER_MODEL } from '@domain/constants';

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

const TARGET_SCHEMA = `{
  "systems": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "components": ["string"],
      "arcTrajectory": "string"
    }
  ],
  "entries": [
    {
      "id": "string",
      "character": "string",
      "phrase": "string",
      "description": "string",
      "systemId": "string | null",
      "firstAppearance": "string",
      "occurrences": ["string"],
      "notes": "string"
    }
  ],
  "structuralDevices": [
    {
      "id": "string",
      "name": "string",
      "deviceType": "string",
      "description": "string",
      "pattern": "string",
      "chapters": ["string"],
      "notes": "string"
    }
  ],
  "foreshadows": [
    {
      "id": "string",
      "description": "string",
      "plantedIn": "string",
      "expectedPayoff": "string",
      "expectedPayoffIn": "string",
      "status": "'planted' | 'paid-off' | 'abandoned'",
      "notes": "string"
    }
  ],
  "minorCharacters": [
    {
      "id": "string",
      "character": "string",
      "motifs": "string",
      "notes": "string"
    }
  ],
  "flaggedPhrases": [
    {
      "id": "string",
      "phrase": "string",
      "category": "'retired' | 'limited' | 'crutch' | 'anti-pattern'",
      "alternatives": ["string"],
      "limit": "number (optional)",
      "notes": "string"
    }
  ],
  "auditLog": [
    {
      "id": "string",
      "chapterSlug": "string",
      "auditedAt": "string (ISO 8601)",
      "entriesAdded": "number",
      "entriesUpdated": "number",
      "notes": "string"
    }
  ]
}`;

const NORMALIZATION_PROMPT = `You are a JSON schema normalizer. You will receive a motif-ledger JSON object that may use non-canonical field names, nested objects where flat strings are expected, or missing fields.

Your job: transform the input JSON to match this exact target schema. Preserve ALL data — do not drop entries. Map fields intelligently:

TARGET SCHEMA:
${TARGET_SCHEMA}

MAPPING RULES:
- systems: "associatedCharacters" or "entries" arrays → flatten into "components". "thematicFunction" → "arcTrajectory". If a field doesn't exist, use empty string or empty array.
- entries: "name" → "phrase". "system" (a system ID ref) → "systemId". "type" field can go into "notes" if no notes exist. If "firstAppearance" is an object like {chapter, slug, context}, flatten to a descriptive string like "Ch N (slug): context". If "occurrences" is an array of objects like {chapter, slug, note}, flatten each to a string like "Ch N (slug): note". If "character" is missing, check if the parent system has "associatedCharacters" and use the first one, otherwise use empty string.
- structuralDevices: "type" → "deviceType". "chapters" as number array → convert to string array. If "chapters" is "all", use ["all"]. Add empty "pattern" and "notes" if missing.
- foreshadows: If it has "plant"/"payoff" objects, flatten: plant.detail → "description", plant.chapter → "plantedIn" (as string), payoff.detail → "expectedPayoff", payoff.chapter → "expectedPayoffIn" (as string). "type" like "planted-and-paid" → map to status "paid-off". "name" can go into "description" if description is empty.
- minorCharacters: Normalize as needed. Add empty fields if missing.
- flaggedPhrases: Normalize as needed. Add empty fields if missing.
- auditLog: "chapter" → "chapterSlug". "date" → "auditedAt". "findings" → "notes". Default entriesAdded/entriesUpdated to 0 if missing.

If a top-level array key is missing entirely, use an empty array.

Output ONLY the normalized JSON. No markdown fences, no explanation, no preamble. Just valid JSON.`;

function repairJson(raw: string): string {
  let text = raw;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  const lines = text.split('\n');
  const repaired: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    const prevTrimmed = i > 0 ? repaired[repaired.length - 1].trimStart() : '';

    if (
      repaired.length > 0 &&
      /^[}\]]$/.test(prevTrimmed.trimEnd()) &&
      /^[{"\[]/.test(trimmed)
    ) {
      repaired[repaired.length - 1] = repaired[repaired.length - 1].replace(
        /([}\]])\s*$/,
        '$1,',
      );
    }

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

function safeParse(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw);
  } catch {
    // fall through to repair
  }
  try {
    const repaired = repairJson(raw);
    const data = JSON.parse(repaired);
    console.warn('[MotifLedgerService] Loaded motif-ledger.json after repairing malformed JSON');
    return data;
  } catch (err) {
    console.error('[MotifLedgerService] Failed to parse motif-ledger.json even after repair:', err);
    return null;
  }
}

function isCanonicalShape(parsed: Record<string, unknown>): boolean {
  const systems = parsed.systems;
  const entries = parsed.entries;

  if (!Array.isArray(systems) || !Array.isArray(entries)) return true;
  if (systems.length === 0 && entries.length === 0) return true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sample = systems[0] as any;
  if (sample && ('associatedCharacters' in sample || 'thematicFunction' in sample)) {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entrySample = entries[0] as any;
  if (entrySample) {
    if ('system' in entrySample && !('systemId' in entrySample)) return false;
    if (typeof entrySample.firstAppearance === 'object' && entrySample.firstAppearance !== null) return false;
    if (
      Array.isArray(entrySample.occurrences) &&
      entrySample.occurrences.length > 0 &&
      typeof entrySample.occurrences[0] === 'object'
    ) return false;
  }

  const foreshadows = parsed.foreshadows;
  if (Array.isArray(foreshadows) && foreshadows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fsh = foreshadows[0] as any;
    if (fsh && ('plant' in fsh || 'payoff' in fsh)) return false;
  }

  const devices = parsed.structuralDevices;
  if (Array.isArray(devices) && devices.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dev = devices[0] as any;
    if (dev && Array.isArray(dev.chapters) && dev.chapters.length > 0 && typeof dev.chapters[0] === 'number') return false;
  }

  return true;
}

function safeArray(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [];
}

function parseLedgerFromCanonical(parsed: Record<string, unknown>): MotifLedger {
  return {
    systems: safeArray(parsed.systems).map((raw) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = raw as any;
      return {
        id: r.id ?? crypto.randomUUID(),
        name: r.name ?? '',
        description: r.description ?? '',
        components: Array.isArray(r.components) ? r.components : [],
        arcTrajectory: r.arcTrajectory ?? '',
      };
    }),
    entries: safeArray(parsed.entries).map((raw) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = raw as any;
      return {
        id: r.id ?? crypto.randomUUID(),
        character: r.character ?? '',
        phrase: r.phrase ?? r.name ?? r.description ?? '',
        description: r.description ?? '',
        systemId: r.systemId ?? null,
        firstAppearance: typeof r.firstAppearance === 'string' ? r.firstAppearance : '',
        occurrences: Array.isArray(r.occurrences) ? r.occurrences.map(String) : [],
        notes: r.notes ?? '',
      };
    }),
    structuralDevices: safeArray(parsed.structuralDevices).map((raw) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = raw as any;
      return {
        id: r.id ?? crypto.randomUUID(),
        name: r.name ?? '',
        deviceType: r.deviceType ?? r.type ?? '',
        description: r.description ?? '',
        pattern: r.pattern ?? '',
        chapters: Array.isArray(r.chapters) ? r.chapters.map(String) : [],
        notes: r.notes ?? '',
      };
    }),
    foreshadows: safeArray(parsed.foreshadows).map((raw) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = raw as any;
      return {
        id: r.id ?? crypto.randomUUID(),
        description: r.description ?? r.name ?? '',
        plantedIn: r.plantedIn ?? '',
        expectedPayoff: r.expectedPayoff ?? '',
        expectedPayoffIn: r.expectedPayoffIn ?? '',
        status: r.status === 'planted' || r.status === 'paid-off' || r.status === 'abandoned'
          ? r.status : 'planted',
        notes: r.notes ?? '',
      };
    }),
    minorCharacters: safeArray(parsed.minorCharacters).map((raw) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = raw as any;
      return {
        id: r.id ?? crypto.randomUUID(),
        character: r.character ?? '',
        motifs: r.motifs ?? '',
        notes: r.notes ?? '',
      };
    }),
    flaggedPhrases: safeArray(parsed.flaggedPhrases).map((raw) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = raw as any;
      return {
        id: r.id ?? crypto.randomUUID(),
        phrase: r.phrase ?? '',
        category: r.category === 'retired' || r.category === 'limited' || r.category === 'crutch' || r.category === 'anti-pattern'
          ? r.category : 'crutch',
        alternatives: Array.isArray(r.alternatives) ? r.alternatives : [],
        ...(typeof r.limit === 'number' ? { limit: r.limit } : {}),
        ...(Array.isArray(r.limitChapters) ? { limitChapters: r.limitChapters } : {}),
        notes: r.notes ?? '',
      };
    }),
    auditLog: safeArray(parsed.auditLog).map((raw) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = raw as any;
      return {
        id: r.id ?? crypto.randomUUID(),
        chapterSlug: r.chapterSlug ?? r.chapter ?? '',
        auditedAt: r.auditedAt ?? r.date ?? new Date().toISOString(),
        entriesAdded: typeof r.entriesAdded === 'number' ? r.entriesAdded : 0,
        entriesUpdated: typeof r.entriesUpdated === 'number' ? r.entriesUpdated : 0,
        notes: r.notes ?? r.findings ?? '',
      };
    }),
  };
}

export type NormalizationCallback = (status: 'started' | 'done' | 'error', error?: string) => void;

export class MotifLedgerService implements IMotifLedgerService {
  private onNormalize: NormalizationCallback | null = null;

  constructor(
    private fs: IFileSystemService,
    private providers: IProviderRegistry,
  ) {}

  setNormalizationCallback(cb: NormalizationCallback): void {
    this.onNormalize = cb;
  }

  async load(bookSlug: string): Promise<MotifLedger> {
    try {
      const exists = await this.fs.fileExists(bookSlug, LEDGER_PATH);
      if (!exists) return structuredClone(EMPTY_LEDGER);
      const raw = await this.fs.readFile(bookSlug, LEDGER_PATH);
      const parsed = safeParse(raw);
      if (!parsed) return structuredClone(EMPTY_LEDGER);

      if (isCanonicalShape(parsed)) {
        return parseLedgerFromCanonical(parsed);
      }

      console.log('[MotifLedgerService] Non-canonical shape detected — normalizing via CLI');
      this.onNormalize?.('started');

      try {
        const normalized = await this.normalizeViaCli(raw);
        if (normalized) {
          await this.save(bookSlug, normalized);
          this.onNormalize?.('done');
          return normalized;
        }
      } catch (err) {
        console.error('[MotifLedgerService] CLI normalization failed:', err);
        this.onNormalize?.('error', String(err));
      }

      console.warn('[MotifLedgerService] CLI normalization failed — falling back to best-effort parse');
      this.onNormalize?.('done');
      return parseLedgerFromCanonical(parsed);
    } catch {
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
      return [];
    }
  }

  private async normalizeViaCli(rawJson: string): Promise<MotifLedger | null> {
    let responseText = '';

    await this.providers.sendMessage({
      model: WRANGLER_MODEL,
      systemPrompt: NORMALIZATION_PROMPT,
      messages: [{ role: 'user', content: rawJson }],
      maxTokens: 16384,
      maxTurns: 1,
      onEvent: (event: StreamEvent) => {
        if (event.type === 'textDelta') {
          responseText += event.text;
        }
      },
    });

    let cleanText = responseText.trim();
    const fenceMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      cleanText = fenceMatch[1].trim();
    }

    const parsed = safeParse(cleanText);
    if (!parsed) return null;

    return parseLedgerFromCanonical(parsed);
  }
}
