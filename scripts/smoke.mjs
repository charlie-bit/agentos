#!/usr/bin/env node
/**
 * Full-chain smoke (spec #165/#305) — one command, offline:
 *   mount (manifest) → conversation events → knowledge writeback → export.
 *
 * It drives the same contract code paths production uses; the "conversation"
 * is the adapter's stream normalisation on synthetic kernel frames (no
 * network, no credentials), and the server is entry-rest on an ephemeral port.
 * Exit 0 = every segment green.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { consumeStream } from "../packages/adapters/claude-sdk/dist/index.js";
import { loadManifestDir, planTools, openLedger } from "../packages/core/dist/index.js";
import { createMarkdownProvider } from "../packages/providers/knowledge-markdown/dist/index.js";
import { startServer } from "../packages/entry/entry-rest/dist/index.js";

const step = (msg) => process.stdout.write(`  ✓ ${msg}\n`);
const fail = (msg) => {
  process.stdout.write(`✗ smoke FAILED: ${msg}\n`);
  process.exit(1);
};

const dir = mkdtempSync(join(tmpdir(), "agentos-smoke-"));
try {
  // 1) mount: real config manifests plan cleanly
  const tools = loadManifestDir(join(process.cwd(), "config", "tools"));
  const { plans, errors } = planTools(tools.loaded.map((l) => l.manifest), { env: { AGENTOS_FS_ROOT: process.cwd() } });
  const fatal = errors.filter((e) => e.category !== "environment");
  if (fatal.length) fail(`plan errors: ${fatal.map((e) => e.path).join(", ")}`);
  if (!plans.some((p) => p.key === "mcp-filesystem")) fail("mcp-filesystem did not mount");
  step(`mount: ${plans.map((p) => p.key).join(", ")}`);

  // 2) conversation: adapter normalisation produces the expected events
  const frames = [
    { type: "system", subtype: "init", session_id: "s", tools: [] },
    { type: "assistant", session_id: "s", message: { content: [{ type: "text", text: "looking" }] } },
    { type: "result", session_id: "s", subtype: "success", is_error: false, num_turns: 1 },
  ];
  const out = await consumeStream((async function* () { for (const f of frames) yield f; })(), { toolMounts: plans });
  if (!out.events.some((e) => e.type === "assistant.text")) fail("no assistant text");
  step(`conversation: ${out.events.length} events`);

  // 3) writeback through the provider contract
  const book = join(dir, "book");
  const drafts = join(dir, "drafts");
  mkdirSync(book, { recursive: true });
  mkdirSync(drafts, { recursive: true });
  const provider = createMarkdownProvider({ root: book, draftsDir: drafts, receiptsLog: join(dir, "receipts.jsonl") });
  const receipt = await provider.writePage({ title: "Smoke note", body: "# Smoke note\nbody\n", scope: "ops" });
  const committed = await provider.commit(receipt, { confirmedBy: "smoke", confirmedAtMs: Date.now() });
  if (!readFileSync(committed.path, "utf8").includes("Smoke note")) fail("writeback body missing");
  step(`writeback: ${committed.commit.slice(0, 8)}`);

  // 4) export through HTTP: server + transcript reader + batch bundle
  const dbPath = join(dir, "sessions.db");
  const ledger = openLedger(dbPath);
  const row = ledger.createSession({ entry: "rest", externalKey: "web-smoke", preset: "p" });
  ledger.setSdkSessionId(row.id, "sdk-smoke");
  ledger.markStatus(row.id, "idle");
  const srv = await startServer({
    presetName: "p",
    model: { provider: "v" },
    mounts: plans.map((p) => ({ key: p.key, transport: p.transport })),
    runner: async () => ({}),
    ledger,
    port: 0,
    dbPath,
    staticDir: dir,
    readTranscript: ({ sdkSessionId }) =>
      sdkSessionId === "sdk-smoke" ? [{ role: "user", text: "smoke question" }, { role: "assistant", text: "smoke answer" }] : [],
  });
  try {
    const single = await fetch(`http://127.0.0.1:${srv.port}/api/sessions/smoke/export?format=jsonl`);
    const body = await single.text();
    if (!body.includes("smoke question")) fail("single export missing transcript");
    step(`export: single session (${body.trim().split("\n").length} lines)`);
    const batch = await fetch(`http://127.0.0.1:${srv.port}/api/sessions/export`, {
      method: "POST",
      body: JSON.stringify({ ids: ["smoke"] }),
      headers: { "content-type": "application/json" },
    });
    const bundle = await batch.text();
    if (!bundle.includes("smoke answer")) fail("batch export missing transcript");
    step("export: batch bundle");
  } finally {
    await srv.close();
  }
  writeFileSync(join(dir, "ok"), "1");
  process.stdout.write("✓ full-chain smoke: mount → conversation → writeback → export\n");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
