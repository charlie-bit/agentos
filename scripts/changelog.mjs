#!/usr/bin/env node
/**
 * Release-notes generator (spec #168): groups commits since a ref by
 * Conventional Commit type. Read-only — prints markdown; a human pastes it.
 *
 * Usage: node scripts/changelog.mjs [sinceRef=latest tag or HEAD~20]
 */
import { execFileSync } from "node:child_process";

const since = process.argv[2] ?? (() => {
  try {
    return execFileSync("git", ["describe", "--tags", "--abbrev=0"], { encoding: "utf8" }).trim();
  } catch {
    return "HEAD~20";
  }
})();

const raw = execFileSync("git", ["log", `${since}..HEAD`, "--pretty=format:%s\t%h"], { encoding: "utf8" }).trim();
const groups = new Map([
  ["feat", []], ["fix", []], ["test", []], ["docs", []], ["refactor", []], ["perf", []], ["chore", []], ["spec", []], ["ci", []],
]);
for (const line of raw ? raw.split("\n") : []) {
  const [subject = "", hash = ""] = line.split("\t");
  const m = /^([a-z]+)(\([^)]*\))?!?:\s*(.*)$/.exec(subject);
  if (!m) continue;
  const type = groups.has(m[1]) ? m[1] : "chore";
  groups.get(type).push(`- ${m[3]} (${hash})`);
}

const titles = { feat: "Added", fix: "Fixed", test: "Tests", docs: "Docs", refactor: "Changed", perf: "Performance", chore: "Chores", spec: "Spec", ci: "CI" };
process.stdout.write(`## Unreleased (since ${since})\n\n`);
let printed = false;
for (const [type, lines] of groups) {
  if (lines.length === 0) continue;
  printed = true;
  process.stdout.write(`### ${titles[type]}\n\n${lines.join("\n")}\n\n`);
}
if (!printed) process.stdout.write("_no conventional commits in range_\n");
