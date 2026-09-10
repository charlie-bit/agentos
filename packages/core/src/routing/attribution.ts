/**
 * Per-turn usage attribution: the record answering "what model did this turn
 * actually run on and what did it cost". One JSONL line per turn appended to
 * .agentos/usage.log (gitignored; path env-leased for deployment shapes).
 * Field law: model id, alias, counts, cost — and NEVER any credential shape
 * (no env values, no tokens): enforced by construction (this object has no
 * credential field) and pinned by conformance grep-style assertions.
 * OTEL/monitoring export deliberately absent: the log fields come first;
 * an exporter is a pure consumer of this shape later.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface UsageCounts {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface Attribution {
  tsMs: number;
  preset?: string;
  session?: string;
  manifest: string;
  provider: string;
  alias?: string;
  modelId?: string;
  usage?: UsageCounts;
  costUsd?: number;
}

export function usageLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.AGENTOS_USAGE_LOG ?? ".agentos/usage.log");
}

export function appendAttribution(a: Attribution, path: string = usageLogPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(a) + "\n", "utf8");
}

/** One human line for stdout: model provenance + the numbers that matter. */
export function formatAttributionLine(a: Attribution): string {
  const model = a.alias ? `${a.manifest}/${a.alias}→${a.modelId ?? "?"}` : `${a.manifest}/kernel-default`;
  const parts: string[] = [];
  const u = a.usage;
  if (u) {
    parts.push(`in=${u.input ?? 0} out=${u.output ?? 0}`);
    if (u.cacheRead) parts[parts.length - 1] += ` cache_rd=${u.cacheRead}`;
    if (u.cacheWrite) parts[parts.length - 1] += ` cache_wr=${u.cacheWrite}`;
  }
  if (typeof a.costUsd === "number") parts.push(`cost≈$${a.costUsd.toFixed(4)}`);
  return `model: ${model}${parts.length ? " | " + parts.join(" | ") : ""}`;
}
