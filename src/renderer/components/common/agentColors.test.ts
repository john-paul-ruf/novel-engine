import { describe, it, expect } from 'vitest';
import { CREATIVE_AGENT_NAMES } from '@domain/constants';
import { AGENT_COLORS, agentColor } from './agentColors';

describe('agentColors', () => {
  it('maps every creative agent to its lowercase design token', () => {
    for (const name of CREATIVE_AGENT_NAMES) {
      expect(AGENT_COLORS[name]).toBe(`var(--ne-${name.toLowerCase()})`);
    }
    expect(Object.keys(AGENT_COLORS)).toHaveLength(CREATIVE_AGENT_NAMES.length);
  });

  it('falls back to the faint ink token for unknown names', () => {
    expect(agentColor('Nobody')).toBe('var(--ne-ink-faint)');
    expect(agentColor(CREATIVE_AGENT_NAMES[0])).toBe(AGENT_COLORS[CREATIVE_AGENT_NAMES[0]]);
  });
});
