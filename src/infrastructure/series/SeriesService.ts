import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ISeriesService } from '@domain/interfaces';
import type { SeriesMeta, SeriesSummary } from '@domain/types';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export class SeriesService implements ISeriesService {
  private readonly seriesRoot: string;
  /** Reverse lookup: bookSlug → seriesSlug. Null = needs rebuild. */
  private reverseCache: Map<string, string> | null = null;

  constructor(userDataDir: string) {
    this.seriesRoot = path.join(userDataDir, 'series');
    fs.mkdirSync(this.seriesRoot, { recursive: true });
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private manifestPath(slug: string): string {
    return path.join(this.seriesRoot, slug, 'series.json');
  }

  private biblePath(slug: string): string {
    return path.join(this.seriesRoot, slug, 'series-bible.md');
  }

  private ensureSeriesDir(slug: string): void {
    fs.mkdirSync(path.join(this.seriesRoot, slug), { recursive: true });
  }

  private readManifest(slug: string): SeriesMeta {
    const filePath = this.manifestPath(slug);
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as SeriesMeta;
  }

  private writeManifest(meta: SeriesMeta): void {
    meta.updated = new Date().toISOString();
    this.ensureSeriesDir(meta.slug);
    fs.writeFileSync(this.manifestPath(meta.slug), JSON.stringify(meta, null, 2), 'utf-8');
    this.reverseCache = null; // invalidate on every mutation
  }

  private async buildReverseCache(): Promise<Map<string, string>> {
    const cache = new Map<string, string>();
    const entries = await this.listSeriesDirs();
    for (const slug of entries) {
      try {
        const meta = this.readManifest(slug);
        for (const vol of meta.volumes) {
          cache.set(vol.bookSlug, slug);
        }
      } catch {
        // skip corrupt or missing manifests
      }
    }
    return cache;
  }

  private async listSeriesDirs(): Promise<string[]> {
    try {
      const entries = fs.readdirSync(this.seriesRoot, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return [];
    }
  }

  // ── ISeriesService ───────────────────────────────────────────────────

  async listSeries(): Promise<SeriesSummary[]> {
    const dirs = await this.listSeriesDirs();
    const summaries: SeriesSummary[] = [];

    for (const slug of dirs) {
      try {
        const meta = this.readManifest(slug);
        summaries.push({
          ...meta,
          volumeCount: meta.volumes.length,
          totalWordCount: 0, // renderer computes from bookStore
        });
      } catch {
        // skip corrupt manifests
      }
    }

    return summaries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSeries(slug: string): Promise<SeriesMeta | null> {
    try {
      return this.readManifest(slug);
    } catch {
      return null;
    }
  }

  async createSeries(name: string, description?: string): Promise<SeriesMeta> {
    const slug = slugify(name);
    if (!slug) {
      throw new Error('Series name produces an empty slug');
    }

    // Check for slug collision
    const existing = await this.getSeries(slug);
    if (existing) {
      throw new Error(`A series with slug "${slug}" already exists`);
    }

    const now = new Date().toISOString();
    const meta: SeriesMeta = {
      slug,
      name,
      description: description ?? '',
      volumes: [],
      created: now,
      updated: now,
    };

    this.writeManifest(meta);
    return meta;
  }

  async updateSeries(
    slug: string,
    partial: Partial<Pick<SeriesMeta, 'name' | 'description'>>,
  ): Promise<SeriesMeta> {
    const meta = this.readManifest(slug);

    if (partial.name !== undefined) {
      meta.name = partial.name;
    }
    if (partial.description !== undefined) {
      meta.description = partial.description;
    }

    this.writeManifest(meta);
    return meta;
  }

  async deleteSeries(slug: string): Promise<void> {
    const dirPath = path.join(this.seriesRoot, slug);
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {
      // directory already gone — no-op
    }
    this.reverseCache = null;
  }

  async addVolume(
    seriesSlug: string,
    bookSlug: string,
    volumeNumber?: number,
  ): Promise<SeriesMeta> {
    // Check if book is already in another series
    const existingSeries = await this.getSeriesForBook(bookSlug);
    if (existingSeries && existingSeries.slug !== seriesSlug) {
      throw new Error(
        `Book "${bookSlug}" is already in series "${existingSeries.name}". Remove it first.`,
      );
    }

    const meta = this.readManifest(seriesSlug);

    // Check for duplicate within this series
    const alreadyInSeries = meta.volumes.some((v) => v.bookSlug === bookSlug);
    if (alreadyInSeries) {
      throw new Error(`Book "${bookSlug}" is already in series "${meta.name}"`);
    }

    if (volumeNumber !== undefined && volumeNumber >= 1 && volumeNumber <= meta.volumes.length + 1) {
      // Insert at position, shift others
      meta.volumes.splice(volumeNumber - 1, 0, { bookSlug, volumeNumber });
    } else {
      // Append to end
      meta.volumes.push({ bookSlug, volumeNumber: meta.volumes.length + 1 });
    }

    // Renumber all volumes sequentially
    meta.volumes.forEach((v, i) => {
      v.volumeNumber = i + 1;
    });

    this.writeManifest(meta);
    return meta;
  }

  async removeVolume(seriesSlug: string, bookSlug: string): Promise<SeriesMeta> {
    const meta = this.readManifest(seriesSlug);
    meta.volumes = meta.volumes.filter((v) => v.bookSlug !== bookSlug);

    // Renumber sequentially
    meta.volumes.forEach((v, i) => {
      v.volumeNumber = i + 1;
    });

    this.writeManifest(meta);
    return meta;
  }

  async reorderVolumes(seriesSlug: string, orderedSlugs: string[]): Promise<SeriesMeta> {
    const meta = this.readManifest(seriesSlug);

    const existingSlugs = new Set(meta.volumes.map((v) => v.bookSlug));
    const newSlugs = new Set(orderedSlugs);

    // Validate: same set of slugs
    if (existingSlugs.size !== newSlugs.size) {
      throw new Error('Reorder slugs must contain exactly the same books as the current volume list');
    }
    for (const slug of orderedSlugs) {
      if (!existingSlugs.has(slug)) {
        throw new Error(`Book "${slug}" is not in this series`);
      }
    }

    meta.volumes = orderedSlugs.map((bookSlug, i) => ({
      bookSlug,
      volumeNumber: i + 1,
    }));

    this.writeManifest(meta);
    return meta;
  }

  async getSeriesForBook(bookSlug: string): Promise<SeriesMeta | null> {
    if (!this.reverseCache) {
      this.reverseCache = await this.buildReverseCache();
    }

    const seriesSlug = this.reverseCache.get(bookSlug);
    if (!seriesSlug) {
      return null;
    }

    return this.getSeries(seriesSlug);
  }

  async readSeriesBible(seriesSlug: string): Promise<string> {
    try {
      return fs.readFileSync(this.biblePath(seriesSlug), 'utf-8');
    } catch {
      return '';
    }
  }

  async writeSeriesBible(seriesSlug: string, content: string): Promise<void> {
    this.ensureSeriesDir(seriesSlug);
    fs.writeFileSync(this.biblePath(seriesSlug), content, 'utf-8');
  }

  async getSeriesBiblePath(bookSlug: string): Promise<string | null> {
    const series = await this.getSeriesForBook(bookSlug);
    if (!series) {
      return null;
    }
    return this.biblePath(series.slug);
  }

  invalidateCache(): void {
    this.reverseCache = null;
  }
}
