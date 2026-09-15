// Generic retry-with-backoff helper (design.md D4, FR-083) — deliberately not
// framework-agnostic/packages-shared (it's Workers-runtime I/O glue, not game
// logic, so NFR-017's portability requirement doesn't apply here).

export interface RetryOptions {
  /** Backoff delay (ms) before each retry — its length is the number of retries after the first try. */
  delaysMs?: number[];
}

/**
 * Calls `fn`, retrying on a thrown error with the given backoff. Returns
 * `true` once `fn` succeeds, or `false` once every attempt (1 initial + one
 * per entry in `delaysMs`) has failed. Uses `await`ed timers for backoff, not
 * a busy loop, so the Durable Object's single-threaded async runtime can
 * still interleave other connections' messages while this awaits.
 */
export async function withRetry(fn: () => Promise<void>, options: RetryOptions = {}): Promise<boolean> {
  const delaysMs = options.delaysMs ?? [200, 400, 800];
  const maxAttempts = delaysMs.length + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fn();
      return true;
    } catch {
      if (attempt === maxAttempts) return false;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt - 1]));
    }
  }
  return false;
}
