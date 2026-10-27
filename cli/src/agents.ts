/**
 * `agentos agents scaffold|export` (spec #346/#347) — the config-face
 * counterparts of the read-only web catalogue. Both are data-only runners:
 * no side effects beyond the file they are explicitly asked to write/read.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadManifest, loadManifestDir } from "@agentos/core";
import type { CliResult } from "./preset-validate.js";

const SLUG = /^[a-z][a-z0-9-]{1,40}$/;

export function runAgentsScaffold(argv: readonly string[]): CliResult {
  const name = argv[0];
  if (!name || name.startsWith("-")) return { exitCode: 2, lines: ["✗ agents scaffold requires <name>"] };
  if (!SLUG.test(name)) return { exitCode: 2, lines: ["✗ name must be kebab-case (a-z, digits, dash; 2–41 chars)"] };
  const dir = resolve("config", "agents");
  const file = join(dir, `${name}.yml`);
  if (existsSync(file)) return { exitCode: 1, lines: [`✗ ${file} already exists — edit it instead of scaffolding over it`] };
  mkdirSync(dir, { recursive: true });
  const body = `# Role scaffold (spec #346). Edit, then: agentos agents validate config/agents/${name}.yml
kind: agent
version: "1"
name: ${name}
# baseAgent: other-role     # inherit a local role (never an MCP tool, #418)
systemPrompt: |
  You are ${name}, a focused assistant for this workspace.
  Say what you can do only from the tools actually mounted.
tools:
  - kb_search
knowledge: local-markdown  # optional: restrict the knowledge socket (#337)
# model: deepseek           # optional: request-level model for this role
`;
  writeFileSync(file, body, "utf8");
  const checked = loadManifest(file);
  if (!checked.ok) return { exitCode: 1, lines: ["✗ scaffold produced an invalid manifest (bug)", ...checked.errors.map((e) => `${e.path}: ${e.message}`)] };
  return { exitCode: 0, lines: [`✓ wrote ${file}`, `  next: agentos agents validate ${file}`, `        agentos agents export ${name}`] };
}

/** `agentos workflows scaffold <name>` (spec #382): five-type skeleton. */
export function runWorkflowsScaffold(argv: readonly string[]): CliResult {
  const name = argv[0];
  if (!name || name.startsWith("-")) return { exitCode: 2, lines: ["✗ workflows scaffold requires <name>"] };
  if (!SLUG.test(name)) return { exitCode: 2, lines: ["✗ name must be kebab-case (a-z, digits, dash; 2–41 chars)"] };
  const dir = resolve("config", "workflows");
  const file = join(dir, `${name}.yml`);
  if (existsSync(file)) return { exitCode: 1, lines: [`✗ ${file} already exists — edit it instead of scaffolding over it`] };
  mkdirSync(dir, { recursive: true });
  const body = `# Workflow scaffold (spec #382). Five step types, one of each.
# Edit, then: agentos workflows validate config/workflows/${name}.yml
kind: workflow
version: "1"
name: ${name}
description: What this workflow is for, in one line.
# trigger: { type: manual }                    # default
# trigger: { type: schedule, cron: "@daily" } # five-field cron or @hourly/@daily/@weekly/@monthly/@yearly
# trigger: { type: webhook, secretEnv: ${name.toUpperCase().replace(/-/g, "_")}_HOOK_TOKEN }  # env NAME only
steps:
  - { type: agent, agent: triage-analyst, prompt: "Summarise yesterday. Context: {prev}" }
  - { type: kb_search, query: "recent changes" }
  - { type: human, prompt: "Continue with the plan?", timeoutMs: 120000 }
  - { type: tool, tool: todo_add, args: { title: "Follow up from ${name}" } }
#  - { type: skill, skill: some-procedure, prompt: "Run it" }
`;
  writeFileSync(file, body, "utf8");
  const checked = loadManifest(file);
  if (!checked.ok) return { exitCode: 1, lines: ["✗ scaffold produced an invalid manifest (bug)", ...checked.errors.map((e) => `${e.path}: ${e.message}`)] };
  return { exitCode: 0, lines: [`✓ wrote ${file}`, `  next: agentos workflows validate ${file}`] };
}

export function runAgentsExport(argv: readonly string[]): CliResult {
  let name: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] ?? "";
    if (a === "--out") {
      out = argv[i + 1];
      if (!out) return { exitCode: 2, lines: ["✗ --out requires a path"] };
      i += 1;
    } else if (a.startsWith("-")) return { exitCode: 2, lines: [`✗ unknown agents export flag ${JSON.stringify(a)}`] };
    else name = a;
  }
  if (!name) return { exitCode: 2, lines: ["✗ agents export requires <name> [--out <file>]"] };
  const dir = resolve("config", "agents");
  const { loaded, failed } = loadManifestDir(dir);
  if (failed.length > 0) return { exitCode: 1, lines: failed.flatMap((f) => f.errors.map((e) => `✗ ${f.source}: ${e.path}: ${e.message}`)) };
  const hit = loaded.find((l) => l.manifest.kind === "agent" && l.manifest.name === name);
  if (!hit) return { exitCode: 1, lines: [`✗ no agent named ${JSON.stringify(name)} under config/agents`] };
  const content = readFileSync(hit.source, "utf8");
  if (out) {
    writeFileSync(resolve(out), content, "utf8");
    return { exitCode: 0, lines: [`✓ exported ${name} → ${out}`, "  (the file is a valid agent manifest; re-mounting it is copy + restart)"] };
  }
  return { exitCode: 0, lines: content.split("\n") };
}
