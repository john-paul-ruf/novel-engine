import { describe, expect, it } from 'vitest';
import { resolveThinkingBudget } from '@app/thinkingBudget';

type Settings = Parameters<typeof resolveThinkingBudget>[0];

const base: Settings = { enableThinking: true, thinkingBudget: 5000, overrideThinkingBudget: false };
const AGENT_BUDGET = 8000;

describe('resolveThinkingBudget', () => {
  it.each<{ case: string; settings: Settings; perMessage?: number; expected: number | undefined }>([
    {
      case: 'per-message override wins over everything',
      settings: { ...base, overrideThinkingBudget: true },
      perMessage: 12000,
      expected: 12000,
    },
    {
      case: 'per-message override applies even when thinking is disabled globally',
      settings: { ...base, enableThinking: false },
      perMessage: 3000,
      expected: 3000,
    },
    {
      case: 'per-message override of 0 disables thinking for the call',
      settings: base,
      perMessage: 0,
      expected: undefined,
    },
    {
      case: 'negative per-message override disables thinking',
      settings: base,
      perMessage: -1,
      expected: undefined,
    },
    {
      case: 'thinking disabled globally → no budget',
      settings: { ...base, enableThinking: false },
      expected: undefined,
    },
    {
      case: 'global override → settings budget for all agents',
      settings: { ...base, overrideThinkingBudget: true },
      expected: 5000,
    },
    {
      case: 'default → per-agent budget',
      settings: base,
      expected: AGENT_BUDGET,
    },
  ])('$case', ({ settings, perMessage, expected }) => {
    expect(resolveThinkingBudget(settings, AGENT_BUDGET, perMessage)).toBe(expected);
  });
});
