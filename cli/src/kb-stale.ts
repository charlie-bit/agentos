/**
 * `agentos kb stale [<dir>]` — the re-verification QUEUE, read-only, zero side
 * effects. Lists published pages whose stale_after is already past, oldest
 * (most overdue) first: page / owner / days overdue. Staleness is a queue
 * input, not a lint error (D-0910-8-adjacent statute in core/governance/
 * frontmatter.ts) — this command is where it surfaces for triage.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { splitFrontmatter, validatePageFrontmatter } from "@agentos/core";
import { markdownFiles } from "./kb-scan.js";
import type { CliResult } from "./preset-validate.js";

const DAY = 86_400_000;

export function runKbStale(argv: readonly string[], now: Date = new Date()): CliResult {
  const dir = argv[0] && !argv[0].startsWith("-") ? argv[0] : "knowledge-base";
  const rows: Array<{ page: string; owner: string; daysOverdue: number }> = [];

  for (const file of markdownFiles(resolve(dir))) {
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue; // unreadable page: queue stays silent, lint reports it
    }
    const verdict = validatePageFrontmatter(raw, now);
    if (verdict.errors.length > 0) continue; // untrustworthy metadata is lint's beat, not the queue's
    const { meta } = splitFrontmatter(raw);
    if (meta.status !== "published") continue; // drafts are already "not settled"
    const due = Date.parse(`${meta.stale_after}T00:00:00Z`);
    const days = Math.floor((now.getTime() - due) / DAY);
    if (days >= 0) rows.push({ page: file, owner: meta.owner ?? "?", daysOverdue: days });
  }

  rows.sort((a, b) => b.daysOverdue - a.daysOverdue); // stale_after ascending == most overdue first
  const lines = rows.map((r) => `  · ${r.page}  owner=${r.owner}  overdue ${r.daysOverdue}d`);
  return {
    exitCode: 0, // a queue is information, never a failure
    lines: [rows.length === 0 ? `○ ${dir}: stale queue empty (no published page past stale_after)` : `stale queue (${rows.length}, most overdue first):`, ...lines],
  };
}
