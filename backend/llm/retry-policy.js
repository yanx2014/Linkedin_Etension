// DeepSeek retry policy. Transient transport errors retry up to twice; malformed
// JSON retries once with a repair instruction; content-filter and validation
// failures are never retried by inventing support.

export const RetryConfig = {
  timeoutMs: 90000,
  maxTransientRetries: 2,
  maxJsonRepairs: 1
};

export function isTransient(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  const status = err.status || 0;
  return status === 429 || (status >= 500 && status <= 599);
}

export async function backoffDelay(attempt) {
  const base = Math.min(8000, 500 * 2 ** attempt);
  // Deterministic-enough jitter without Math.random (keeps tests reproducible).
  return base;
}
