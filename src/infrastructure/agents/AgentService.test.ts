import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_REGISTRY } from '@domain/constants';
import { AgentService } from './AgentService';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

let agentsDir: string;

async function writeAgentFile(filename: string, content: string): Promise<void> {
  await writeFile(join(agentsDir, filename), content, 'utf-8');
}

beforeEach(async () => {
  agentsDir = await makeTempDir();
});

afterEach(async () => {
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

describe('loadAll', () => {
  it('returns creative agents in pipeline order with their prompts and registry metadata', async () => {
    await writeAgentFile('VERITY-CORE.md', 'verity prompt');
    await writeAgentFile('SPARK.md', 'spark prompt');
    await writeAgentFile('GHOSTLIGHT.md', 'ghostlight prompt');

    const agents = await new AgentService(agentsDir).loadAll();

    // Pipeline order: pitch (Spark) → scaffold (Verity) → first-read (Ghostlight)
    expect(agents.map((a) => a.name)).toEqual(['Spark', 'Verity', 'Ghostlight']);
    const spark = agents[0];
    expect(spark.systemPrompt).toBe('spark prompt');
    expect(spark.role).toBe(AGENT_REGISTRY.Spark.role);
    expect(spark.color).toBe(AGENT_REGISTRY.Spark.color);
  });

  it('excludes Wrangler and Helper from the creative list', async () => {
    await writeAgentFile('SPARK.md', 'spark');
    await writeAgentFile('WRANGLER.md', 'wrangler');
    await writeAgentFile('HELPER.md', 'helper');

    const agents = await new AgentService(agentsDir).loadAll();
    expect(agents.map((a) => a.name)).toEqual(['Spark']);
  });

  it('ignores .md files that match no registry entry', async () => {
    await writeAgentFile('SPARK.md', 'spark');
    await writeAgentFile('CUSTOM-AGENT.md', 'not registered');
    await writeAgentFile('notes.txt', 'not markdown');

    const agents = await new AgentService(agentsDir).loadAll();
    expect(agents.map((a) => a.name)).toEqual(['Spark']);
  });

  it('matches filenames case-insensitively', async () => {
    await writeAgentFile('spark.md', 'lowercase file');
    const agents = await new AgentService(agentsDir).loadAll();
    expect(agents.map((a) => a.name)).toEqual(['Spark']);
    // Canonical registry filename is reported, not the on-disk casing
    expect(agents[0].filename).toBe('SPARK.md');
  });

  it('loads an empty agent file as an empty system prompt', async () => {
    await writeAgentFile('SPARK.md', '');
    const agents = await new AgentService(agentsDir).loadAll();
    expect(agents[0].systemPrompt).toBe('');
  });

  it('throws with the directory path when the agents dir is missing', async () => {
    const service = new AgentService(join(agentsDir, 'does-not-exist'));
    await expect(service.loadAll()).rejects.toThrow(/does-not-exist/);
  });
});

describe('load', () => {
  it('loads non-creative agents like Wrangler by name', async () => {
    await writeAgentFile('WRANGLER.md', 'wrangler prompt');
    const agent = await new AgentService(agentsDir).load('Wrangler');
    expect(agent.systemPrompt).toBe('wrangler prompt');
  });

  it('throws a helpful error when a registered agent has no file on disk', async () => {
    await writeAgentFile('SPARK.md', 'spark');
    const service = new AgentService(agentsDir);
    await expect(service.load('Lumen')).rejects.toThrow(/LUMEN\.md/);
  });
});

describe('caching', () => {
  it('caches the directory scan until invalidateCache is called', async () => {
    await writeAgentFile('SPARK.md', 'spark');
    const service = new AgentService(agentsDir);
    expect((await service.loadAll()).length).toBe(1);

    await writeAgentFile('VERITY-CORE.md', 'verity');
    expect((await service.loadAll()).length).toBe(1); // still cached

    service.invalidateCache();
    expect((await service.loadAll()).length).toBe(2);
  });
});

describe('loadComposite', () => {
  it('concatenates base and supplements with separators', async () => {
    await writeAgentFile('VERITY-CORE.md', 'core');
    await writeAgentFile('VERITY-DRAFT.md', 'draft');
    const prompt = await new AgentService(agentsDir).loadComposite('VERITY-CORE.md', ['VERITY-DRAFT.md']);
    expect(prompt).toBe('core\n\n---\n\ndraft');
  });

  it('skips missing supplements with a warning instead of failing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await writeAgentFile('VERITY-CORE.md', 'core');
    const prompt = await new AgentService(agentsDir).loadComposite('VERITY-CORE.md', ['MISSING.md']);
    expect(prompt).toBe('core');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('throws when the base file is missing', async () => {
    const service = new AgentService(agentsDir);
    await expect(service.loadComposite('MISSING-BASE.md', [])).rejects.toThrow(/MISSING-BASE\.md/);
  });
});

describe('loadRaw', () => {
  it('returns file content and throws for missing files', async () => {
    await writeAgentFile('SPARK.md', 'raw content');
    const service = new AgentService(agentsDir);
    expect(await service.loadRaw('SPARK.md')).toBe('raw content');
    await expect(service.loadRaw('NOPE.md')).rejects.toThrow(/NOPE\.md/);
  });
});
