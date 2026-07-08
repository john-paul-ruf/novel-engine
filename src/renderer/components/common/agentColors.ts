import { CREATIVE_AGENT_NAMES } from '@domain/constants';

/** Agent name → design-token color (e.g. Spark → 'var(--ne-spark)'). */
export const AGENT_COLORS: Record<string, string> = Object.fromEntries(
  CREATIVE_AGENT_NAMES.map((name) => [name, `var(--ne-${name.toLowerCase()})`])
);

/** Resolve an agent's identity color, falling back to the faint ink token. */
export function agentColor(name: string): string {
  return AGENT_COLORS[name] ?? 'var(--ne-ink-faint)';
}
