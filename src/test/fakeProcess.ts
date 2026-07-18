/**
 * Scripted fake child processes for testing CLI clients (claude/codex/ollama).
 *
 * Usage:
 *   const fake = makeFakeSpawn();
 *   // wire fake.spawnMock into vi.mock('child_process', ...) via a vi.hoisted holder
 *   const child = await fake.waitForChild();   // after triggering the client
 *   child.pushStdout('{"type":"result"}\n');
 *   child.exit(0);
 *
 * The fake captures spawn args/options and everything written to stdin.
 */
import { EventEmitter } from 'node:events';
import { vi } from 'vitest';

class FakeStdin extends EventEmitter {
  written = '';
  writableEnded = false;
  writableFinished = false;

  write(chunk: string | Buffer): boolean {
    this.written += chunk.toString();
    return true;
  }

  end(): void {
    this.writableEnded = true;
    this.writableFinished = true;
  }
}

export class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = new FakeStdin();
  pid = 4242;
  killed = false;
  killSignals: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.killed = true;
    this.killSignals.push(signal);
    return true;
  }

  /** Emit a chunk on stdout (raw — split/merge lines yourself to test reassembly). */
  pushStdout(text: string): void {
    this.stdout.emit('data', Buffer.from(text, 'utf-8'));
  }

  pushStderr(text: string): void {
    this.stderr.emit('data', Buffer.from(text, 'utf-8'));
  }

  /** Emit 'close' with an exit code. */
  exit(code: number): void {
    this.emit('close', code);
  }

  /** Emit a spawn-level 'error' (e.g. ENOENT when the CLI is not installed). */
  fail(err: NodeJS.ErrnoException): void {
    this.emit('error', err);
  }
}

export type SpawnCall = {
  command: string;
  args: string[];
  options: Record<string, unknown>;
};

export function makeFakeSpawn() {
  const children: FakeChildProcess[] = [];
  const calls: SpawnCall[] = [];

  const spawnMock = vi.fn(
    (command: string, args: string[], options: Record<string, unknown>): FakeChildProcess => {
      const child = new FakeChildProcess();
      children.push(child);
      calls.push({ command, args, options });
      return child;
    }
  );

  return {
    spawnMock,
    children,
    calls,
    lastChild: (): FakeChildProcess => children[children.length - 1],
    lastCall: (): SpawnCall => calls[calls.length - 1],
    /** Poll until the client (which awaits async setup first) has called spawn. */
    waitForChild: async (index = 0): Promise<FakeChildProcess> => {
      await vi.waitFor(() => {
        if (children.length <= index) throw new Error('spawn not called yet');
      });
      return children[index];
    },
  };
}

export type FakeSpawn = ReturnType<typeof makeFakeSpawn>;
