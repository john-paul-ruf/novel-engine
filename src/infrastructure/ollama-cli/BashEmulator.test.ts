import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BashEmulator } from './BashEmulator';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

let root: string;
let emulator: BashEmulator;

// Mirrors ToolExecutor.resolveSafe: resolve against root, reject escapes.
function resolveSandboxed(p: string): string {
  const resolved = path.resolve(root, p);
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path traversal blocked: "${p}"`);
  }
  return resolved;
}

beforeEach(async () => {
  root = await makeTempDir();
  emulator = new BashEmulator(resolveSandboxed);
});

afterEach(async () => {
  await cleanupTempDirs();
});

describe('parsing + safety', () => {
  it.each(['|', '&', ';', '<', '>', '`', '$(', '${'])(
    'rejects shell metacharacter %j',
    async (seq) => {
      await expect(emulator.run(`ls a ${seq} b`)).rejects.toThrow(/Unsupported shell syntax/);
    }
  );

  it('rejects newlines, empty commands, and unterminated quotes', async () => {
    await expect(emulator.run('ls\nls')).rejects.toThrow(/Unsupported shell syntax: "\\n"/);
    await expect(emulator.run('   ')).rejects.toThrow(/Empty command/);
    await expect(emulator.run('cat "unclosed')).rejects.toThrow(/Unterminated quote/);
  });

  it('rejects commands outside the whitelist', async () => {
    await expect(emulator.run('curl http://example.com')).rejects.toThrow(/Command not allowed: "curl"/);
    await expect(emulator.run('bash -c ls')).rejects.toThrow(/Command not allowed/);
  });

  it.each(['cat ../../etc/passwd', 'ls /etc', 'rm -rf sub/../../../outside'])(
    'path escape attempt %j is blocked by the sandbox resolver',
    async (command) => {
      await expect(emulator.run(command)).rejects.toThrow(/Path traversal blocked/);
    }
  );

  it('supports quoted arguments with spaces', async () => {
    await writeFile(path.join(root, 'file with spaces.md'), 'spaced', 'utf-8');
    const result = await emulator.run(`cat 'file with spaces.md'`);
    expect(result.output).toBe('spaced');
  });
});

describe('mkdir / rmdir / rm', () => {
  it('mkdir creates nested directories and reports a write', async () => {
    const result = await emulator.run('mkdir -p chapters/02-midnight');
    expect(result).toMatchObject({ isWrite: true, filePath: 'chapters/02-midnight' });
    expect(result.output).toContain('Created directory chapters/02-midnight');

    const listing = await emulator.run('ls chapters');
    expect(listing.output).toBe('02-midnight/');
  });

  it('mkdir without paths reports usage', async () => {
    await expect(emulator.run('mkdir')).rejects.toThrow(/mkdir requires/);
  });

  it('rmdir removes only empty directories', async () => {
    await mkdir(path.join(root, 'empty'));
    await mkdir(path.join(root, 'full'));
    await writeFile(path.join(root, 'full', 'f.md'), 'x', 'utf-8');

    expect((await emulator.run('rmdir empty')).isWrite).toBe(true);
    await expect(emulator.run('rmdir full')).rejects.toThrow();
  });

  it('rm removes files, needs -r for directories, and -f ignores missing paths', async () => {
    await writeFile(path.join(root, 'gone.md'), 'x', 'utf-8');
    await mkdir(path.join(root, 'dir'));
    await writeFile(path.join(root, 'dir', 'inner.md'), 'x', 'utf-8');

    await emulator.run('rm gone.md');
    await expect(emulator.run('cat gone.md')).rejects.toThrow();

    await expect(emulator.run('rm dir')).rejects.toThrow(); // directory without -r
    await emulator.run('rm -rf dir');
    expect((await emulator.run('ls')).output).toBe('(empty directory)');

    await expect(emulator.run('rm missing.md')).rejects.toThrow();
    await expect(emulator.run('rm -f missing.md')).resolves.toMatchObject({ isWrite: true });
  });
});

describe('cat / wc', () => {
  it('cat concatenates multiple files and fails on missing ones', async () => {
    await writeFile(path.join(root, 'a.md'), 'aaa\n', 'utf-8');
    await writeFile(path.join(root, 'b.md'), 'bbb', 'utf-8');

    expect((await emulator.run('cat a.md b.md')).output).toBe('aaa\nbbb');
    await expect(emulator.run('cat nope.md')).rejects.toThrow();
    await expect(emulator.run('cat')).rejects.toThrow(/cat requires/);
  });

  it('cat truncates output beyond 100k characters', async () => {
    await writeFile(path.join(root, 'big.md'), 'x'.repeat(100_001), 'utf-8');
    const result = await emulator.run('cat big.md');
    expect(result.output.endsWith('…[truncated]')).toBe(true);
    expect(result.output.length).toBe(100_000 + '…[truncated]'.length);
  });

  it('wc counts lines, words, and chars with flag selection', async () => {
    await writeFile(path.join(root, 'counts.md'), 'one two\nthree\n', 'utf-8');

    expect((await emulator.run('wc counts.md')).output).toBe('2 3 14 counts.md');
    expect((await emulator.run('wc -l counts.md')).output).toBe('2 counts.md');
    expect((await emulator.run('wc -w counts.md')).output).toBe('3 counts.md');
    expect((await emulator.run('wc -c counts.md')).output).toBe('14 counts.md');
  });
});

describe('ls / mv / cp', () => {
  it('ls sorts entries and marks directories with a trailing slash', async () => {
    await mkdir(path.join(root, 'zdir'));
    await writeFile(path.join(root, 'afile.md'), 'x', 'utf-8');

    expect((await emulator.run('ls')).output).toBe('afile.md\nzdir/');
    expect((await emulator.run('ls zdir')).output).toBe('(empty directory)');
  });

  it('mv renames and cp copies (recursively for directories)', async () => {
    await writeFile(path.join(root, 'src.md'), 'movable', 'utf-8');
    await emulator.run('mv src.md dest.md');
    expect(await readFile(path.join(root, 'dest.md'), 'utf-8')).toBe('movable');

    await mkdir(path.join(root, 'dir'));
    await writeFile(path.join(root, 'dir', 'inner.md'), 'copy me', 'utf-8');
    await emulator.run('cp dir dir2');
    expect(await readFile(path.join(root, 'dir2', 'inner.md'), 'utf-8')).toBe('copy me');

    await expect(emulator.run('mv onlyone')).rejects.toThrow(/mv requires/);
    await expect(emulator.run('cp onlyone')).rejects.toThrow(/cp requires/);
  });
});

describe('find', () => {
  beforeEach(async () => {
    await mkdir(path.join(root, 'chapters', '01-one'), { recursive: true });
    await writeFile(path.join(root, 'chapters', '01-one', 'draft.md'), 'x', 'utf-8');
    await writeFile(path.join(root, 'chapters', '01-one', 'notes.md'), 'x', 'utf-8');
    await writeFile(path.join(root, 'about.json'), '{}', 'utf-8');
  });

  it('filters by -name glob and -type', async () => {
    const drafts = await emulator.run('find . -name draft.md');
    expect(drafts.output).toBe(path.join('.', 'chapters', '01-one', 'draft.md'));

    const dirs = await emulator.run('find chapters -type d');
    expect(dirs.output).toBe(path.join('chapters', '01-one'));

    const globbed = await emulator.run('find . -name *.json -type f');
    expect(globbed.output).toBe(path.join('.', 'about.json'));
  });

  it('reports no matches, validates -type, and ignores unknown value-less flags', async () => {
    expect((await emulator.run('find . -name zzz.md')).output).toBe('(no matches)');
    await expect(emulator.run('find . -type x')).rejects.toThrow(/find -type requires f or d/);
    // Value-less unknown flags are ignored. (Valued ones like `-maxdepth 1`
    // are NOT: the value token becomes the start path — see STATE handoff.)
    expect((await emulator.run('find . -print -name about.json')).output).toContain('about.json');
  });
});
