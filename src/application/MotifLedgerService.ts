import type { IFileSystemService, IMotifLedgerService } from '@domain/interfaces';
import type { MotifLedger } from '@domain/types';

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

export class MotifLedgerService implements IMotifLedgerService {
  constructor(private fs: IFileSystemService) {}

  async load(bookSlug: string): Promise<MotifLedger> {
    try {
      const exists = await this.fs.fileExists(bookSlug, LEDGER_PATH);
      if (!exists) return structuredClone(EMPTY_LEDGER);
      const raw = await this.fs.readFile(bookSlug, LEDGER_PATH);
      const parsed = JSON.parse(raw);
      return {
        systems: parsed.systems ?? [],
        entries: parsed.entries ?? [],
        structuralDevices: parsed.structuralDevices ?? [],
        foreshadows: parsed.foreshadows ?? [],
        minorCharacters: parsed.minorCharacters ?? [],
        flaggedPhrases: parsed.flaggedPhrases ?? [],
        auditLog: parsed.auditLog ?? [],
      };
    } catch {
      // ENOENT or malformed JSON — return empty ledger for new/corrupted books
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
