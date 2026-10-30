/**
 * Pure declared-vs-discovered diff. Strings in, sets out — kernel-free by
 * construction so conformance can exercise it offline against any runtime.
 * Naming convention assumed from the caller: bare tool names both sides
 * (adapters strip their `mcp__<key>__` prefix before calling).
 * Empty declared list = pass-through (全放行): nothing is missing (nothing
 * was promised) and nothing discovered counts as undeclared — but the report
 * is marked `unverified`, which is a different fact from a clean check.
 * `*` in a declared pattern matches any run of characters; wildcard entries
 * are never reported as missing (a pattern has no concrete identity).
 */
export interface DriftReport {
  /** Declared but never discovered: upstream dead, renamed, or the yml lies. */
  missing: string[];
  /** Discovered but never declared: server grew tools the config never approved. */
  undeclared: string[];
  /**
   * The manifest declared NO allowlist (spec #226). That is not the same fact
   * as "declared everything": nothing was promised, so nothing can be missing
   * — but the mount is also UNVERIFIED, and a caller that cares (the adapter's
   * runtime drift check) should say so instead of reporting a clean bill.
   */
  unverified: boolean;
}

function toRegex(pattern: string): RegExp {
  return new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")}$`);
}

export function driftReport(declared: readonly string[], discovered: readonly string[]): DriftReport {
  if (declared.length === 0) return { missing: [], undeclared: [], unverified: true };
  const concrete = declared.filter((d) => !d.includes("*"));
  const matchers = declared.map(toRegex);
  return {
    missing: concrete.filter((d) => !discovered.includes(d)),
    undeclared: [...discovered].filter((t) => !matchers.some((re) => re.test(t))).sort(),
    unverified: false,
  };
}
