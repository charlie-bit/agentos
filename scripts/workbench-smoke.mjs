#!/usr/bin/env node
/**
 * Workbench smoke (spec #450) — the five surfaces through real code, offline:
 *   mount → project instance → todo → role/workflow run → export.
 *
 * Model turns are stubbed at the injected seam (the real path needs a live
 * endpoint; that acceptance is the documented final phase). Everything else —
 * ledger, templates, fence, runner, export — is the production code.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifestDir, openLedger, planTools, buildTodoTools } from "../packages/core/dist/index.js";
import { createMarkdownProvider } from "../packages/providers/knowledge-markdown/dist/index.js";
import { startServer } from "../packages/entry/entry-rest/dist/index.js";
import { createWorkflowRunner } from "../cli/dist/workflow-run.js";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const fail = (why) => {
  process.stdout.write(`✗ workbench smoke FAILED: ${why}\n`);
  process.exit(1);
};
const step = (s) => process.stdout.write(`  ✓ ${s}\n`);
const dir = mkdtempSync(join(tmpdir(), "agentos-wb-smoke-"));

try {
  // 1) mount: the workbench manifests load and its preset resolves
  const loaded = [];
  for (const sub of ["agents", "workflows", "projects", "knowledge", "models", "presets"]) {
    const r = loadManifestDir(join(repo, "examples/workbench", sub));
    if (r.failed.length) fail(`manifest errors: ${r.failed.map((f) => f.source).join(", ")}`);
    loaded.push(...r.loaded.map((l) => l.manifest));
  }
  const preset = loaded.find((m) => m.kind === "preset");
  moving(preset ? "preset resolved: " + preset.name : null);
  function moving(x) {
    if (!x) fail("no preset in examples/workbench");
    step(x);
  }
  const template = loaded.find((m) => m.kind === "project" && m.name === "workbench-demo");
  if (!template) fail("project template missing");

  // 2) project instance (data) + template fence
  const ledger = openLedger(join(dir, "sessions.db"));
  const instance = ledger.projectInstanceCreate({ id: "inst-1", template: "workbench-demo", title: "Smoke project", createdAtMs: 1, updatedAtMs: 1 });
  if (!(template.agents ?? []).includes("triage-analyst")) fail("template does not declare triage-analyst");
  step(`project instance ${instance.id} from template ${instance.template}`);

  // 3) todo (model tool family, real handlers)
  const todoTools = buildTodoTools({ ledger });
  await todoTools.find((t) => t.name === "todo_add").handler({ title: "Smoke follow-up", project: instance.id, sourceKind: "mcp" });
  if (ledger.todoList({ project: instance.id }).length !== 1) fail("todo not filed to the project");
  step("todo captured via todo_add (in-process tool)");

  // 4) workflow: real runner + real ledger; agent turn stubbed at the seam
  const book = createMarkdownProvider({ root: join(repo, "examples/workbench/knowledge/book"), draftsDir: join(dir, "drafts"), receiptsLog: join(dir, "receipts.jsonl") });
  const runner = createWorkflowRunner({
    ledger,
    workflows: new Map([["daily-brief", loaded.find((m) => m.kind === "workflow" && m.name === "daily-brief")]]),
    workspaceFor: (id) => {
      const ws = join(dir, "ws", id);
      mkdirSync(ws, { recursive: true });
      return ws;
    },
    runAgentTurn: async () => "stubbed summary",
    kbProvider: () => book,
    tools: todoTools,
    audit: () => undefined,
  });
  const run = await runner("daily-brief", "manual", { project: instance.id });
  const instanceRow = ledger.workflowRunGet(run.runId);
  // daily-brief contains a human gate: headless runs stop there by design.
  if (instanceRow.status !== "error" || instanceRow.resumeFrom === null) fail(`expected a human-gated stop with resumeFrom, got ${instanceRow.status}`);
  step(`workflow instance ${instanceRow.id.slice(0, 8)} — human gate stopped at step ${instanceRow.resumeFrom} (resumable)`);

  // 5) export through the real HTTP surface
  const srv = await startServer({
    presetName: "workbench",
    model: { provider: "demo-vendor" },
    mounts: [],
    runner: async () => ({}),
    ledger,
    port: 0,
    dbPath: join(dir, "sessions.db"),
    staticDir: dir,
    projectExport: (id) => {
      const row = ledger.projectInstanceGet(id);
      if (!row) return undefined;
      return { instance: row, template, todos: ledger.todoList({ project: id }), sessions: ledger.sessionList({ project: id, limit: 200 }), runs: ledger.workflowRunList({ project: id }) };
    },
  });
  try {
    const res = await fetch(`http://127.0.0.1:${srv.port}/api/project-instances/${instance.id}/export?format=jsonl`);
    const body = await res.text();
    const kinds = body.trim().split("\n").map((l) => JSON.parse(l).type);
    if (!kinds.includes("todo") || !kinds.includes("run")) fail("export bundle missing todo/run");
    step(`export: ${kinds.length} records (${[...new Set(kinds)].join(", ")})`);
  } finally {
    await srv.close();
  }

  ledger.close();
  process.stdout.write("✓ workbench smoke: mount → project → todo → workflow → export\n");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
