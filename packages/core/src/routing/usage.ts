/**
 * usage.log query surface (spec #291). The log is per-turn JSONL of
 * attribution METADATA (provider/model/alias/tenant/counts/cost) and carries
 * no conversation content by construction — so aggregating it can never leak
 * message text (R4/R9).
 *
 * Pure read: malformed or torn lines are skipped, a missing file is an empty
 * aggregate. Nothing here writes or repairs the log.
 */
import { readFileSync } from "node:fs";

export interface UsageAggregateRow {
  provider: string;
  /** Role label when the turn ran under an agent (spec #338/#349). */
  agent?: string;
  /** Model identity as logged: modelId, else alias, else the manifest name. */
  model: string;
  turns: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
}

export interface UsageAggregate {
  /** One row per provider/model pair, most expensive first. */
  rows: UsageAggregateRow[];
  totals: Omit<UsageAggregateRow, "provider" | "model">;
  /** Window actually applied. */
  filter: { session?: string; sinceMs?: number };
}

export interface UsageQuery {
  /** Exact session key (e.g. "web-<id>"). */
  session?: string;
  /** Only turns at/after this epoch ms. */
  sinceMs?: number;
}

const emptyTotals = () => ({ turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 });

export function aggregateUsage(logPath: string, query: UsageQuery = {}): UsageAggregate {
  const groups = new Map<string, UsageAggregateRow>();
  const totals = emptyTotals();

  let raw: string;
  try {
    raw = readFileSync(logPath, "utf8");
  } catch {
    return { rows: [], totals, filter: { ...query } };
  }

  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) continue;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue; // torn append: skip, never throw
    }
    if (typeof rec !== "object" || rec === null) continue;
    if (query.session !== undefined && rec.session !== query.session) continue;
    if (query.sinceMs !== undefined && (typeof rec.tsMs !== "number" || rec.tsMs < query.sinceMs)) continue;

    const provider = typeof rec.provider === "string" ? rec.provider : "unknown";
    const model =
      (typeof rec.modelId === "string" && rec.modelId) ||
      (typeof rec.alias === "string" && rec.alias) ||
      (typeof rec.manifest === "string" && rec.manifest) ||
      "unknown";
    const agent = typeof rec.agent === "string" && rec.agent.length > 0 ? rec.agent : undefined;
    const key = `${provider}\u0000${model}\u0000${agent ?? ""}`;
    const row = groups.get(key) ?? { provider, model, ...(agent ? { agent } : {}), ...emptyTotals() };
    const usage = (rec.usage ?? {}) as { input?: unknown; output?: unknown; cacheRead?: unknown; cacheWrite?: unknown };
    const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

    row.turns += 1;
    row.input += num(usage.input);
    row.output += num(usage.output);
    row.cacheRead += num(usage.cacheRead);
    row.cacheWrite += num(usage.cacheWrite);
    row.costUsd += num(rec.costUsd);
    groups.set(key, row);
  }

  const rows = [...groups.values()].sort((a, b) => b.costUsd - a.costUsd || a.model.localeCompare(b.model));
  for (const r of rows) {
    totals.turns += r.turns;
    totals.input += r.input;
    totals.output += r.output;
    totals.cacheRead += r.cacheRead;
    totals.cacheWrite += r.cacheWrite;
    totals.costUsd += r.costUsd;
  }
  return { rows, totals, filter: { ...query } };
}
