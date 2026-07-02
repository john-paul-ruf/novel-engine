import { execFile as execFileCb, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;
const SMOKE_TEST_TIMEOUT_MS = 30_000;

export type OllamaCliModel = {
  name: string;
  id?: string;
  size?: string;
  modified?: string;
};

export class OllamaCliRunner {
  private serveProcess: ChildProcessWithoutNullStreams | null = null;

  constructor(private readonly command = 'ollama') {}

  async detect(): Promise<boolean> {
    try {
      await execFile(this.command, ['--version'], { timeout: DEFAULT_COMMAND_TIMEOUT_MS });
      return true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<OllamaCliModel[]> {
    try {
      const { stdout } = await execFile(this.command, ['list'], { timeout: DEFAULT_COMMAND_TIMEOUT_MS });
      return this.parseListOutput(stdout);
    } catch {
      return [];
    }
  }

  async showModelContext(model: string): Promise<number | undefined> {
    const jsonContext = await this.showModelContextFromJson(model);
    if (jsonContext !== undefined) return jsonContext;

    try {
      const { stdout } = await execFile(this.command, ['show', model], { timeout: DEFAULT_COMMAND_TIMEOUT_MS });
      return this.parseContextFromText(stdout);
    } catch {
      return undefined;
    }
  }

  async runSmokeTest(model: string, prompt = 'Respond with OK.'): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(this.command, ['run', model], { stdio: 'pipe' });
      let settled = false;

      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (!child.killed) {
          child.kill('SIGTERM');
        }
        resolve(ok);
      };

      const timeout = setTimeout(() => finish(false), SMOKE_TEST_TIMEOUT_MS);

      child.once('error', () => finish(false));
      child.once('exit', (code) => finish(code === 0));

      child.stdin.once('error', () => finish(false));
      child.stdin.end(`${prompt}\n`);
    });
  }

  startServe(env?: NodeJS.ProcessEnv): void {
    if (this.serveProcess && !this.serveProcess.killed) return;

    const child = spawn(this.command, ['serve'], {
      env: env ? { ...process.env, ...env } : process.env,
      stdio: 'pipe',
    });
    this.serveProcess = child;

    child.once('error', (err) => {
      console.warn('[OllamaCliRunner] Failed to start `ollama serve`:', err.message);
      if (this.serveProcess === child) this.serveProcess = null;
    });

    child.once('exit', (code, signal) => {
      if (this.serveProcess === child) this.serveProcess = null;
      if (code !== 0 && signal === null) {
        console.warn(`[OllamaCliRunner] \`ollama serve\` exited with code ${code}; it may already be running.`);
      }
    });
  }

  stopServe(): void {
    if (!this.serveProcess) return;
    this.serveProcess.kill('SIGTERM');
    this.serveProcess = null;
  }

  private parseListOutput(output: string): OllamaCliModel[] {
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.toUpperCase().startsWith('NAME '))
      .map((line) => this.parseListLine(line))
      .filter((model): model is OllamaCliModel => model !== null);
  }

  private parseListLine(line: string): OllamaCliModel | null {
    const columns = line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
    if (columns.length >= 4) {
      return {
        name: columns[0],
        id: columns[1],
        size: columns[2],
        modified: columns.slice(3).join(' '),
      };
    }

    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;

    return {
      name: parts[0],
      id: parts[1],
      size: parts.length >= 4 ? `${parts[2]} ${parts[3]}` : parts[2],
      modified: parts.length > 4 ? parts.slice(4).join(' ') : undefined,
    };
  }

  private async showModelContextFromJson(model: string): Promise<number | undefined> {
    try {
      const { stdout } = await execFile(this.command, ['show', model, '--json'], { timeout: DEFAULT_COMMAND_TIMEOUT_MS });
      const parsed: unknown = JSON.parse(stdout);
      return this.findContextNumber(parsed);
    } catch {
      return undefined;
    }
  }

  private findContextNumber(value: unknown): number | undefined {
    if (!value || typeof value !== 'object') return undefined;

    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (
        typeof child === 'number' &&
        Number.isFinite(child) &&
        (normalizedKey.endsWith('contextlength') || normalizedKey === 'numctx')
      ) {
        return child;
      }

      const nested = this.findContextNumber(child);
      if (nested !== undefined) return nested;
    }

    return undefined;
  }

  private parseContextFromText(output: string): number | undefined {
    const patterns = [
      /context\s+length\s*[:=]?\s*(\d+)/i,
      /context\s+window\s*[:=]?\s*(\d+)/i,
      /num_ctx\s*[:=]?\s*(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      const value = match?.[1] ? Number.parseInt(match[1], 10) : undefined;
      if (value && Number.isFinite(value)) return value;
    }

    return undefined;
  }
}
