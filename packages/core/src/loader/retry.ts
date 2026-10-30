/**
 * Auto-retry policy — the executor behind the `idempotent` declaration
 * (spec #205). Until this existed, "non-idempotent tools are never retried
 * automatically" was vacuously true: no retry existed at all.
 *
 * Policy law:
 *   - absent `idempotent` declaration = NOT retry-safe (unknown is unsafe),
 *   - `overrides[name]` wins over `default`,
 *   - a retry is exactly ONE extra attempt on TRANSPORT failure (a thrown
 *     call); a tool that answers with data — success or domain error — has
 *     not failed at the transport level and is not retried.
 * The branch source is the mount plan, never the tool name's neighborhood.
 */
import type { ToolMountPlan } from "@agentos/contracts";

/** True when this tool may be retried once automatically. */
export function isIdempotent(plan: Pick<ToolMountPlan, "idempotent">, toolName: string): boolean {
  const idem = plan.idempotent;
  if (idem === undefined) return false;
  return idem.overrides?.[toolName] ?? idem.default;
}

/**
 * Run `fn`, retrying ONCE when `idempotent` is true and the first attempt
 * throws. The second failure propagates unchanged (no retry storms).
 */
export async function withRetryOnce<T>(fn: () => Promise<T>, idempotent: boolean): Promise<T> {
  try {
    return await fn();
  } catch (first) {
    if (!idempotent) throw first;
    return await fn();
  }
}
