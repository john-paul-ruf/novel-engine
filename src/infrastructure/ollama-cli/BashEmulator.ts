import * as fs from 'fs/promises';
import * as path from 'path';

/** Result of an emulated Bash command. */
export type BashResult = {
  /** stdout-equivalent text to return to the model. */
  output: string;
  /** Whether the command modified the file system. */
  isWrite: boolean;
  /** Primary path involved (for file tracking), if any. */
  filePath?: string;
};

/** The exact whitelist ClaudeCodeClient grants via --allowedTools. */
const ALLOWED_COMMANDS = new Set(['mkdir', 'cat', 'mv', 'cp', 'ls', 'find', 'wc', 'rm', 'rmdir']);

/** Shell constructs that are never supported (no shell is spawned). */
const FORBIDDEN_SEQUENCES = ['|', '&', ';', '<', '>', '`', '$(', '${', '\n'];

/** Maximum characters returned by `cat` before truncation. */
const CAT_OUTPUT_CAP = 100_000;

/** Maximum results returned by `find` before truncation. */
const FIND_RESULT_CAP = 500;

/**
 * BashEmulator — emulates a whitelisted coreutils subset with Node fs APIs.
 *
 * No shell is ever spawned. Pipes, redirection, chaining, substitution and
 * globbing are rejected. Every path argument is resolved through the injected
 * `resolvePath` (ToolExecutor.resolveSafe), so the ToolExecutor sandbox applies.
 */
export class BashEmulator {
  constructor(
    /** Resolves a path and throws if it escapes the allowed roots. */
    private readonly resolvePath: (p: string) => string,
  ) {}

  /**
   * Parse and execute a single whitelisted command.
   * Throws with a model-readable message on any unsupported construct.
   */
  async run(command: string): Promise<BashResult> {
    const tokens = this.parse(command);
    const cmd = tokens[0];
    const rest = tokens.slice(1);

    switch (cmd) {
      case 'mkdir': return this.mkdir(rest);
      case 'cat': return this.cat(rest);
      case 'ls': return this.ls(rest);
      case 'mv': return this.mv(rest);
      case 'cp': return this.cp(rest);
      case 'rm': return this.rm(rest);
      case 'rmdir': return this.rmdir(rest);
      case 'wc': return this.wc(rest);
      case 'find': return this.find(rest);
      default:
        // Unreachable — parse() validates against ALLOWED_COMMANDS
        throw new Error(`Unhandled command: ${cmd}`);
    }
  }

  // ── Parsing ───────────────────────────────────────────────────────

  /**
   * Reject shell metacharacters, tokenize with quote support, and
   * validate the command name against the whitelist.
   */
  private parse(command: string): string[] {
    for (const seq of FORBIDDEN_SEQUENCES) {
      if (command.includes(seq)) {
        const shown = seq === '\n' ? '\\n' : seq;
        throw new Error(
          `Unsupported shell syntax: "${shown}". Run one plain command — pipes, redirection, chaining, and substitution are not available.`,
        );
      }
    }

    const tokens: string[] = [];
    let current = '';
    let quote: string | null = null;
    let inToken = false;

    for (const ch of command) {
      if (quote) {
        if (ch === quote) quote = null;
        else current += ch;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
        inToken = true;
      } else if (ch === ' ' || ch === '\t') {
        if (inToken) {
          tokens.push(current);
          current = '';
          inToken = false;
        }
      } else {
        current += ch;
        inToken = true;
      }
    }
    if (quote) throw new Error('Unterminated quote in command');
    if (inToken) tokens.push(current);

    if (tokens.length === 0) throw new Error('Empty command');
    if (!ALLOWED_COMMANDS.has(tokens[0])) {
      throw new Error(
        `Command not allowed: "${tokens[0]}". Allowed: mkdir, cat, mv, cp, ls, find, wc, rm, rmdir`,
      );
    }
    return tokens;
  }

  /** Separate flag tokens (leading "-") from path arguments. */
  private splitArgs(tokens: string[]): { flags: Set<string>; paths: string[] } {
    const flags = new Set<string>();
    const paths: string[] = [];
    for (const t of tokens) {
      if (t.startsWith('-')) flags.add(t);
      else paths.push(t);
    }
    return { flags, paths };
  }

  // ── Commands ──────────────────────────────────────────────────────

  private async mkdir(tokens: string[]): Promise<BashResult> {
    const { paths } = this.splitArgs(tokens);
    if (paths.length === 0) throw new Error('mkdir requires: mkdir <directory>...');
    const lines: string[] = [];
    for (const p of paths) {
      await fs.mkdir(this.resolvePath(p), { recursive: true });
      lines.push(`Created directory ${p}`);
    }
    return { output: lines.join('\n'), isWrite: true, filePath: paths[paths.length - 1] };
  }

  private async cat(tokens: string[]): Promise<BashResult> {
    const { paths } = this.splitArgs(tokens);
    if (paths.length === 0) throw new Error('cat requires: cat <file>...');
    let output = '';
    for (const p of paths) {
      if (output.length >= CAT_OUTPUT_CAP) break;
      output += await fs.readFile(this.resolvePath(p), 'utf-8');
    }
    if (output.length > CAT_OUTPUT_CAP) {
      output = output.slice(0, CAT_OUTPUT_CAP) + '…[truncated]';
    }
    return { output, isWrite: false, filePath: paths[paths.length - 1] };
  }

  private async ls(tokens: string[]): Promise<BashResult> {
    const { paths } = this.splitArgs(tokens);
    const target = paths[0] ?? '.';
    const entries = await fs.readdir(this.resolvePath(target), { withFileTypes: true });
    const listing = entries
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort()
      .join('\n');
    return { output: listing || '(empty directory)', isWrite: false, filePath: target };
  }

  private async mv(tokens: string[]): Promise<BashResult> {
    const { paths } = this.splitArgs(tokens);
    if (paths.length !== 2) throw new Error('mv requires: mv <source> <dest>');
    const [src, dest] = paths;
    const absSrc = this.resolvePath(src);
    const absDest = this.resolvePath(dest);
    try {
      await fs.rename(absSrc, absDest);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        // Cross-device move — copy then delete
        await fs.cp(absSrc, absDest, { recursive: true });
        await fs.rm(absSrc, { recursive: true });
      } else {
        throw err;
      }
    }
    return { output: `Moved ${src} → ${dest}`, isWrite: true, filePath: dest };
  }

  private async cp(tokens: string[]): Promise<BashResult> {
    const { paths } = this.splitArgs(tokens);
    if (paths.length !== 2) throw new Error('cp requires: cp [-r] <source> <dest>');
    const [src, dest] = paths;
    // Always recursive — harmless for single files
    await fs.cp(this.resolvePath(src), this.resolvePath(dest), { recursive: true });
    return { output: `Copied ${src} → ${dest}`, isWrite: true, filePath: dest };
  }

  private async rm(tokens: string[]): Promise<BashResult> {
    const { flags, paths } = this.splitArgs(tokens);
    if (paths.length === 0) throw new Error('rm requires: rm [-rf] <path>...');
    const recursive = flags.has('-r') || flags.has('-rf') || flags.has('-fr');
    const force = flags.has('-f') || flags.has('-rf') || flags.has('-fr');
    const lines: string[] = [];
    for (const p of paths) {
      await fs.rm(this.resolvePath(p), { recursive, force });
      lines.push(`Removed ${p}`);
    }
    return { output: lines.join('\n'), isWrite: true, filePath: paths[paths.length - 1] };
  }

  private async rmdir(tokens: string[]): Promise<BashResult> {
    const { paths } = this.splitArgs(tokens);
    if (paths.length === 0) throw new Error('rmdir requires: rmdir <directory>...');
    const lines: string[] = [];
    for (const p of paths) {
      await fs.rmdir(this.resolvePath(p)); // fails on non-empty — intentional
      lines.push(`Removed directory ${p}`);
    }
    return { output: lines.join('\n'), isWrite: true, filePath: paths[paths.length - 1] };
  }

  private async wc(tokens: string[]): Promise<BashResult> {
    const { flags, paths } = this.splitArgs(tokens);
    if (paths.length === 0) throw new Error('wc requires: wc [-l|-w|-c] <file>...');
    const wantLines = flags.has('-l');
    const wantWords = flags.has('-w');
    const wantChars = flags.has('-c');
    const all = !wantLines && !wantWords && !wantChars;
    const lines: string[] = [];
    for (const p of paths) {
      const content = await fs.readFile(this.resolvePath(p), 'utf-8');
      const counts: number[] = [];
      if (all || wantLines) {
        counts.push(content.length === 0 ? 0 : content.split('\n').length - (content.endsWith('\n') ? 1 : 0));
      }
      if (all || wantWords) counts.push(content.split(/\s+/).filter(Boolean).length);
      if (all || wantChars) counts.push(content.length);
      lines.push(`${counts.join(' ')} ${p}`);
    }
    return { output: lines.join('\n'), isWrite: false, filePath: paths[paths.length - 1] };
  }

  private async find(tokens: string[]): Promise<BashResult> {
    let start = '.';
    let namePattern: RegExp | null = null;
    let typeFilter: 'f' | 'd' | null = null;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === '-name') {
        const glob = tokens[++i];
        if (!glob) throw new Error('find -name requires a pattern');
        namePattern = this.globToRegExp(glob);
      } else if (t === '-type') {
        const v = tokens[++i];
        if (v === 'f' || v === 'd') typeFilter = v;
        else throw new Error('find -type requires f or d');
      } else if (!t.startsWith('-')) {
        start = t;
      }
      // Unknown flags are silently ignored
    }

    const absStart = this.resolvePath(start);
    const results: string[] = [];
    let truncated = false;

    const walk = async (absDir: string, relDir: string): Promise<void> => {
      if (truncated) return;
      const entries = await fs.readdir(absDir, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (results.length >= FIND_RESULT_CAP) {
          truncated = true;
          return;
        }
        const rel = path.join(relDir, entry.name);
        const isDir = entry.isDirectory();
        const typeOk = !typeFilter || (typeFilter === 'd') === isDir;
        const nameOk = !namePattern || namePattern.test(entry.name);
        if (typeOk && nameOk) results.push(rel);
        if (isDir) await walk(path.join(absDir, entry.name), rel);
      }
    };
    await walk(absStart, start);

    let output = results.join('\n') || '(no matches)';
    if (truncated) output += `\n…[truncated at ${FIND_RESULT_CAP} results]`;
    return { output, isWrite: false, filePath: start };
  }

  /** Convert a shell glob (`*`, `?`) to an anchored RegExp; escape everything else. */
  private globToRegExp(glob: string): RegExp {
    const escaped = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  }
}
