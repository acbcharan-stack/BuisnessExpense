import { classifyExtractionError } from "./errors";

export interface FailoverOptions<T> {
  /** Primary model first, then any fallbacks. Must contain at least one. */
  models: string[];
  maxAttempts: number;
  /** Total wall-clock budget for all attempts + waits. */
  budgetMs: number;
  /** Don't start another attempt with less than this left. */
  minAttemptMs: number;
  /** Ceiling for one attempt's own timeout. */
  maxAttemptMs: number;
  call: (model: string, timeoutMs: number, attempt: number) => Promise<T>;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

const BASE_DELAY_MS = 1500;
const MAX_DELAY_MS = 8000;

/**
 * Calls the AI with bounded retries. Busy/overloaded errors (503, 429, …) are
 * usually gone within seconds, so we back off briefly and alternate to the
 * fallback model instead of giving up on the first bounce. Permanent errors on
 * the primary model (bad key, rejected file) stop immediately; a permanent error
 * on a fallback just removes that fallback from the rotation.
 */
export async function runWithFailover<T>(
  opts: FailoverOptions<T>,
): Promise<{ value: T; model: string }> {
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;

  const primary = opts.models[0];
  const rotation = [...opts.models];
  const deadline = now() + opts.budgetMs;
  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    const remaining = deadline - now();
    if (attempt > 0 && remaining < opts.minAttemptMs) break;

    const model = rotation[attempt % rotation.length];
    const timeoutMs = Math.max(1000, Math.min(opts.maxAttemptMs, remaining));
    try {
      const value = await opts.call(model, timeoutMs, attempt);
      return { value, model };
    } catch (err) {
      lastError = err;
      const { kind } = classifyExtractionError(err);
      if (kind === "permanent") {
        if (model === primary) throw err;
        const i = rotation.indexOf(model);
        if (i > -1) rotation.splice(i, 1);
        continue; // no wait: nothing was overloaded, that model is just unusable
      }
      // Exponential backoff with jitter, never past the deadline.
      const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
      const wait = Math.min(delay * (0.5 + random() * 0.5), Math.max(0, deadline - now()));
      if (attempt < opts.maxAttempts - 1 && wait > 0) await sleep(wait);
    }
  }
  throw lastError ?? new Error("no attempts were made");
}
