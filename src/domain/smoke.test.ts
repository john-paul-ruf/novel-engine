// Harness smoke test — proves the node project and @domain alias resolve.
// Deleted in SESSION-02 when real domain tests land.
import { describe, expect, it } from 'vitest';
import { AGENT_REGISTRY } from '@domain/constants';

describe('test harness', () => {
  it('resolves the @domain alias in the node project', () => {
    expect(AGENT_REGISTRY).toBeDefined();
  });
});
