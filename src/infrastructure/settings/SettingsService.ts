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

  constructor(userDataPath: string) {
    this.settingsPath = join(userDataPath, 'settings.json');
  }

  async load(): Promise<AppSettings> {
    try {
      const raw = await readFile(this.settingsPath, 'utf-8');
      const stored: Partial<AppSettings> = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...stored };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async update(partial: Partial<AppSettings>): Promise<void> {
    const current = await this.load();
    const merged = { ...current, ...partial };
    await writeFile(this.settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
  }

  async detectClaudeCli(): Promise<boolean> {
    try {
      await execFile('claude', ['--version']);
    } catch {
      await this.update({ hasClaudeCli: false });
      return false;
    }

    try {
      await execFile('claude', ['doctor']);
    } catch {
      await this.update({ hasClaudeCli: false });
      return false;
    }

    await this.update({ hasClaudeCli: true });
    return true;
  }
}
