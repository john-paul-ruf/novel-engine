import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IAgentService } from '@domain/interfaces';
import type { Agent, AgentMeta, AgentName } from '@domain/types';
import { AGENT_REGISTRY, CREATIVE_AGENT_NAMES, PIPELINE_PHASES } from '@domain/constants';

export class AgentService implements IAgentService {
  /** Cached agent list — .md files don't change while the app is running. */
  private _cache: Agent[] | null = null;

  constructor(private readonly agentsDir: string) {}

  /** Force a re-read on the next load call (e.g. after the user edits an agent prompt). */
  invalidateCache(): void {
    this._cache = null;
  }

  async loadAll(): Promise<Agent[]> {
    const allAgents = await this.loadAllIncludingWrangler();

    // Filter to creative agents only (excludes Wrangler)
    const creativeAgents = allAgents.filter(
      (agent) => (CREATIVE_AGENT_NAMES as readonly string[]).includes(agent.name),
    );

    // Sort by pipeline order: derive order from PIPELINE_PHASES (first appearance)
    const pipelineOrder = new Map<string, number>();
    for (let i = 0; i < PIPELINE_PHASES.length; i++) {
      const phase = PIPELINE_PHASES[i];
      if (phase.agent && !pipelineOrder.has(phase.agent)) {
        pipelineOrder.set(phase.agent, i);
      }
    }

    creativeAgents.sort((a, b) => {
      const orderA = pipelineOrder.get(a.name) ?? Infinity;
      const orderB = pipelineOrder.get(b.name) ?? Infinity;
      return orderA - orderB;
    });

    return creativeAgents;
  }

  async load(name: AgentName): Promise<Agent> {
    const allAgents = await this.loadAllIncludingWrangler();
    const agent = allAgents.find((a) => a.name === name);

    if (!agent) {
      throw new Error(
        `Agent "${name}" not found. Ensure "${AGENT_REGISTRY[name]?.filename ?? name + '.md'}" exists in "${this.agentsDir}".`,
      );
    }

    return agent;
  }

  async loadComposite(baseFilename: string, supplements: string[]): Promise<string> {
    const basePath = join(this.agentsDir, baseFilename);
    let prompt: string;
    try {
      prompt = await readFile(basePath, 'utf-8');
    } catch (err) {
      throw new Error(
        `Failed to read base agent file "${basePath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    for (const supplement of supplements) {
      const supplementPath = join(this.agentsDir, supplement);
      try {
        const content = await readFile(supplementPath, 'utf-8');
        prompt += '\n\n---\n\n' + content;
      } catch {
        console.warn(`[AgentService] Supplement file not found: ${supplement}`);
      }
    }

    return prompt;
  }

  async loadRaw(filename: string): Promise<string> {
    const filePath = join(this.agentsDir, filename);
    try {
      return await readFile(filePath, 'utf-8');
    } catch (err) {
      throw new Error(
        `Failed to read agent file "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async loadAllIncludingWrangler(): Promise<Agent[]> {
    if (this._cache !== null) return this._cache;

    let files: string[];
    try {
      files = await readdir(this.agentsDir);
    } catch (err) {
      throw new Error(
        `Failed to read agents directory "${this.agentsDir}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const mdFiles = files.filter((f) => f.toLowerCase().endsWith('.md'));

    // Build a case-insensitive lookup: lowercase filename -> registry entry
    const registryByFilename = new Map<string, { name: AgentName; meta: Omit<AgentMeta, 'name'> }>();
    for (const [name, meta] of Object.entries(AGENT_REGISTRY)) {
      registryByFilename.set(meta.filename.toLowerCase(), { name: name as AgentName, meta });
    }

    const agents: Agent[] = [];

    for (const file of mdFiles) {
      const entry = registryByFilename.get(file.toLowerCase());
      if (!entry) {
        // File doesn't match any registry entry — skip (custom agent support later)
        continue;
      }

      const filePath = join(this.agentsDir, file);
      let systemPrompt: string;
      try {
        systemPrompt = await readFile(filePath, 'utf-8');
      } catch (err) {
        throw new Error(
          `Failed to read agent file "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      agents.push({
        name: entry.name,
        filename: entry.meta.filename,
        role: entry.meta.role,
        color: entry.meta.color,
        thinkingBudget: entry.meta.thinkingBudget,
        systemPrompt,
      });
    }

    this._cache = agents;
    return agents;
  }
}
