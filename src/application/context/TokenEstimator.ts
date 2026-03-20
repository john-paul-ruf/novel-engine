import { CHARS_PER_TOKEN } from '@domain/constants';

export class TokenEstimator {
  estimate(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }
}
