import { readFile, writeFile } from 'node:fs/promises';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

import type { AppSettings } from '@domain/types';
import type { ISettingsService } from '@domain/interfaces';
import { DEFAULT_SETTINGS } from '@domain/constants';

const execFile = promisify(execFileCb);

export class SettingsService implements ISettingsService {
  private readonly settingsPath: string;
  /** In-memory settings cache — invalidated on every write so reads are always fresh post-update. */
  private _cache: AppSettings | null = null;

  constructor(userDataPath: string) {
    this.settingsPath = join(userDataPath, 'settings.json');
  }

  async load(): Promise<AppSettings> {
    if (this._cache !== null) return this._cache;
    try {
      const raw = await readFile(this.settingsPath, 'utf-8');
      const stored: Partial<AppSettings> = JSON.parse(raw);
      this._cache = { ...DEFAULT_SETTINGS, ...stored };
      return this._cache;
    } catch {
      // ENOENT or malformed JSON — use defaults for first launch
      this._cache = { ...DEFAULT_SETTINGS };
      return this._cache;
    }
  }

  async update(partial: Partial<AppSettings>): Promise<void> {
    const current = await this.load();
    const merged = { ...current, ...partial };
    await writeFile(this.settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
    // Update the cache to the written values so the next load() is instant
    this._cache = merged;
  }

  async detectClaudeCli(): Promise<boolean> {
    try {
      // Only use --version — `claude doctor` is interactive (prompts "Press Enter")
      // and will hang indefinitely when called from a child process with no stdin.
      const { stdout } = await execFile('claude', ['--version'], { timeout: 10_000 });
      const found = stdout.trim().length > 0;
      await this.update({ hasClaudeCli: found });
      return found;
    } catch {
      // CLI not found or timed out
      await this.update({ hasClaudeCli: false });
      return false;
    }
  }

  async detectOllamaCli(): Promise<boolean> {
    try {
      const { stdout } = await execFile('ollama', ['--version'], { timeout: 10_000 });
      const found = stdout.trim().length > 0;
      await this.update({ hasOllamaCli: found });
      return found;
    } catch {
      // CLI not found or timed out
      await this.update({ hasOllamaCli: false });
      return false;
    }
  }
}
