/**
 * `agentos serve` — the composition root. THE only place where entry,
 * adapter, core and loader are wired together (cli may import the adapter by
 * composition-root privilege; kernel imports still live nowhere but
 * adapters/claude-sdk). Two shapes share one assembly:
 *   --chat  terminal REPL through EntryCli      (P4)
 *   --web   SSE server + static console through EntryRest (P5)
 * Everything printed is streamed by the entry implementation; this module
 * only assembles, pumps, and does ledger bookkeeping.
 */
import { createInterface } from "node:readline";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  loadManifestDir,
  validatePresetRefs,
  planTools,
  openLedger,
  ledgerPathFromEnv,
  type AnyManifest,
} from "@agentos/core";
import { ENTRY_NAME as CLI_ENTRY, EntryCli, formatUsageSummary } from "@agentos/entry-cli";
import { startServer, ENTRY_NAME as REST_ENTRY } from "@agentos/entry-rest";
import { runTurn, type ModelLease } from "@agentos/adapter-claude-sdk";

export interface ServeFlags {
  preset: string;
  session?: string;
  continue?: boolean;
  verbose?: boolean;
  web?: boolean;
  port?: number;
}

interface Assembly {
  presetName: string;
  modelLease: ModelLease;
  channelChecked: boolean;
  plans: ReturnType<typeof planTools>["plans"];
  mounts: Array<{ key: string; transport: string; degraded?: boolean }>;
  repoRoot: string;
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

/** Shared assembly: dogfood manifest loading -> reference validation -> plans. */
function assemble(flags: ServeFlags): { ok: true; value: Assembly } | { ok: false; exitCode: number; lines: string[] } {
  const presetPath = resolve(flags.preset);
  if (!existsSync(presetPath)) return { ok: false, exitCode: 1, lines: [`✗ preset not found: ${flags.preset}`] };
  const configRoot = resolve(dirname(presetPath), "..");
  const loaded: Array<{ source: string; manifest: AnyManifest }> = [];
  const problems: string[] = [];
  for (const f of collectYml(configRoot)) {
    const r = loadManifestDir(dirname(f));
    for (const l of r.loaded) if (!loaded.some((x) => x.source === l.source)) loaded.push(l);
    for (const fail of r.failed) for (const e of fail.errors) problems.push(`${f}: ${e.path}: ${e.message}`);
  }
  if (problems.length) return { ok: false, exitCode: 1, lines: problems.map((p) => `✗ ${p}`) };
  // both entry names resolve: the preset may reference cli or rest; the
  // serving shape is chosen by the flag, not the file — local-tool pragmatism
  // (config/presets is protected in P5; full entry-manifest design is P6+).
  const refErrors = validatePresetRefs(loaded, { entryNames: [CLI_ENTRY, REST_ENTRY] });
  if (refErrors.length) return { ok: false, exitCode: 1, lines: refErrors.map((e) => `✗ ${e.path}: ${e.message}`) };
  const manifests = loaded.map((l) => l.manifest);
  const preset = manifests.find((m) => m.kind === "preset");
  if (!preset || preset.kind !== "preset") return { ok: false, exitCode: 1, lines: ["✗ preset manifest missing"] };
  const model = manifests.find((m) => m.name === preset.model && m.kind === "model");
  if (!model || model.kind !== "model") return { ok: false, exitCode: 1, lines: [`✗ model "${preset.model}" not found`] };

  const repoRoot = findRepoRoot(process.cwd());
  process.env.AGENTOS_FS_ROOT ??= repoRoot;
  // demo gateway lease placeholder (unreachable by design, fail-loud loader):
  // see scripts/p2-smoke.mjs for the identical rationale.
  process.env.AGENTOS_EXAMPLE_MCP_TOKEN ??= "serve-placeholder-not-real";
  const tools = manifests.filter((m): m is Extract<AnyManifest, { kind: "tool" }> => m.kind === "tool");
  const { plans, errors, warnings } = planTools(tools);
  if (errors.length) return { ok: false, exitCode: 1, lines: errors.map((e) => `✗ ${e.path}: ${e.message}`) };
  for (const w of warnings) write(`⚠ ${w.key}: ${w.message}\n`);

  const channel: ModelLease = process.env.AGENTOS_SMOKE_BASE_URL
    ? { provider: model.provider, baseUrlEnv: "AGENTOS_SMOKE_BASE_URL", credentialsEnv: "AGENTOS_SMOKE_API_KEY" }
    : { provider: model.provider, baseUrlEnv: model.baseUrlEnv, credentialsEnv: model.credentialsEnv };
  if ((channel.baseUrlEnv && !process.env[channel.baseUrlEnv]) || (channel.credentialsEnv && !process.env[channel.credentialsEnv])) {
    return {
      ok: false,
      exitCode: 1,
      lines: [
        `✗ model channel not configured (needs ${channel.baseUrlEnv ?? "baseUrlEnv"} + ${channel.credentialsEnv ?? "credentialsEnv"} in the environment; values are never printed)`,
      ],
    };
  }
  return {
    ok: true,
    value: {
      presetName: preset.name,
      modelLease: channel,
      channelChecked: true,
      plans,
      mounts: plans.map((p) => ({ key: p.key, transport: p.transport, degraded: false })).concat(
        warnings.map((w) => ({ key: w.key, transport: "sdk", degraded: true })),
      ),
      repoRoot,
    },
  };
}

/* ------------------------------------------------------------------ chat -- */

interface Cumulative {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  turns: number;
  cost: number;
}

export async function runServe(flags: ServeFlags): Promise<number> {
  if (flags.web) return runServeWeb(flags);
  const asm = assemble(flags);
  if (!asm.ok) {
    for (const l of asm.lines) write(`${l}\n`);
    return asm.exitCode;
  }
  const { presetName, modelLease, plans } = asm.value;

  const externalKey = flags.session ?? (flags.continue ? "cli" : `cli-${Date.now()}`);
  const ledger = openLedger();
  const entry = new EntryCli({ presetName, externalKey, ledger, verbose: flags.verbose });
  let currentSdk: string | undefined;
  try {
    const binding = await entry.session();
    if (flags.continue) currentSdk = ledger.getByExternalKey(externalKey)?.sdkSessionId ?? undefined;
    const { userId } = await entry.identity();
    write(
      `● agentos serve | user=${userId} preset=${presetName} session=${binding.agentSessionId}${currentSdk ? " (resume)" : ""}\n` +
        `  mounts: ${plans.map((p) => `${p.key}(${p.transport})`).join(", ") || "none"} | /exit quits, /usage prints the running tally\n`,
    );
  } catch (err) {
    write(`✗ startup failed: ${err instanceof Error ? err.message : String(err)}\n`);
    ledger.close();
    return 1;
  }

  const total: Cumulative = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0, cost: 0 };
  const tally = () =>
    `${formatUsageSummary({ inputTokens: total.input, outputTokens: total.output, cacheReadTokens: total.cacheRead || undefined, cacheCreationTokens: total.cacheWrite || undefined })} | turns=${total.turns} | cost≈$${total.cost.toFixed(4)}${total.cost > 0 ? " (list-price; compat endpoints → channel billing is authoritative)" : ""}`;

  const onTermSignal = () => {
    try {
      ledger.markStatus(entry.sessionRow.id, "aborted");
    } catch {
      /* row may already be gone — never mask the signal */
    }
    ledger.close();
    write("\n✗ aborted (ledger marked)\n");
    process.exit(130);
  };
  process.on("SIGINT", onTermSignal);
  // SIGTERM is how docker/k8s/systemd stop processes — same graceful path.
  // (Audit finding: a SIGTERM-only kill used to leave a zombie "running" row.)
  process.on("SIGTERM", onTermSignal);

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
  // Buffered line queue: piped stdin emits lines WHILE a turn is in flight;
  // per-call once("line") would drop them (and EOF would strand the next ask).
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
      const out = await runTurn({ model: modelLease, prompt: line, toolMounts: plans, resumeSdkSessionId: currentSdk });
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

/* ------------------------------------------------------------------- web -- */

export async function runServeWeb(flags: ServeFlags): Promise<number> {
  const asm = assemble(flags);
  if (!asm.ok) {
    for (const l of asm.lines) write(`${l}\n`);
    return asm.exitCode;
  }
  const { presetName, modelLease, plans, mounts, repoRoot } = asm.value;

  const staticDir = join(repoRoot, "apps", "web", "dist");
  if (!existsSync(join(staticDir, "index.html"))) {
    write(`✗ web console not built — run: pnpm --filter @agentos/web build\n`);
    return 1;
  }
  const ledger = openLedger();
  const dbPath = ledgerPathFromEnv();
  const server = await startServer({
    presetName,
    model: { provider: modelLease.provider, baseUrlEnv: modelLease.baseUrlEnv, credentialsEnv: modelLease.credentialsEnv },
    mounts,
    runner: async (ctx) => {
      const out = await runTurn({
        model: modelLease,
        prompt: ctx.prompt,
        toolMounts: plans,
        resumeSdkSessionId: ctx.resumeSdkSessionId,
        onEvent: ctx.emit,
      });
      // the real runner has no confirm consumer yet (P7 kb_commit gating will
      // be the first); the out-of-band channel itself is conformance-proven.
      return { sdkSessionId: out.sdkSessionId };
    },
    ledger,
    port: flags.port ?? 8787,
    dbPath,
    staticDir,
  });
  write(`● agentos serve --web | preset=${presetName} mounts=${plans.length}\n  console: ${server.url}\n  Ctrl+C exits cleanly (ledger stays zombie-free)\n`);

  const onTermSignal = () => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        ledger.close();
      } catch {
        /* already closed */
      }
      write("\n✗ aborted (server closed)\n");
      process.exit(130);
    };
    server.close().catch(() => undefined).then(finish);
    setTimeout(finish, 500).unref(); // hung sockets must never cost the signal its exit code
  };
  process.on("SIGINT", onTermSignal);
  // SIGTERM = docker/k8s stop path; must behave identically to Ctrl+C.
  // Known limitation (pre-existing, tracked): an in-flight chat's ledger row is
  // not drained here — graceful drain of active runs is governance work (the
  // sre-style drainActiveRuns pattern), not signal handling.
  process.on("SIGTERM", onTermSignal);

  // park forever: the listening handle keeps the loop alive; SIGINT exits via
  // the handler above. Nothing below this line runs in normal operation.
  await new Promise<never>(() => undefined);
  return 0;
}
