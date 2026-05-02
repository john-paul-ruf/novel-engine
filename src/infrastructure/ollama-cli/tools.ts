/**
 * Tool definitions for the Ollama function-calling API.
 *
 * These match the subset of tools that ClaudeCodeClient exposes via
 * `--allowedTools` — Read, Write, Edit, LS, and limited Bash commands.
 *
 * Ollama uses the OpenAI-compatible tool schema format:
 * https://ollama.com/blog/tool-support
 */

/**
 * A single tool definition in Ollama's expected format.
 * Follows the OpenAI function-calling schema.
 */
export type OllamaToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required: string[];
    };
  };
};

/** Tool call as returned by Ollama in the NDJSON stream. */
export type OllamaToolCall = {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
};

/**
 * All tools available to Ollama agents.
 *
 * The agent operates within a book's working directory, so all file
 * paths are relative to the book root (e.g. "source/pitch.md",
 * "chapters/01-opening/draft.md").
 */
export const OLLAMA_TOOLS: OllamaToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'Read',
      description: 'Read the contents of a file. The file path is relative to the book root directory.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Relative path to the file to read (e.g. "source/pitch.md", "chapters/01-opening/draft.md")',
          },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'Write',
      description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does. The file path is relative to the book root directory.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Relative path to the file to write (e.g. "source/reader-report.md")',
          },
          content: {
            type: 'string',
            description: 'The full content to write to the file',
          },
        },
        required: ['file_path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'Edit',
      description: 'Replace a specific string in a file. The old_string must appear exactly once in the file. Use this for targeted edits rather than rewriting the entire file.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Relative path to the file to edit',
          },
          old_string: {
            type: 'string',
            description: 'The exact text to find and replace (must be unique in the file)',
          },
          new_string: {
            type: 'string',
            description: 'The replacement text',
          },
        },
        required: ['file_path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'LS',
      description: 'List files and directories at a given path. Returns a newline-separated list of entries. The path is relative to the book root directory.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative directory path to list (e.g. "chapters/", "source/"). Use "." for the book root.',
          },
        },
        required: ['path'],
      },
    },
  },
];

/** Tool names that read files (for progress stage inference). */
export const READ_TOOLS = new Set(['Read', 'LS']);

/** Tool names that write/modify files (for progress stage and file tracking). */
export const WRITE_TOOLS = new Set(['Write', 'Edit']);
