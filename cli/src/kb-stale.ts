/**
 * `agentos kb stale [<dir>]` — the re-verification QUEUE, read-only, zero side
 * effects. Lists published pages whose stale_after is already past, oldest
 * (most overdue) first: page / owner / days overdue. Staleness is a queue
 * input, not a lint error (D-0910-8-adjacent statute in core/governance/
 * frontmatter.ts) — this command is where it surfaces for triage.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { splitFrontmatter, validatePageFrontmatter } from "@agentos/core";
import type { CliResult } from "./preset-validate.js";

const DAY = 86_400_000;

function mdFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "README.md" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...mdFiles(p));
    else if (/\.md$/i.test(e.name)) out.push(p);
  }
  return out.sort();
}

export function runKbStale(argv: readonly string[], now: Date = new Date()): CliResult {
  const dir = argv[0] && !argv[0].startsWith("-") ? argv[0] : "knowledge-base";
  const rows: Array<{ page: string; owner: string; daysOverdue: number }> = [];

  for (const file of mdFiles(resolve(dir))) {
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
