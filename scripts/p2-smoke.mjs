#!/usr/bin/env node
/**
 * P2 hello-world smoke: dogfoods everything.
 *   core/manifest loads config/ (our own manifests) -> core/session opens the
 *   ledger -> adapter-claude-sdk runs two turns through the rented kernel ->
 *   turn 1 MUST force a real filesystem-MCP tool call (read a known line from
 *   examples/docs/contract-map.md); turn 2 resumes via the ledger's
 *   sdk_session_id and must recall WHICH file was read.
 * Vendor-agnostic by construction: the channel is an env lease only.
 *   AGENTOS_SMOKE_BASE_URL + AGENTOS_SMOKE_API_KEY override the manifest's
 *   own lease names when present (smoke harness beats config).
 * Exit codes: 0 both beats passed; 1 assertion failed / missing credentials;
 * 2 usage. Prints event types + redacted-safe payloads; never prints env values.
 * Run: node scripts/p2-smoke.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadManifestDir, validatePresetRefs, openLedger } from "../packages/core/dist/index.js";
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
const refErrors = validatePresetRefs(loaded, { entryNames: ["console"] });
if (refErrors.length) fail(`reference integrity: ${refErrors.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
process.stdout.write(`✓ dogfood: ${loaded.length} config manifests valid, refs resolve\n`);

const preset = loaded.find((l) => l.manifest.kind === "preset")?.manifest;
const model = loaded.find((l) => l.manifest.name === preset?.model && l.manifest.kind === "model")?.manifest;
if (!preset || !model) fail("preset or its model manifest not found");

// ---- 2. channel: smoke env leases beat manifest lease names ----------------
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

// ---- 3. ledger --------------------------------------------------------------
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

// ---- 4. beat 1: force a real MCP tool call ---------------------------------
const beat1 = await runTurn({
  model: channel,
  repoRoot,
  prompt:
    "Use the filesystem read_file tool to read examples/docs/contract-map.md, then quote verbatim, on its own line, the table row that mentions EntryAdapter. Do not answer from memory.",
});
showEvents(beat1.events);
const toolCalls = beat1.events.filter((e) => e.type === "tool.call");
if (toolCalls.length === 0) fail("beat 1 made no tool.call — the MCP mount did not engage");
if (beat1.result?.isError) fail(`beat 1 result error: ${beat1.result.subtype}`);
const quote = assistantText(beat1);
if (!/EntryAdapter/.test(quote)) fail(`beat 1 assistant text lacks the quoted row: ${quote.slice(0, 200)}`);
process.stdout.write(`✓ beat1: ${toolCalls.length} tool.call(s), quoted row contains "EntryAdapter"\n`);

if (!beat1.sdkSessionId) fail("kernel reported no session_id — cannot test resume");
ledger.setSdkSessionId(session.id, beat1.sdkSessionId);
ledger.markStatus(session.id, "idle");
ledger.touch(session.id);

// ---- 5. beat 2: resume through the LEDGER's pointer -------------------------
const stored = ledger.getByExternalKey(SMOKE_KEY);
if (stored?.sdkSessionId !== beat1.sdkSessionId) fail("ledger did not persist sdk_session_id");
const beat2 = await runTurn({
  model: channel,
  repoRoot,
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
  `✓ P2 smoke PASSED — channel: ${process.env.AGENTOS_SMOKE_BASE_URL ? "smoke-overridden Anthropic-compatible endpoint" : model.provider} lease, db: ${join(".agentos", "sessions.db")}\n`,
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
