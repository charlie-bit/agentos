/**
 * spec #291 — the usage query surface. Aggregation is metadata-only, filters
 * are exact, and a torn/missing log never throws.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { aggregateUsage } from "../usage.js";

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop() ?? "", { recursive: true, force: true });
});

function log(lines: Array<Record<string, unknown> | string>): string {
  const dir = mkdtempSync(join(tmpdir(), "agentos-usage-agg-"));
  roots.push(dir);
  const path = join(dir, "usage.log");
  writeFileSync(path, lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + "\n");
  return path;
}

const turn = (over: Record<string, unknown> = {}) => ({
  tsMs: 1_700_000_000_000,
  session: "web-a",
  provider: "deepseek",
  manifest: "deepseek",
  alias: "general",
  modelId: "deepseek-chat",
  usage: { input: 100, output: 10 },
  costUsd: 0.01,
  ...over,
});

describe("aggregateUsage (#291)", () => {
  it("groups by provider/model and sums counts + cost", () => {
    const path = log([
      turn(),
      turn({ usage: { input: 50, output: 5 }, costUsd: 0.005 }),
      turn({ session: "web-b", modelId: "deepseek-reasoner", costUsd: 0.02 }),
    ]);
    const agg = aggregateUsage(path);
    expect(agg.rows).toHaveLength(2);
    const general = agg.rows.find((r) => r.model === "deepseek-chat");
    expect(general).toMatchObject({ provider: "deepseek", turns: 2, input: 150, output: 15 });
    expect(agg.rows[0]?.model).toBe("deepseek-reasoner"); // most expensive first
    expect(agg.totals.turns).toBe(3);
    expect(agg.totals.costUsd).toBeCloseTo(0.035);
  });

  it("filters by session and since", () => {
    const path = log([turn(), turn({ session: "web-b" }), turn({ tsMs: 1_600_000_000_000 })]);
    expect(aggregateUsage(path, { session: "web-b" }).totals.turns).toBe(1);
    expect(aggregateUsage(path, { sinceMs: 1_650_000_000_000 }).totals.turns).toBe(2);
  });

  it("torn lines are skipped; a missing log is an empty aggregate", () => {
    const path = log([turn(), "{not json"]);
    expect(aggregateUsage(path).totals.turns).toBe(1);
    const missing = aggregateUsage(join(roots[0] as string, "nope.log"));
    expect(missing).toMatchObject({ rows: [], totals: { turns: 0 } });
  });

  it("the aggregate carries no conversation content (R4/R9)", () => {
    const path = log([turn({ prompt: "SECRET-QUESTION", text: "SECRET-ANSWER" })]);
    expect(JSON.stringify(aggregateUsage(path))).not.toContain("SECRET");
  });
});
