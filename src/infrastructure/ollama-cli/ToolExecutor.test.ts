import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToolExecutor } from './ToolExecutor';

describe('ToolExecutor Write', () => {
  let tempDir: string;
  let toolExecutor: ToolExecutor;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ne-tool-exec-'));
    toolExecutor = new ToolExecutor(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('preserves the full object when Write content is a JSON string (about.json regression)', async () => {
    const args = {
      file_path: 'about.json',
      content: JSON.stringify({
        title: 'The Test Manuscript',
        author: 'Test Author',
        status: 'scaffolded',
        created: '2026-07-18T16:00:00.000Z',
        coverImage: '',
        genre: '',
        targetAudience: '',
        description: '',
        tags: [],
        wordCountTarget: 80000,
        wordCountCurrent: 0,
        version: '1.0.0',
      }, null, 2),
    };

    const result = await toolExecutor.execute({ function: { name: 'Write', arguments: args } });
    expect(result.isError).toBe(false);

    const onDisk = await fs.readFile(path.join(tempDir, 'about.json'), 'utf-8');
    expect(JSON.parse(onDisk).title).toBe('The Test Manuscript');
    expect(JSON.parse(onDisk).wordCountTarget).toBe(80000);
    expect(onDisk).not.toBe('The Test Manuscript'); // the exact corruption signature
  });

  it('restores the raw JSON argument when extraction mangles a .json write (guard)', async () => {
    const args = {
      file_path: 'about.json',
      content: 'The Test Manuscript', // what extractStringValue would have produced pre-fix
      text: JSON.stringify({ title: 'The Test Manuscript', author: 'Test Author' }),
    };

    const result = await toolExecutor.execute({ function: { name: 'Write', arguments: args } });

    const onDisk = await fs.readFile(path.join(tempDir, 'about.json'), 'utf-8');
    expect(JSON.parse(onDisk).author).toBe('Test Author');
    expect(result.content).toContain('restored raw argument');
  });

  it('writes non-JSON files verbatim without the guard interfering', async () => {
    const args = { file_path: 'source/pitch.md', content: '# Pitch\n\nA test pitch.\n' };

    const result = await toolExecutor.execute({ function: { name: 'Write', arguments: args } });
    expect(result.isError).toBe(false);

    const onDisk = await fs.readFile(path.join(tempDir, 'source/pitch.md'), 'utf-8');
    expect(onDisk).toBe('# Pitch\n\nA test pitch.\n');
  });

  it('still unwraps a malformed nested file_path (recovery path intact)', async () => {
    const args = { file_path: { path: 'source/x.md' }, content: 'hi' };

    const result = await toolExecutor.execute({ function: { name: 'Write', arguments: args } });
    expect(result.isError).toBe(false);

    const onDisk = await fs.readFile(path.join(tempDir, 'source/x.md'), 'utf-8');
    expect(onDisk).toBe('hi');
  });
});

describe('ToolExecutor dispatch + sandbox', () => {
  let tempDir: string;
  let executor: ToolExecutor;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ne-tool-exec-'));
    executor = new ToolExecutor(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function call(name: string, args: Record<string, unknown>) {
    return executor.execute({ function: { name, arguments: args } });
  }

  it('Read returns file content; missing files become error results, not throws', async () => {
    await fs.writeFile(path.join(tempDir, 'note.md'), 'the content', 'utf-8');

    const ok = await call('Read', { file_path: 'note.md' });
    expect(ok).toMatchObject({ toolName: 'Read', isWrite: false, isError: false, content: 'the content' });

    const missing = await call('Read', { file_path: 'ghost.md' });
    expect(missing.isError).toBe(true);
    expect(missing.content).toMatch(/^Error executing Read:/);
  });

  it('Edit replaces a unique old_string and reports non-unique or missing matches as errors', async () => {
    await fs.writeFile(path.join(tempDir, 'draft.md'), 'alpha beta alpha', 'utf-8');

    const notFound = await call('Edit', { file_path: 'draft.md', old_string: 'gamma', new_string: 'x' });
    expect(notFound).toMatchObject({ isError: true, content: expect.stringContaining('not found') });

    const ambiguous = await call('Edit', { file_path: 'draft.md', old_string: 'alpha', new_string: 'x' });
    expect(ambiguous).toMatchObject({ isError: true, content: expect.stringContaining('multiple times') });

    const ok = await call('Edit', { file_path: 'draft.md', old_string: 'beta', new_string: 'B' });
    expect(ok.isError).toBe(false);
    expect(await fs.readFile(path.join(tempDir, 'draft.md'), 'utf-8')).toBe('alpha B alpha');
  });

  it('LS lists sorted entries with directory markers', async () => {
    await fs.mkdir(path.join(tempDir, 'chapters'));
    await fs.writeFile(path.join(tempDir, 'about.json'), '{}', 'utf-8');

    const result = await call('LS', { path: '.' });
    expect(result.content).toBe('about.json\nchapters/');
  });

  it('Bash dispatches to the emulator with the sandbox applied', async () => {
    const made = await call('Bash', { command: 'mkdir chapters/02-two' });
    expect(made).toMatchObject({ toolName: 'Bash', isWrite: true, isError: false });

    const escape = await call('Bash', { command: 'cat ../../etc/passwd' });
    expect(escape.isError).toBe(true);
    expect(escape.content).toContain('Path traversal blocked');
  });

  it('unknown tools return an error result instead of throwing', async () => {
    const result = await call('Frobnicate', { anything: true });
    expect(result).toEqual({
      toolName: 'Frobnicate',
      isWrite: false,
      content: 'Unknown tool: Frobnicate',
      isError: true,
    });
  });

  it.each([
    ['Read', { file_path: '../../etc/passwd' }],
    ['Write', { file_path: '/etc/novel-engine-pwned', content: 'x' }],
    ['LS', { path: '../..' }],
  ])('%s blocks path traversal outside the sandbox', async (name, args) => {
    const result = await executor.execute({ function: { name, arguments: args } });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Path traversal blocked');
  });

  it('additionalRoots grant access to sibling directories by absolute path', async () => {
    const extraRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ne-extra-root-'));
    try {
      await fs.writeFile(path.join(extraRoot, 'shared.md'), 'shared content', 'utf-8');
      const scoped = new ToolExecutor(tempDir, [extraRoot]);

      const ok = await scoped.execute({
        function: { name: 'Read', arguments: { file_path: path.join(extraRoot, 'shared.md') } },
      });
      expect(ok.isError).toBe(false);
      expect(ok.content).toBe('shared content');

      // Still blocked outside both roots
      const blocked = await scoped.execute({
        function: { name: 'Read', arguments: { file_path: '/etc/passwd' } },
      });
      expect(blocked.isError).toBe(true);
    } finally {
      await fs.rm(extraRoot, { recursive: true, force: true });
    }
  });

  it('normalizes malformed arguments: arrays, JSON strings, and lone-string fallback', async () => {
    await fs.writeFile(path.join(tempDir, 'a.md'), 'array unwrap', 'utf-8');
    const arrayWrapped = await call('Read', { file_path: ['a.md'] });
    expect(arrayWrapped.content).toBe('array unwrap');

    await fs.writeFile(path.join(tempDir, 'b.md'), 'json string', 'utf-8');
    const jsonString = await call('Read', { file_path: '{"path":"b.md"}' });
    expect(jsonString.content).toBe('json string');

    await fs.writeFile(path.join(tempDir, 'c.md'), 'lone string', 'utf-8');
    const wrongKey = await call('Read', { totally_wrong_key: 'c.md' });
    expect(wrongKey.content).toBe('lone string');

    const empty = await call('Read', {});
    expect(empty.isError).toBe(true);
    expect(empty.content).toContain('Missing required argument: file_path');
  });
});
