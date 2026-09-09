/**
 * `agentos serve --chat` — the composition root. THE only place where entry,
 * adapter, core and loader are wired together (cli may import the adapter by
 * composition-root privilege; kernel imports still live nowhere but
 * adapters/claude-sdk). Everything the REPL prints flows through entry-cli's
 * render(); this module only loops, pumps events, and does ledger bookkeeping.
 */
import { createInterface } from "node:readline";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadManifestDir, validatePresetRefs, planTools, openLedger, type AnyManifest, type LoadedManifest } from "@agentos/core";
import { ENTRY_NAME, EntryCli, formatUsageSummary } from "@agentos/entry-cli";
import { runTurn, type ModelLease } from "@agentos/adapter-claude-sdk";

export interface ServeFlags {
  preset: string;
  session?: string;
  continue?: boolean;
  verbose?: boolean;
}

interface Cumulative {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  turns: number;
  cost: number;
}

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function collectYml(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...collectYml(p));
    else if (/\.ya?ml$/i.test(e.name)) out.push(p);
  }
  return out.sort();
}

const write = (s: string) => process.stdout.write(s);

export async function runServe(flags: ServeFlags): Promise<number> {
  // ---- assembly (same dogfood path as smoke) --------------------------------
  const presetPath = resolve(flags.preset);
  if (!existsSync(presetPath)) {
    write(`✗ preset not found: ${flags.preset}\n`);
    return 1;
  }
  const configRoot = resolve(dirname(presetPath), "..");
  const loaded: LoadedManifest[] = [];
  for (const f of collectYml(configRoot)) {
    const r = loadManifestDir(dirname(f));
    for (const l of r.loaded) if (!loaded.some((x) => x.source === l.source)) loaded.push(l);
    for (const fail of r.failed) for (const e of fail.errors) write(`✗ ${f}: ${e.path}: ${e.message}\n`);
  }
  if (loaded.some((l) => !l.manifest)) return 1;
  const refErrors = validatePresetRefs(loaded, { entryNames: [ENTRY_NAME] });
  if (refErrors.length > 0) {
    for (const e of refErrors) write(`✗ ${e.path}: ${e.message}\n`);
    return 1;
  }
  const manifests: AnyManifest[] = loaded.map((l) => l.manifest);
  const preset = manifests.find((m) => m.kind === "preset");
  if (!preset || preset.kind !== "preset") return 1;
  const model = manifests.find((m) => m.name === preset.model && m.kind === "model");
  if (!model || model.kind !== "model") return 1;

  const repoRoot = findRepoRoot(process.cwd());
  process.env.AGENTOS_FS_ROOT ??= repoRoot;
  // demo gateway lease placeholder — unreachable by design; loader is fail-loud
  // without it. Real deployments export the real token (see smoke for rationale).
  process.env.AGENTOS_EXAMPLE_MCP_TOKEN ??= "serve-placeholder-not-real";
  const tools = manifests.filter((m): m is Extract<AnyManifest, { kind: "tool" }> => m.kind === "tool");
  const { plans, errors, warnings } = planTools(tools);
  if (errors.length > 0) {
    for (const e of errors) write(`✗ ${e.path}: ${e.message}\n`);
    return 1;
  }
  for (const w of warnings) write(`⚠ ${w.key}: ${w.message}\n`);

  // model channel: smoke-style lease resolution (AGENTOS_SMOKE_* override wins)
  const channel: ModelLease = process.env.AGENTOS_SMOKE_BASE_URL
    ? { ...model, baseUrlEnv: "AGENTOS_SMOKE_BASE_URL", credentialsEnv: "AGENTOS_SMOKE_API_KEY" }
    : { provider: model.provider, baseUrlEnv: model.baseUrlEnv, credentialsEnv: model.credentialsEnv };
  if ((channel.baseUrlEnv && !process.env[channel.baseUrlEnv]) || (channel.credentialsEnv && !process.env[channel.credentialsEnv])) {
    write(
      `✗ model channel not configured (needs ${channel.baseUrlEnv ?? "baseUrlEnv"} + ${channel.credentialsEnv ?? "credentialsEnv"} in the environment; values are never printed)\n`,
    );
    return 1;
  }

  // ---- session + entry -------------------------------------------------------
  const externalKey = flags.session ?? (flags.continue ? "cli" : `cli-${Date.now()}`);
  const ledger = openLedger();
  const entry = new EntryCli({ presetName: preset.name, externalKey, ledger, verbose: flags.verbose });
  let currentSdk: string | undefined;
  try {
    const binding = await entry.session();
    if (flags.continue) currentSdk = ledger.getByExternalKey(externalKey)?.sdkSessionId ?? undefined;
    const { userId } = await entry.identity();
    write(
      `● agentos serve | user=${userId} preset=${preset.name} session=${binding.agentSessionId}${currentSdk ? " (resume)" : ""}\n` +
        `  mounts: ${plans.map((p) => `${p.key}(${p.transport})`).join(", ") || "none"} | /exit quits, /usage prints the running tally\n`,
    );
  } catch (err) {
    write(`✗ startup failed: ${err instanceof Error ? err.message : String(err)}\n`);
    ledger.close();
    return 1;
  }

  const total: Cumulative = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0, cost: 0 };
  const tally = () => `${formatUsageSummary({ inputTokens: total.input, outputTokens: total.output, cacheReadTokens: total.cacheRead || undefined, cacheCreationTokens: total.cacheWrite || undefined })} | turns=${total.turns} | cost≈$${total.cost.toFixed(4)}${total.cost > 0 ? " (list-price; compat endpoints → channel billing is authoritative)" : ""}`;

  // SIGINT: book the row as aborted, THEN die — no zombie "running" rows (the
  // seed of P5's multi-pod discipline).
  process.on("SIGINT", () => {
    try {
      ledger.markStatus(entry.sessionRow.id, "aborted");
    } catch {
      /* row may already be gone — never let cleanup mask the signal */
    }
    ledger.close();
    write("\n✗ aborted (ledger marked)\n");
    process.exit(130);
  });

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
  // Buffered line queue: piped stdin emits its lines WHILE a turn is in
  // flight; per-call once("line") would drop them (and EOF would strand the
  // next ask). One persistent listener, a shift-queue, and a single waiter.
  const queue: string[] = [];
  let waiter: ((line: string | null) => void) | null = null;
  let closed = false;
  const take = (value: string | null) => {
    const w = waiter;
    waiter = null;
    if (w) w(value);
    else if (value !== null) queue.push(value);
  };
  rl.on("line", (l) => take(l));
  rl.on("close", () => {
    closed = true;
    take(null);
  });
  const ask = () =>
    queue.length ? Promise.resolve(queue.shift() as string) : closed ? Promise.resolve<string | null>(null) : new Promise<string | null>((res) => (waiter = res));

  for (;;) {
    const raw = await ask();
    if (raw === null) break;
    const line = raw.trim();
    if (line === "/exit") break;
    if (line === "") continue;
    if (line === "/usage") {
      write(`${tally()}\n`);
      continue;
    }
    try {
      const out = await runTurn({ model: channel, prompt: line, toolMounts: plans, resumeSdkSessionId: currentSdk });
      entry.render(out.events);
      if (out.sdkSessionId) {
        currentSdk = out.sdkSessionId;
        ledger.setSdkSessionId(entry.sessionRow.id, out.sdkSessionId);
      }
      const u = out.result?.usage;
      if (u) {
        total.input += u.inputTokens ?? 0;
        total.output += u.outputTokens ?? 0;
        total.cacheRead += u.cacheReadTokens ?? 0;
        total.cacheWrite += u.cacheCreationTokens ?? 0;
      }
      total.turns += out.result?.numTurns ?? 0;
      total.cost += typeof out.result?.totalCostUsd === "number" ? out.result.totalCostUsd : 0;
      ledger.markStatus(entry.sessionRow.id, "idle");
      ledger.touch(entry.sessionRow.id);
    } catch (err) {
      try {
        ledger.markStatus(entry.sessionRow.id, "error");
      } catch {
        /* ignore */
      }
      write(`✗ turn failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  write(`session tally — ${tally()}\n`);
  try {
    ledger.markStatus(entry.sessionRow.id, "idle");
  } catch {
    /* ignore */
  }
  ledger.close();
  rl.close();
  return 0;
}
