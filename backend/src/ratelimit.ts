// Per-user token bucket, in-memory. Token bucket refills linearly.
export class RateLimiter {
  private buckets = new Map<number, { tokens: number; updated: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number = capacity / 60_000,
  ) {}

  // Returns true if the request is allowed and consumes one token.
  consume(userId: number, now = Date.now()): boolean {
    const b = this.buckets.get(userId) ?? { tokens: this.capacity, updated: now };
    const elapsed = now - b.updated;
    b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerMs);
    b.updated = now;
    if (b.tokens < 1) {
      this.buckets.set(userId, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(userId, b);
    return true;
  }

  // Seconds the caller should wait before the next attempt (approx).
  retryAfterSec(userId: number, now = Date.now()): number {
    const b = this.buckets.get(userId);
    if (!b) return 0;
    const elapsed = now - b.updated;
    const tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerMs);
    if (tokens >= 1) return 0;
    return Math.ceil((1 - tokens) / this.refillPerMs / 1000);
  }
}
