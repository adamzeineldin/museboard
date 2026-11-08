// Per-token token bucket. In memory, so it only limits within one server process.
// TODO(scale): multi-instance deploys need a shared store (e.g. Redis) so the limit holds across instances.

export interface RateLimitDecision {
  allowed: boolean;
  /** Whole seconds until one more request is allowed (0 when allowed). */
  retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  /** Requests allowed in a burst and per window. */
  capacity: number;
  windowMs: number;
  /** Buckets kept before the oldest are dropped (bounds memory). */
  maxKeys?: number;
  now?: () => number;
}

interface Bucket {
  readonly tokens: number;
  readonly updatedAt: number;
}

export interface RateLimiter {
  take: (key: string) => RateLimitDecision;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { capacity, windowMs } = options;
  const maxKeys = options.maxKeys ?? 10_000;
  const now = options.now ?? Date.now;
  const refillPerMs = capacity / windowMs;
  const buckets = new Map<string, Bucket>();

  const refill = (bucket: Bucket | undefined, at: number): Bucket =>
    bucket
      ? { tokens: Math.min(capacity, bucket.tokens + (at - bucket.updatedAt) * refillPerMs), updatedAt: at }
      : { tokens: capacity, updatedAt: at };

  const store = (key: string, bucket: Bucket): void => {
    buckets.delete(key); // re-insert so Map order is least recently used first
    buckets.set(key, bucket);
    if (buckets.size > maxKeys) {
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined) buckets.delete(oldest);
    }
  };

  return {
    take(key) {
      const at = now();
      const current = refill(buckets.get(key), at);
      if (current.tokens >= 1) {
        store(key, { tokens: current.tokens - 1, updatedAt: at });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      store(key, current);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - current.tokens) / refillPerMs / 1000)) };
    },
  };
}

export const MCP_RATE_LIMIT = { capacity: 60, windowMs: 60_000 } as const;
