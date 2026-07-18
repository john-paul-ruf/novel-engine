import { describe, expect, it } from 'vitest';
import { TokenEstimator } from '@app/context/TokenEstimator';

// Pinned values ARE contracts — context packing budgets depend on them
// (CHARS_PER_TOKEN = 4, rounded up).
describe('TokenEstimator', () => {
  const estimator = new TokenEstimator();

  it.each([
    ['', 0],
    ['a', 1],
    ['abcd', 1],
    ['abcde', 2],
    ['x'.repeat(400), 100],
    ['x'.repeat(401), 101],
  ])('estimate(%j) → %i tokens', (text, expected) => {
    expect(estimator.estimate(text)).toBe(expected);
  });

  it('is monotonic — longer text never costs fewer tokens', () => {
    let previous = 0;
    for (let length = 0; length <= 64; length++) {
      const tokens = estimator.estimate('y'.repeat(length));
      expect(tokens).toBeGreaterThanOrEqual(previous);
      previous = tokens;
    }
  });
});
