import * as fs from 'fs/promises';
import * as path from 'path';
import type { OllamaToolCall } from './tools';
import { WRITE_TOOLS } from './tools';

/**
 * Result of executing a single tool call.
 */
export type ToolResult = {
  /** The tool name that was called. */
  toolName: string;
  /** The file path involved, if any (for tracking). */
  filePath?: string;
  /** Whether this tool writes/modifies files (vs read-only). */
  isWrite: boolean;
  /** The result content to send back to the model. */
  content: string;
  /** Whether the tool execution failed. */
  isError: boolean;
};

/**
 * ToolExecutor — Executes tool calls from Ollama's function-calling API.
 *
 * All file operations are sandboxed to the book's working directory.
 * Path traversal attempts (e.g. "../../etc/passwd") are rejected.
 *
 * Supported tools: Read, Write, Edit, LS.
 */
export class ToolExecutor {
  constructor(
    /** Absolute path to the book's root directory. */
    private readonly bookDir: string,
  ) {}

  /**
   * Execute a tool call and return the result.
   *
   * The result content is what gets sent back to Ollama as the tool
   * response in the next turn of the conversation.
   */
  async execute(toolCall: OllamaToolCall): Promise<ToolResult> {
    const { name, arguments: args } = toolCall.function;

    try {
      switch (name) {
        case 'Read':
          return await this.executeRead(args);
        case 'Write':
          return await this.executeWrite(args);
        case 'Edit':
          return await this.executeEdit(args);
        case 'LS':
          return await this.executeLS(args);
        default:
          return {
            toolName: name,
            isWrite: false,
            content: `Unknown tool: ${name}`,
            isError: true,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        toolName: name,
        filePath: (args.file_path ?? args.path) as string | undefined,
        isWrite: WRITE_TOOLS.has(name),
        content: `Error executing ${name}: ${message}`,
        isError: true,
      };
    }
  }

  // ── Tool implementations ──────────────────────────────────────────

  private async executeRead(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = this.requireString(args, 'file_path', 'path', 'file');
    const absPath = this.resolveSafe(filePath);
    const content = await fs.readFile(absPath, 'utf-8');
    return {
      toolName: 'Read',
      filePath,
      isWrite: false,
      content,
      isError: false,
    };
  }

  private async executeWrite(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = this.requireString(args, 'file_path', 'path', 'file');
    const content = this.requireString(args, 'content', 'text', 'data');
    const absPath = this.resolveSafe(filePath);

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, 'utf-8');

    return {
      toolName: 'Write',
      filePath,
      isWrite: true,
      content: `Successfully wrote ${content.length} characters to ${filePath}`,
      isError: false,
    };
  }

  private async executeEdit(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = this.requireString(args, 'file_path', 'path', 'file');
    const oldString = this.requireString(args, 'old_string', 'oldString', 'search', 'find');
    const newString = this.requireString(args, 'new_string', 'newString', 'replace', 'replacement');
    const absPath = this.resolveSafe(filePath);

    const existing = await fs.readFile(absPath, 'utf-8');

    // Verify old_string appears exactly once
    const firstIndex = existing.indexOf(oldString);
    if (firstIndex === -1) {
      return {
        toolName: 'Edit',
        filePath,
        isWrite: true,
        content: `Edit failed: old_string not found in ${filePath}`,
        isError: true,
      };
    }

    const secondIndex = existing.indexOf(oldString, firstIndex + 1);
    if (secondIndex !== -1) {
      return {
        toolName: 'Edit',
        filePath,
        isWrite: true,
        content: `Edit failed: old_string appears multiple times in ${filePath}. Provide more context to make it unique.`,
        isError: true,
      };
    }

    const updated = existing.replace(oldString, newString);
    await fs.writeFile(absPath, updated, 'utf-8');

    return {
      toolName: 'Edit',
      filePath,
      isWrite: true,
      content: `Successfully edited ${filePath}`,
      isError: false,
    };
  }

  private async executeLS(args: Record<string, unknown>): Promise<ToolResult> {
    const dirPath = this.requireString(args, 'path', 'file_path', 'dir', 'directory');
    const absPath = this.resolveSafe(dirPath);

    const entries = await fs.readdir(absPath, { withFileTypes: true });
    const listing = entries
      .map((e) => e.isDirectory() ? `${e.name}/` : e.name)
      .sort()
      .join('\n');

    return {
      toolName: 'LS',
      filePath: dirPath,
      isWrite: false,
      content: listing || '(empty directory)',
      isError: false,
    };
  }

  // ── Safety helpers ────────────────────────────────────────────────

  /**
   * Resolve a relative path within the book directory.
   * Rejects any path that would escape the sandbox.
   */
  private resolveSafe(relativePath: string): string {
    const resolved = path.resolve(this.bookDir, relativePath);
    if (!resolved.startsWith(this.bookDir)) {
      throw new Error(`Path traversal blocked: "${relativePath}" resolves outside the book directory`);
    }
    return resolved;
  }

  /**
   * Extract a required string argument with robust normalization.
   *
   * Small/medium Ollama models frequently produce malformed arguments:
   * - Nested objects: `{ file_path: { path: "about.json" } }` → extract inner string
   * - JSON strings: `{ file_path: '{"path":"about.json"}' }` → parse and extract
   * - Wrong key names: `{ path: "about.json" }` when `file_path` is expected → try fallbacks
   * - Array wrapping: `{ file_path: ["about.json"] }` → unwrap
   *
   * This method tries progressively harder to extract a usable string value.
   */
  private requireString(args: Record<string, unknown>, key: string, ...fallbackKeys: string[]): string {
    // Try the primary key and all fallbacks
    const keysToTry = [key, ...fallbackKeys];

    for (const k of keysToTry) {
      const value = args[k];
      if (value === undefined || value === null) continue;

      const extracted = this.extractStringValue(value);
      if (extracted !== null) return extracted;
    }

    // Last resort: if there's only one string value in args, use it
    const stringValues = Object.values(args).filter((v): v is string => typeof v === 'string');
    if (stringValues.length === 1) {
      return stringValues[0];
    }

    throw new Error(`Missing required argument: ${key} (tried: ${keysToTry.join(', ')})`);
  }

  /**
   * Try to extract a string from a value that may be nested, wrapped, or stringified.
   */
  private extractStringValue(value: unknown): string | null {
    // Direct string — happy path
    if (typeof value === 'string') {
      // Could be a JSON-stringified object — try to parse
      if (value.startsWith('{') || value.startsWith('[')) {
        try {
          const parsed = JSON.parse(value);
          const inner = this.extractStringValue(parsed);
          if (inner) return inner;
        } catch {
          // Not valid JSON — use as-is
        }
      }
      return value;
    }

    // Number/boolean — coerce to string
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    // Array — unwrap first element
    if (Array.isArray(value) && value.length > 0) {
      return this.extractStringValue(value[0]);
    }

    // Object — try common inner key names, then first string value
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;

      // Try well-known inner keys
      const innerKeys = ['path', 'file_path', 'filePath', 'file', 'name', 'content', 'text', 'value'];
      for (const ik of innerKeys) {
        if (typeof obj[ik] === 'string') return obj[ik] as string;
      }

      // Take the first string value found
      for (const v of Object.values(obj)) {
        if (typeof v === 'string') return v;
      }
    }

    return null;
  }
}
