import { describe, expect, it } from 'vitest';
import { OLLAMA_TOOLS, READ_TOOLS, WRITE_TOOLS } from './tools';
import { ToolExecutor } from './ToolExecutor';

describe('OLLAMA_TOOLS definitions', () => {
  it('tool names are unique and every definition is a well-formed function schema', () => {
    const names = OLLAMA_TOOLS.map((t) => t.function.name);
    expect(new Set(names).size).toBe(names.length);

    for (const tool of OLLAMA_TOOLS) {
      expect(tool.type).toBe('function');
      expect(tool.function.name.length).toBeGreaterThan(0);
      expect(tool.function.description.length).toBeGreaterThan(0);
      expect(tool.function.parameters.type).toBe('object');
      for (const prop of Object.values(tool.function.parameters.properties)) {
        expect(prop.type.length).toBeGreaterThan(0);
        expect(prop.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('every required field exists in properties', () => {
    for (const tool of OLLAMA_TOOLS) {
      const propKeys = Object.keys(tool.function.parameters.properties);
      for (const required of tool.function.parameters.required) {
        expect(propKeys, `${tool.function.name} requires undeclared ${required}`).toContain(required);
      }
    }
  });

  it('matches the tool set granted to the Claude CLI', () => {
    expect(OLLAMA_TOOLS.map((t) => t.function.name).sort()).toEqual([
      'Bash',
      'Edit',
      'LS',
      'Read',
      'WebSearch',
      'Write',
    ]);
  });

  it('READ_TOOLS and WRITE_TOOLS partition the file tools', () => {
    expect([...READ_TOOLS].sort()).toEqual(['LS', 'Read']);
    expect([...WRITE_TOOLS].sort()).toEqual(['Edit', 'Write']);
  });

  it('every defined tool has a ToolExecutor dispatch branch', async () => {
    const executor = new ToolExecutor('/nonexistent-dir');
    for (const tool of OLLAMA_TOOLS) {
      // Empty args force the missing-argument error path, which proves the
      // dispatch branch exists without touching the filesystem or network.
      const result = await executor.execute({ function: { name: tool.function.name, arguments: {} } });
      expect(result.isError).toBe(true);
      expect(result.content, `no dispatch for ${tool.function.name}`).not.toContain('Unknown tool');
    }
  });
});
