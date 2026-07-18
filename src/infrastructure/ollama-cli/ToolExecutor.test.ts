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
