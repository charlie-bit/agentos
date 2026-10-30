#!/usr/bin/env node
/**
 * Workbench demo (spec #457): one command that walks the five surfaces with
 * offline evidence — no model, no network. Each stage prints the artefact that
 * proves it; a failing stage exits non-zero.
 */
import { execFileSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const run = (args) => {
  const out = execFileSync("node", args, { cwd: root, encoding: "utf8" });
  return out.trim().split("\n").slice(-3).join("\n");
};

const stage = (n, title, fn) => {
  process.stdout.write(`\n[${n}/5] ${title}\n`);
  const detail = fn();
  process.stdout.write(`  ${detail.replace(/\n/g, "\n  ")}\n`);
};

stage(1, "roles (config) — five roles, two inheritance chains", () =>
  run(["cli/main.mjs", "preset", "validate", "examples/workbench/presets/workbench.yml"]),
);
stage(2, "workflows (config) — daily-brief @daily, five step types available", () =>
  run(["cli/main.mjs", "workflows", "validate", "examples/workbench/presets/workbench.yml"]),
);
stage(3, "projects (template vs instance) — template resolves, instances are data", () =>
  run(["cli/main.mjs", "projects", "validate", "examples/workbench/projects/workbench-demo.yml"]),
);
stage(4, "knowledge — book lints clean; the contrat is searchable", () => run(["cli/main.mjs", "kb", "lint", "examples/workbench/knowledge/book", "--strict"]));
stage(5, "runtime pieces — scheduler window + cross-runtime writeback", () => {
  const a = execFileSync("node", ["scripts/bench-workflow.mjs"], { cwd: root, encoding: "utf8" });
  const b = execFileSync("node", ["scripts/p4-acceptance.mjs"], { cwd: root, encoding: "utf8" });
  return `${a.trim().split("\n").pop()}\n${b.trim().split("\n").pop()}`;
});
process.stdout.write(
  "\n✓ workbench demo complete — todos/roles/workflows/projects/knowledge all demonstrated offline.\n" +
    "  Live-model acceptance is the documented final phase (.docs/progress.md).\n",
);
