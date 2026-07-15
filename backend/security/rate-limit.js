// Simple in-memory token-bucket rate limiter keyed by client address. Protects
// the enrichment endpoints from runaway loops.

const buckets = new Map();

export function createRateLimiter({ capacity = 30, refillPerSec = 0.5 } = {}) {
  return function check(key, nowMs = Date.now()) {
    let b = buckets.get(key);
    if (!b) { b = { tokens: capacity, last: nowMs }; buckets.set(key, b); }
    const elapsed = (nowMs - b.last) / 1000;
    b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
    b.last = nowMs;
    if (b.tokens < 1) return { allowed: false, retryAfter: Math.ceil((1 - b.tokens) / refillPerSec) };
    b.tokens -= 1;
    return { allowed: true };
  };
}

export function resetRateLimiter() { buckets.clear(); }
