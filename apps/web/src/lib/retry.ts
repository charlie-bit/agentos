/**
 * Bounded retry for transient stream failures (spec #282). Two attempts with
 * a short backoff; the caller then falls back to replaying history from the
 * messages endpoint (recovery by replay, not by memory).
 */
export const RETRY_DELAYS_MS = [500, 1500] as const;

export async function withRetry<T>(fn: () => Promise<T>, delays: readonly number[] = RETRY_DELAYS_MS): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const delay = delays[attempt];
      if (delay === undefined) break;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
