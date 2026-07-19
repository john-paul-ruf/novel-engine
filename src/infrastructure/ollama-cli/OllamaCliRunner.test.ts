import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSpawn, type FakeSpawn } from '../../test/fakeProcess';

const holder = vi.hoisted(() => ({
  spawn: undefined as ((...args: unknown[]) => unknown) | undefined,
  execFile: undefined as ((cmd: string, args: string[], opts?: object) => Promise<{ stdout: string; stderr: string }>) | undefined,
}));

vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  const execFile = Object.assign(
    () => undefined,
    { [promisify.custom]: (cmd: string, args: string[], opts?: object) => holder.execFile?.(cmd, args, opts) }
  );
  return { spawn: (...args: unknown[]) => holder.spawn?.(...args), execFile };
});

import { OllamaCliRunner } from './OllamaCliRunner';

const LIST_OUTPUT = [
  'NAME                ID              SIZE      MODIFIED',
  'llama3.2:latest     a80c4f17acd5    2.0 GB    3 weeks ago',
  'qwen2.5-coder:7b    2b0496514337    4.7 GB    2 days ago',
  '',
].join('\n');

let fake: FakeSpawn;
let runner: OllamaCliRunner;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  fake = makeFakeSpawn();
  holder.spawn = fake.spawnMock as unknown as (...args: unknown[]) => unknown;
  holder.execFile = vi.fn(async () => ({ stdout: '', stderr: '' }));
  runner = new OllamaCliRunner();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('detect / listModels', () => {
  it('detect reflects whether ollama --version succeeds', async () => {
    holder.execFile = vi.fn(async () => ({ stdout: 'ollama version 0.5.0', stderr: '' }));
    expect(await runner.detect()).toBe(true);

    holder.execFile = vi.fn(async () => {
      throw new Error('ENOENT');
    });
    expect(await runner.detect()).toBe(false);
  });

  it('parses the tabular `ollama list` output, skipping the header', async () => {
    holder.execFile = vi.fn(async () => ({ stdout: LIST_OUTPUT, stderr: '' }));

    expect(await runner.listModels()).toEqual([
      { name: 'llama3.2:latest', id: 'a80c4f17acd5', size: '2.0 GB', modified: '3 weeks ago' },
      { name: 'qwen2.5-coder:7b', id: '2b0496514337', size: '4.7 GB', modified: '2 days ago' },
    ]);
  });

  it('falls back to whitespace splitting for irregular lines and returns [] on failure', async () => {
    holder.execFile = vi.fn(async () => ({ stdout: 'mistral abc123 4.1 GB\n', stderr: '' }));
    expect(await runner.listModels()).toEqual([
      { name: 'mistral', id: 'abc123', size: '4.1 GB', modified: undefined },
    ]);

    holder.execFile = vi.fn(async () => {
      throw new Error('not installed');
    });
    expect(await runner.listModels()).toEqual([]);
  });
});

describe('showModelContext', () => {
  it('prefers the JSON output, finding nested context_length fields', async () => {
    holder.execFile = vi.fn(async (_cmd: string, args: string[]) => {
      if (args.includes('--json')) {
        return { stdout: JSON.stringify({ model_info: { 'llama.context_length': 131072 } }), stderr: '' };
      }
      throw new Error('should not fall through');
    });

    expect(await runner.showModelContext('llama3.2')).toBe(131072);
  });

  it('falls back to text parsing when --json is unsupported', async () => {
    holder.execFile = vi.fn(async (_cmd: string, args: string[]) => {
      if (args.includes('--json')) throw new Error('unknown flag');
      return { stdout: '  Model\n    context length    8192\n', stderr: '' };
    });

    expect(await runner.showModelContext('llama3.2')).toBe(8192);
  });

  it('returns undefined when neither source yields a number', async () => {
    holder.execFile = vi.fn(async (_cmd: string, args: string[]) => {
      if (args.includes('--json')) return { stdout: '{"no":"context"}', stderr: '' };
      return { stdout: 'nothing useful', stderr: '' };
    });

    expect(await runner.showModelContext('llama3.2')).toBeUndefined();
  });
});

describe('runSmokeTest', () => {
  it('resolves true on exit 0 and false on nonzero exit or spawn error', async () => {
    const ok = runner.runSmokeTest('llama3.2');
    fake.lastChild().emit('exit', 0);
    expect(await ok).toBe(true);
    expect(fake.lastCall().args).toEqual(['run', 'llama3.2']);
    expect(fake.lastChild().stdin.writableEnded).toBe(true);

    const bad = runner.runSmokeTest('llama3.2');
    fake.lastChild().emit('exit', 1);
    expect(await bad).toBe(false);

    const broken = runner.runSmokeTest('llama3.2');
    fake.lastChild().emit('error', new Error('ENOENT'));
    expect(await broken).toBe(false);
  });
});

describe('serve lifecycle', () => {
  it('startServe spawns once while alive; stopServe SIGTERMs it', () => {
    runner.startServe();
    runner.startServe(); // no-op — already running
    expect(fake.children.length).toBe(1);
    expect(fake.lastCall().args).toEqual(['serve']);

    runner.stopServe();
    expect(fake.lastChild().killSignals).toEqual(['SIGTERM']);

    runner.startServe(); // restart allowed after stop
    expect(fake.children.length).toBe(2);
  });

  it('a serve process that errors clears state and allows a restart', () => {
    runner.startServe();
    fake.lastChild().emit('error', new Error('spawn failed'));

    runner.startServe();
    expect(fake.children.length).toBe(2);
  });

  it('warns when serve exits nonzero without a signal (port already bound)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    runner.startServe();
    fake.lastChild().emit('exit', 1, null);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('may already be running'));
  });
});
