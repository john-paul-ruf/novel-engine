import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@domain/constants';
import { SettingsService } from './SettingsService';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

// SettingsService promisifies execFile at module load — the mock must supply
// the promisify.custom implementation before the service module is imported.
const execFileMock = vi.hoisted(() => vi.fn<(cmd: string, args: string[], opts: object) => Promise<{ stdout: string; stderr: string }>>());

vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  const execFile = Object.assign(() => undefined, { [promisify.custom]: execFileMock });
  return { execFile };
});

let userDataDir: string;
let service: SettingsService;

beforeEach(async () => {
  userDataDir = await makeTempDir();
  service = new SettingsService(userDataDir);
  execFileMock.mockReset();
});

afterEach(async () => {
  await cleanupTempDirs();
});

describe('load', () => {
  it('returns defaults when no settings file exists', async () => {
    expect(await service.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults when the file contains corrupted JSON', async () => {
    await writeFile(join(userDataDir, 'settings.json'), '{not json', 'utf-8');
    expect(await service.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges a partial settings file over defaults', async () => {
    await writeFile(join(userDataDir, 'settings.json'), JSON.stringify({ theme: 'light', authorName: 'Jo' }), 'utf-8');
    const settings = await service.load();
    expect(settings.theme).toBe('light');
    expect(settings.authorName).toBe('Jo');
    expect(settings.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens);
  });
});

describe('update', () => {
  it('round-trips through disk — a fresh instance sees the saved values', async () => {
    await service.update({ theme: 'light', enableThinking: true });

    const raw = JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf-8'));
    expect(raw.theme).toBe('light');

    const fresh = new SettingsService(userDataDir);
    const settings = await fresh.load();
    expect(settings.theme).toBe('light');
    expect(settings.enableThinking).toBe(true);
  });

  it('keeps the in-memory cache consistent with the written values', async () => {
    await service.load();
    await service.update({ authorName: 'Phoenix' });
    expect((await service.load()).authorName).toBe('Phoenix');
  });
});

describe('CLI detection', () => {
  it.each([
    ['detectClaudeCli', 'hasClaudeCli'],
    ['detectOllamaCli', 'hasOllamaCli'],
  ] as const)('%s → true and persists %s when the CLI prints a version', async (method, flag) => {
    execFileMock.mockResolvedValue({ stdout: '1.2.3\n', stderr: '' });
    expect(await service[method]()).toBe(true);
    expect((await service.load())[flag]).toBe(true);
  });

  it.each([
    ['detectClaudeCli', 'hasClaudeCli'],
    ['detectCodexCli', 'hasCodexCli'],
    ['detectOllamaCli', 'hasOllamaCli'],
  ] as const)('%s → false and persists %s=false when the CLI is missing', async (method, flag) => {
    execFileMock.mockRejectedValue(new Error('ENOENT'));
    expect(await service[method]()).toBe(false);
    expect((await service.load())[flag]).toBe(false);
  });

  it('detectCodexCli accepts version output on stderr', async () => {
    execFileMock.mockResolvedValue({ stdout: '', stderr: 'codex 0.9.0' });
    expect(await service.detectCodexCli()).toBe(true);
    expect((await service.load()).hasCodexCli).toBe(true);
  });

  it('empty version output counts as not found', async () => {
    execFileMock.mockResolvedValue({ stdout: '  \n', stderr: '' });
    expect(await service.detectClaudeCli()).toBe(false);
  });
});
