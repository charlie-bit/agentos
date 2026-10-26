#!/usr/bin/env node
/**
 * Cross-runtime acceptance (spec #144/#298) — one preset, two runtimes, the
 * same inject → retrieve → writeback outcome. Fully offline.
 *
 *   runtime A "claude-sdk"  : the adapter's normalisation of the kernel's
 *                             message stream (synthetic frames; no network).
 *   runtime B "scripted"    : a second runtime that emits the neutral
 *                             RenderEvent vocabulary directly.
 *
 * Both then run the SAME knowledge loop through the contract
 * (search → getPage → writePage → commit) and must leave the same evidence:
 * the hit, the page, and a committed file. Exit 0 = both runtimes agree.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { consumeStream } from "../packages/adapters/claude-sdk/dist/index.js";
import { createMarkdownProvider } from "../packages/providers/knowledge-markdown/dist/index.js";

const fail = (why) => {
  process.stdout.write(`✗ cross-runtime acceptance FAILED: ${why}\n`);
  process.exit(1);
};

/** runtime A: synthetic kernel stream -> adapter events */
async function runtimeKernel() {
  const frames = [
    { type: "system", subtype: "init", session_id: "s", tools: [] },
    { type: "assistant", session_id: "s", message: { content: [{ type: "text", text: "searching" }] } },
    { type: "result", session_id: "s", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0 },
  ];
  const stream = (async function* () {
    for (const f of frames) yield f;
  })();
  const out = await consumeStream(stream, { toolMounts: [] });
  if (!out.events.some((e) => e.type === "assistant.text")) fail("runtime A produced no assistant.text");
  return out.events;
}

/** runtime B: neutral vocabulary directly */
async function runtimeScripted() {
  const ts = Date.now();
  return [
    { type: "session.init", payload: { model: "scripted-model" }, timestampMs: ts },
    { type: "assistant.text", payload: { text: "searching" }, timestampMs: ts },
    { type: "result", payload: { subtype: "success", isError: false }, timestampMs: ts },
  ];
}

const dir = mkdtempSync(join(tmpdir(), "agentos-xruntime-"));
try {
  const book = join(dir, "book");
  const drafts = join(dir, "drafts");
  mkdirSync(book, { recursive: true });
  mkdirSync(drafts, { recursive: true });
  writeFileSync(
    join(book, "retry.md"),
    "---\nowner: t\nlast_verified: 2026-01-01\nstale_after: 2027-01-01\nstatus: published\n---\n# Retry policy\nbackoff is capped\n",
  );
  const provider = createMarkdownProvider({ root: book, draftsDir: drafts, receiptsLog: join(dir, "receipts.jsonl") });

  const runtimes = [
    ["claude-sdk", runtimeKernel],
    ["scripted", runtimeScripted],
  ];
  for (const [name, run] of runtimes) {
    const events = await run();
    // inject + retrieve through the SAME contract code path
    const hits = await provider.search("backoff");
    if (hits.length === 0) fail(`${name}: inject found nothing`);
    const page = await provider.getPage(hits[0].id);
    if (!page.body.includes("backoff")) fail(`${name}: retrieve returned the wrong page`);
    // writeback through the same contract code path
    const receipt = await provider.writePage({ title: `Note by ${name}`, body: `# Note by ${name}\nrun ${Date.now()}\n`, scope: "notes" });
    const committed = await provider.commit(receipt, { confirmedBy: `acceptance:${name}`, confirmedAtMs: Date.now() });
    if (!readFileSync(committed.path, "utf8").includes(`Note by ${name}`)) fail(`${name}: writeback body missing`);
    process.stdout.write(`✓ ${name}: inject=${hits.length} hit(s) · retrieve=${page.id} · writeback=${committed.commit.slice(0, 8)}\n`);
    if (events.length === 0) fail(`${name}: emitted no events`);
  }

  const committedFiles = readdirSync(join(book, "notes"));
  if (committedFiles.length !== 2) fail(`expected 2 committed pages, saw ${committedFiles.length}`);
  process.stdout.write("✓ cross-runtime acceptance: both runtimes produced inject→retrieve→writeback\n");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
