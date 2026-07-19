import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrap, ensureAgents, ensureUserGuide, needsBootstrap } from './bootstrap';
import { cleanupTempDirs, makeTempDir } from '../test/tempDir';

let userDataPath: string;
let agentsSourceDir: string;

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  userDataPath = await makeTempDir();
  agentsSourceDir = await makeTempDir();
  await writeFile(path.join(agentsSourceDir, 'SPARK.md'), 'spark prompt', 'utf-8');
  await writeFile(path.join(agentsSourceDir, 'VERITY-CORE.md'), 'verity prompt', 'utf-8');
});

afterEach(async () => {
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

describe('needsBootstrap', () => {
  it('is true before first run and false after bootstrap completes', async () => {
    expect(await needsBootstrap(userDataPath)).toBe(true);
    await bootstrap(userDataPath, agentsSourceDir);
    expect(await needsBootstrap(userDataPath)).toBe(false);
  });
});

describe('bootstrap', () => {
  it('creates directories, copies agents, and writes template files + flag', async () => {
    await bootstrap(userDataPath, agentsSourceDir);

    expect(await exists(path.join(userDataPath, 'books'))).toBe(true);
    expect(await exists(path.join(userDataPath, 'series'))).toBe(true);
    expect(await readdir(path.join(userDataPath, 'custom-agents'))).toEqual(
      expect.arrayContaining(['SPARK.md', 'VERITY-CORE.md'])
    );
    expect(await readFile(path.join(userDataPath, 'author-profile.md'), 'utf-8')).toContain('# Author Profile');
    expect(JSON.parse(await readFile(path.join(userDataPath, 'active-book.json'), 'utf-8'))).toEqual({ book: '' });
    const flag = await readFile(path.join(userDataPath, '.initialized'), 'utf-8');
    expect(new Date(flag).toString()).not.toBe('Invalid Date');
  });

  it('is idempotent and never overwrites user files on a second run', async () => {
    await bootstrap(userDataPath, agentsSourceDir);
    await writeFile(path.join(userDataPath, 'author-profile.md'), 'my custom voice', 'utf-8');
    await writeFile(path.join(userDataPath, 'custom-agents', 'SPARK.md'), 'customized spark', 'utf-8');
    await writeFile(path.join(userDataPath, 'active-book.json'), '{"book":"my-book"}', 'utf-8');

    await bootstrap(userDataPath, agentsSourceDir);

    expect(await readFile(path.join(userDataPath, 'author-profile.md'), 'utf-8')).toBe('my custom voice');
    expect(await readFile(path.join(userDataPath, 'custom-agents', 'SPARK.md'), 'utf-8')).toBe('customized spark');
    expect(await readFile(path.join(userDataPath, 'active-book.json'), 'utf-8')).toBe('{"book":"my-book"}');
  });
});

describe('ensureAgents', () => {
  it('copies only missing .md/.MD files and skips VERITY-LEGACY.md', async () => {
    await writeFile(path.join(agentsSourceDir, 'VERITY-LEGACY.md'), 'legacy', 'utf-8');
    await writeFile(path.join(agentsSourceDir, 'HELPER.MD'), 'helper', 'utf-8');
    await writeFile(path.join(agentsSourceDir, 'notes.txt'), 'not an agent', 'utf-8');
    const agentsDir = path.join(userDataPath, 'custom-agents');

    await ensureAgents(agentsDir, agentsSourceDir);

    const copied = (await readdir(agentsDir)).sort();
    expect(copied).toEqual(['HELPER.MD', 'SPARK.md', 'VERITY-CORE.md']);
  });

  it('handles the legacy FORGE.MD rename migration (no-op on case-insensitive filesystems)', async () => {
    // The migration pairs are CASE-ONLY renames. On APFS/NTFS, access('FORGE.md')
    // matches the existing 'FORGE.MD', so the both-exist branch triggers and the
    // rename never happens — recorded in STATE.md as a bug candidate. On
    // case-sensitive filesystems the rename works. Pin whichever applies here.
    const agentsDir = path.join(userDataPath, 'custom-agents');
    await mkdir(agentsDir, { recursive: true });
    await writeFile(path.join(agentsDir, 'probe.md'), 'probe', 'utf-8');
    const caseInsensitive = await exists(path.join(agentsDir, 'PROBE.MD'));
    await writeFile(path.join(agentsDir, 'FORGE.MD'), 'old-cased forge', 'utf-8');

    await ensureAgents(agentsDir, agentsSourceDir);

    const names = await readdir(agentsDir);
    if (caseInsensitive) {
      expect(names).toContain('FORGE.MD'); // migration silently no-ops
      expect(names).not.toContain('FORGE.md');
    } else {
      expect(names).toContain('FORGE.md');
      expect(names).not.toContain('FORGE.MD');
    }
    // Content survives either way
    expect(await readFile(path.join(agentsDir, 'FORGE.md'), 'utf-8').catch(() =>
      readFile(path.join(agentsDir, 'FORGE.MD'), 'utf-8'),
    )).toBe('old-cased forge');
  });

  it('warns and returns when the source directory is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const agentsDir = path.join(userDataPath, 'custom-agents');

    await expect(ensureAgents(agentsDir, path.join(userDataPath, 'no-such-dir'))).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('[bootstrap] Agent source directory not found:', expect.stringContaining('no-such-dir'));
    expect(await readdir(agentsDir)).toEqual([]); // dir created, nothing copied
  });
});

describe('ensureUserGuide', () => {
  it('copies the guide and overwrites a stale copy on every call', async () => {
    const guideSource = path.join(agentsSourceDir, 'USER_GUIDE.md');
    await writeFile(guideSource, 'v2 guide', 'utf-8');
    await writeFile(path.join(userDataPath, 'USER_GUIDE.md'), 'v1 guide', 'utf-8');

    await ensureUserGuide(userDataPath, guideSource);

    expect(await readFile(path.join(userDataPath, 'USER_GUIDE.md'), 'utf-8')).toBe('v2 guide');
  });

  it('degrades silently when the source guide is missing', async () => {
    await expect(
      ensureUserGuide(userDataPath, path.join(agentsSourceDir, 'missing-guide.md'))
    ).resolves.toBeUndefined();
    expect(await exists(path.join(userDataPath, 'USER_GUIDE.md'))).toBe(false);
  });
});
