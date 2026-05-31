import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/ratelimit.js';

describe('RateLimiter', () => {
  it('allows up to capacity calls then blocks', () => {
    const rl = new RateLimiter(3);
    expect(rl.consume(1, 0)).toBe(true);
    expect(rl.consume(1, 0)).toBe(true);
    expect(rl.consume(1, 0)).toBe(true);
    expect(rl.consume(1, 0)).toBe(false);
  });

  it('refills over time', () => {
    const rl = new RateLimiter(2);
    expect(rl.consume(1, 0)).toBe(true);
    expect(rl.consume(1, 0)).toBe(true);
    expect(rl.consume(1, 0)).toBe(false);
    // after one minute the bucket is full again
    expect(rl.consume(1, 60_000)).toBe(true);
  });

  it('isolates buckets per user', () => {
    const rl = new RateLimiter(1);
    expect(rl.consume(1, 0)).toBe(true);
    expect(rl.consume(2, 0)).toBe(true);
    expect(rl.consume(1, 0)).toBe(false);
    expect(rl.consume(2, 0)).toBe(false);
  });
});
