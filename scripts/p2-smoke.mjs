#!/usr/bin/env node
/**
 * P2/P3 smoke: dogfoods the whole line, now RIDEING THE LOADER.
 *   core/manifest loads config/ -> core/loader plans the tool mounts
 *   (${ENV} expansion + auth leases resolved in memory) -> core/session
 *   opens the ledger -> adapter-claude-sdk translates plans to kernel
 *   shapes and runs two turns: beat 1 MUST force a real filesystem-MCP
 *   tool.call quoting a known line; the drift event MUST be absent (config
 *   mirrors the server's actual tool set — see config/tools/mcp-filesystem.yml
 *   probe comment); beat 2 resumes via the ledger's sdk_session_id pointer.
 * Vendor-agnostic by construction: the channel is an env lease only.
 *   AGENTOS_SMOKE_BASE_URL + AGENTOS_SMOKE_API_KEY override the manifest's
 *   own lease names when present (smoke harness beats config).
 * Exit codes: 0 everything passed; 1 assertion/plan/credential failure;
 * 2 usage. Prints event types + redaction-guarded payloads; never env values.
 * Run: node --env-file=.env scripts/p2-smoke.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadManifestDir, validatePresetRefs, openLedger, planTools } from "../packages/core/dist/index.js";
import { runTurn } from "../packages/adapters/claude-sdk/dist/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SMOKE_KEY = "p2-smoke";

function fail(reason) {
  process.stdout.write(`✗ smoke FAILED: ${reason}\n`);
  process.exit(1);
}

// ---- 1. dogfood: our own config must validate ------------------------------
const configDir = join(repoRoot, "config");
if (!existsSync(configDir)) fail("config/ missing — nothing to dogfood");
const loaded = [];
const problems = [];
for (const sub of ["tools", "models", "knowledge", "presets"]) {
  const r = loadManifestDir(join(configDir, sub));
  loaded.push(...r.loaded);
  for (const f of r.failed) for (const e of f.errors) problems.push(`${f.source}: ${e.path}: ${e.message}`);
}
if (problems.length) fail(`config does not validate:\n  ${problems.join("\n  ")}`);
const refErrors = validatePresetRefs(loaded, { entryNames: ["cli"] });
if (refErrors.length) fail(`reference integrity: ${refErrors.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
process.stdout.write(`✓ dogfood: ${loaded.length} config manifests valid, refs resolve\n`);

const manifests = loaded.map((l) => l.manifest);
const preset = manifests.find((m) => m.kind === "preset");
const model = manifests.find((m) => m.name === preset?.model && m.kind === "model");
if (!preset || !model) fail("preset or its model manifest not found");

// ---- 2. the assembly line: manifests -> plans (P3 rides this path) ---------
process.env.AGENTOS_FS_ROOT = repoRoot; // deployment decides the mount root, not code
// The demo gateway (mcp-remote-example) leases a bearer token; it points at an
// unreachable example.com endpoint by design. The loader refuses to plan an
// entry whose lease is unresolvable (fail loud), so the smoke HARNESS supplies
// a placeholder — kernel marks the dead server failed at init, the plan has no
// allowlist (drift pass-through), nothing else changes. Real deployments
// export the real token; a fake never leaves this process.
process.env.AGENTOS_EXAMPLE_MCP_TOKEN ??= "smoke-placeholder-not-real";
const toolManifests = manifests.filter((m) => m.kind === "tool");
const { plans, errors: planErrors, warnings } = planTools(toolManifests);
if (planErrors.length) fail(`plan errors:\n  ${planErrors.map((e) => `${e.path}: ${e.message}`).join("\n  ")}`);
for (const w of warnings) process.stdout.write(`⚠ plan warning: ${w.key}: ${w.message}\n`);
process.stdout.write(`✓ plans assembled: ${plans.map((p) => `${p.key}(${p.transport})`).join(", ")}\n`);

// ---- 3. channel: smoke env leases beat manifest lease names ----------------
const channel = { ...model };
if (process.env.AGENTOS_SMOKE_BASE_URL) {
  channel.baseUrlEnv = "AGENTOS_SMOKE_BASE_URL";
  channel.credentialsEnv = "AGENTOS_SMOKE_API_KEY";
}
if (!process.env[channel.baseUrlEnv] || !process.env[channel.credentialsEnv]) {
  fail(
    `model channel not configured: set AGENTOS_SMOKE_BASE_URL + AGENTOS_SMOKE_API_KEY ` +
      `(or the manifest's env names: ${model.baseUrlEnv}/${model.credentialsEnv}). Values are read, never printed.`,
  );
}

// ---- 4. ledger --------------------------------------------------------------
const ledger = openLedger();
let session = ledger.getByExternalKey(SMOKE_KEY);
if (session) {
  process.stdout.write(`✓ ledger: reusing session ${session.id} (status ${session.status})\n`);
} else {
  session = ledger.createSession({ entry: "p2-smoke", externalKey: SMOKE_KEY, preset: preset.name });
  process.stdout.write(`✓ ledger: created session ${session.id}\n`);
}

/** Print an event stream with a redaction guard: values matching secret-ish keys masked. */
function showEvents(events) {
  for (const ev of events) {
    const payload = JSON.stringify(ev.payload, (k, v) =>
      /token|key|secret|auth/i.test(k) && typeof v === "string" ? "[redacted]" : v,
    );
    process.stdout.write(`  · ${ev.type} ${payload?.slice(0, 220)}\n`);
  }
}
const assistantText = (out) =>
  out.events.filter((e) => e.type === "assistant.text").map((e) => e.payload.text).join("\n");

// ---- 5. beat 1: force a real MCP tool call through the assembled plans -----
const beat1 = await runTurn({
  model: channel,
  toolMounts: plans,
  prompt:
    "Use the filesystem read_file tool to read examples/docs/contract-map.md, then quote verbatim, on its own line, the table row that mentions EntryAdapter. Do not answer from memory.",
});
showEvents(beat1.events);
const toolCalls = beat1.events.filter((e) => e.type === "tool.call");
if (toolCalls.length === 0) fail("beat 1 made no tool.call — the assembled mounts did not engage");
if (beat1.result?.isError) fail(`beat 1 result error: ${beat1.result.subtype}`);
const quote = assistantText(beat1);
if (!/EntryAdapter/.test(quote)) fail(`beat 1 assistant text lacks the quoted row: ${quote.slice(0, 200)}`);
process.stdout.write(`✓ beat1: ${toolCalls.length} tool.call(s), quoted row contains "EntryAdapter"\n`);

// drift: config mirrors the server's real tool set -> the event must be absent
const driftEvents = beat1.events.filter((e) => e.type === "kernel.system.drift");
if (driftEvents.length) {
  const p = driftEvents[0]?.payload;
  fail(`drift detected — config and discovered tools disagree: ${JSON.stringify(p)} (fix the yml, not the code)`);
}
process.stdout.write("✓ drift: report empty (declared ↔ discovered agree)\n");

if (!beat1.sdkSessionId) fail("kernel reported no session_id — cannot test resume");
ledger.setSdkSessionId(session.id, beat1.sdkSessionId);
ledger.markStatus(session.id, "idle");
ledger.touch(session.id);

// ---- 6. beat 2: resume through the LEDGER's pointer -------------------------
const stored = ledger.getByExternalKey(SMOKE_KEY);
if (stored?.sdkSessionId !== beat1.sdkSessionId) fail("ledger did not persist sdk_session_id");
const beat2 = await runTurn({
  model: channel,
  toolMounts: plans,
  resumeSdkSessionId: stored.sdkSessionId,
  prompt: "我上一句让你读了哪个文件？只回答文件名。",
});
showEvents(beat2.events);
const recall = assistantText(beat2);
if (!/contract-map/.test(recall)) {
  ledger.markStatus(session.id, "error");
  fail(`resume recall failed (sdk_session_id not honored?): ${recall.slice(0, 200)}`);
}
process.stdout.write(`✓ beat2: resumed via ledger pointer, recalled "contract-map.md"\n`);
ledger.markStatus(session.id, "idle");
ledger.close();

process.stdout.write(
  `✓ P3 smoke PASSED — mounts via loader, channel: ${process.env.AGENTOS_SMOKE_BASE_URL ? "smoke-overridden Anthropic-compatible endpoint" : model.provider} lease, db: ${join(".agentos", "sessions.db")}\n`,
);

// ---- token accounting: what did this ignition cost? --------------------------
const fmtUsage = (r) => {
  const u = r?.usage;
  if (!u) return "tokens: n/a (endpoint reported none)";
  const parts = [`in=${u.inputTokens ?? 0}`, `out=${u.outputTokens ?? 0}`];
  if (u.cacheReadTokens) parts.push(`cache_read=${u.cacheReadTokens}`);
  if (u.cacheCreationTokens) parts.push(`cache_write=${u.cacheCreationTokens}`);
  const cost =
    typeof r?.totalCostUsd === "number"
      ? ` | cost≈$${r.totalCostUsd.toFixed(4)} (Anthropic list-price; compat endpoints → channel billing is authoritative)`
      : "";
  return `tokens: ${parts.join(" ")} | turns=${r?.numTurns ?? "?"}${cost}`;
};
process.stdout.write(`  beat1 ${fmtUsage(beat1.result)}\n`);
process.stdout.write(`  beat2 ${fmtUsage(beat2.result)}\n`);
