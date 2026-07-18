import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  randomPitchRoomFlavor,
  randomPreparingStatus,
  randomRespondingStatus,
  randomWaitingStatus,
} from '@domain/statusMessages';

const GENERATORS = [
  ['randomPreparingStatus', randomPreparingStatus],
  ['randomWaitingStatus', randomWaitingStatus],
  ['randomRespondingStatus', randomRespondingStatus],
  ['randomPitchRoomFlavor', randomPitchRoomFlavor],
] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(GENERATORS)('%s', (_name, generator) => {
  it('returns a non-empty string at both extremes of Math.random', () => {
    // Extremes catch out-of-bounds indexing into the message pool.
    for (const value of [0, 0.999999]) {
      vi.spyOn(Math, 'random').mockReturnValue(value);
      const message = generator();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it('rotates through multiple messages', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generator()));
    expect(seen.size).toBeGreaterThan(1);
  });
});
