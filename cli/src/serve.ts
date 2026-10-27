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
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  loadManifestDir,
  validatePresetRefs,
  planTools,
  openLedger,
  ledgerPathFromEnv,
  fallbackManifestOrder,
  resolveActiveModel,
  HealthGate,
  selectDialect,
  aggregateUsage,
  appendAttribution,
  formatAttributionLine,
  usageLogPath,
  buildKbTools,
  isIdempotent,
  kbPointerLine,
  type Attribution,
  type AnyManifest,
} from "@agentos/core";
import { createMarkdownProvider } from "@agentos/knowledge-markdown";
import { ENTRY_ADAPTER_NAMES, toolProviderManifestSchema } from "@agentos/contracts";
import type { ConfirmRequest, ConfirmResult, KnowledgeManifest, ModelProviderManifest, NeutralTool, ToolProviderManifest } from "@agentos/contracts";
import { dialect as compatDialect } from "@agentos/model-anthropic-compat";
import { dialect as bedrockDialect } from "@agentos/model-bedrock";
import { dialect as openaiDialect } from "@agentos/model-openai-compat";
import { runPresetValidate } from "./preset-validate.js";
import { appendLog, readLogs } from "./logs.js";
import { budgetExceeded, Semaphore } from "./concurrency.js";
import { commitDraft } from "@agentos/core";
import { EntryCli, formatUsageSummary } from "@agentos/entry-cli";
import { startServer, CAPABILITIES as REST_CAPABILITIES, ENTRY_NAME as REST_ENTRY, type ToolDescriptor } from "@agentos/entry-rest";
import { BASE_SYSTEM_PROMPT, createInProcessServer, readTranscript, runTurn, type ModelLease } from "@agentos/adapter-claude-sdk";

export interface ServeFlags {
  preset: string;
  session?: string;
  continue?: boolean;
  verbose?: boolean;
  web?: boolean;
  port?: number;
  /** Bind interface for --web; default 127.0.0.1 (containers pass 0.0.0.0). */
  host?: string;
  /** P6 request-level override: manifest name OR alias; beats the preset slot. */
  model?: string;
}

export interface Assembly {
  presetName: string;
  /** The preset's model slot (before any channel/request-level override). */
  presetModel: string;
  /** preset.channelModels — middle routing layer (spec #208). */
  channelModels?: Record<string, string>;
  allModels: ModelProviderManifest[];
  /** Preset knowledge slot manifest if loaded (P7 chain); undefined = no kb. */
  knowledge?: KnowledgeManifest;
  plans: ReturnType<typeof planTools>["plans"];
  mounts: Array<{ key: string; transport: string; degraded?: boolean }>;
  /** Tool manifest name -> repo-relative source path (diagnostics, spec #290). */
  toolManifestPaths: Record<string, string>;
  /** Knowledge manifest source path + mount type (spec #262). */
  knowledgeInfo?: { name: string; manifestPath: string | null; mountType: string | null };
  /** Preset's entry slot name (spec #262). */
  entryName: string;
  /** channel -> entry adapter routes (spec #212), defaulting to entryName. */
  channelRoutes: Record<string, string>;
  /** Preset-declared gates (spec #163/#164); absent = unlimited. */
  budgetUsd?: number;
  maxConcurrentSessions?: number;
  /** Declared cross-endpoint fallback order (spec #26). */
  fallbackModels?: string[];
  repoRoot: string;
}

/** P7 knowledge chain wired into the P3 assembly line. */
export interface KbWiring {
  plan: ReturnType<typeof planTools>["plans"][number];
  sdkServers: Record<string, unknown>;
  pointer: string[];
}

/** Routed turn-model: what runTurn needs + who to attribute the turn to. */
interface RoutedModel {
  lease: ModelLease;
  manifestName: string;
  provider: string;
  alias?: string;
  modelId?: string;
  usageAttr?: Record<string, string>;
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

/** Build the attribution record from a finished turn (routing identity + kernel numbers). */
function attributionFor(
  out: Awaited<ReturnType<typeof runTurn>>,
  routed: RoutedModel,
  presetName: string,
  session: string,
): Attribution {
  const u = out.result?.usage;
  return {
    tsMs: Date.now(),
    preset: presetName,
    session,
    // Attribution is the only place tenancy exists (#209/#187): no kernel
    // multi-tenancy, just labels that make usage roll-ups possible.
    tenant: presetName,
    manifest: routed.manifestName,
    provider: routed.provider,
    alias: routed.alias,
    modelId: routed.modelId,
    ...(routed.usageAttr ? { attr: routed.usageAttr } : {}),
    usage: u ? { input: u.inputTokens, output: u.outputTokens, cacheRead: u.cacheReadTokens, cacheWrite: u.cacheCreationTokens } : undefined,
    costUsd: typeof out.result?.totalCostUsd === "number" ? out.result.totalCostUsd : undefined,
  };
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

/** Dialect registry (spec #210): adding a vendor family is a package + a row. */
const dialects = { "anthropic-compat": compatDialect, bedrock: bedrockDialect, "openai-compat": openaiDialect } as const;

/**
 * Resolve a web-supplied preset name/path to a validator target (spec #289).
 * Path fence: a bare name resolves inside config/presets; anything else must
 * be a relative path that stays under config/presets or examples. Anything
 * outside returns null (the route answers 400), so validation can never read
 * arbitrary files (R7).
 */
export function resolvePresetTarget(repoRoot: string, requested: string): string | null {
  if (requested.includes("\0")) return null;
  const allowedRoots = [join(repoRoot, "config", "presets"), join(repoRoot, "examples")];
  const byName = join(repoRoot, "config", "presets", `${requested.replace(/\.ya?ml$/i, "")}.yml`);
  const candidates = requested.includes("/") || requested.includes("\\") ? [resolve(repoRoot, requested), byName] : [byName];
  for (const candidate of candidates) {
    if (!allowedRoots.some((root) => candidate === root || candidate.startsWith(root + sep))) continue;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Preset catalogue for GET /api/presets (spec #288): names + repo-relative paths, no contents. */
export function listPresetFiles(repoRoot: string): Array<{ name: string; path: string }> {
  const dir = join(repoRoot, "config", "presets");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/i.test(f))
    .sort()
    .map((f) => ({ name: f.replace(/\.ya?ml$/i, ""), path: relative(repoRoot, join(dir, f)) }));
}

/** Shared assembly: dogfood manifest loading -> reference validation -> plans. */
export function assemble(flags: ServeFlags): { ok: true; value: Assembly } | { ok: false; exitCode: number; lines: string[] } {
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
  const refErrors = validatePresetRefs(loaded, { entryNames: ENTRY_ADAPTER_NAMES });
  if (refErrors.length) return { ok: false, exitCode: 1, lines: refErrors.map((e) => `✗ ${e.path}: ${e.message}`) };
  const manifests = loaded.map((l) => l.manifest);
  const preset = manifests.find((m) => m.kind === "preset");
  if (!preset || preset.kind !== "preset") return { ok: false, exitCode: 1, lines: ["✗ preset manifest missing"] };
  const model = manifests.find((m) => m.name === preset.model && m.kind === "model");
  if (!model || model.kind !== "model") return { ok: false, exitCode: 1, lines: [`✗ model "${preset.model}" not found`] };

  const repoRoot = findRepoRoot(process.cwd());
  process.env.AGENTOS_FS_ROOT ??= repoRoot;
  // No credential sugar here (spec #227): a manifest whose lease cannot be
  // resolved must fail loudly at plan time. The doc placeholder mount is
  // declared with enabled:false instead of being propped up with a fake token.
  // preset.tools is the MOUNT LIST (#5/#17): only these manifest names mount,
  // in the declared order. Planning every tool in config/ silently over-mounted.
  const toolByName = new Map(
    manifests.filter((m): m is Extract<AnyManifest, { kind: "tool" }> => m.kind === "tool").map((m) => [m.name, m]),
  );
  const tools = preset.tools.flatMap((name) => {
    const m = toolByName.get(name);
    return m ? [m] : [];
  });
  const { plans, errors, warnings } = planTools(tools);
  // Failure isolation (spec #204): an ENVIRONMENT defect (missing var / lease)
  // removes ONE provider with a ⚠, it does not abort the boot. Config lies
  // (schema/reference) stay fail-loud — a lying yml is not a deployment state.
  const fatal = errors.filter((e) => e.category !== "environment");
  const degradedByEnv = errors.filter((e) => e.category === "environment");
  if (fatal.length) return { ok: false, exitCode: 1, lines: fatal.map((e) => `✗ ${e.path}: ${e.message}`) };
  for (const w of warnings) write(`⚠ ${w.key}: ${w.message}\n`);
  const byName = new Map(tools.map((m) => [m.name, m]));
  const toolManifestPaths: Record<string, string> = {};
  for (const l of loaded) {
    if (l.manifest.kind === "tool") toolManifestPaths[l.manifest.name] = relative(repoRoot, resolve(l.source));
  }
  const knowledgeLoaded = loaded.find((l) => l.manifest.kind === "knowledge" && l.manifest.name === preset.knowledge);
  const knowledgeInfo = knowledgeLoaded
    ? {
        name: knowledgeLoaded.manifest.name,
        manifestPath: relative(repoRoot, resolve(knowledgeLoaded.source)),
        mountType: knowledgeLoaded.manifest.kind === "knowledge" ? knowledgeLoaded.manifest.mount.type : null,
      }
    : undefined;
  for (const e of degradedByEnv) {
    write(`⚠ provider absent (environment): ${e.path}: ${e.message}\n`);
  }
  const envDegraded = degradedByEnv.map((e) => {
    const key = e.path.split(".")[0] ?? e.path;
    const m = byName.get(key);
    return { key, transport: (m ? m.transport : "unknown") as "sdk" | "stdio" | "http" | "unknown", degraded: true };
  });

  const mounts: Array<{ key: string; transport: string; degraded?: boolean; manifestPath?: string }> = [
    ...plans.map((p) => ({
      key: p.key,
      transport: p.transport as string,
      degraded: false,
      ...(toolManifestPaths[p.key] ? { manifestPath: toolManifestPaths[p.key] as string } : {}),
    })),
    ...warnings.map((w) => ({ key: w.key, transport: "sdk", degraded: true })),
    ...envDegraded.map((m) => ({ ...m, ...(toolManifestPaths[m.key] ? { manifestPath: toolManifestPaths[m.key] as string } : {}) })),
  ];
  return {
    ok: true,
    value: {
      presetName: preset.name,
      presetModel: model.name,
      ...(preset.channelModels ? { channelModels: preset.channelModels } : {}),
      allModels: manifests.filter((m): m is ModelProviderManifest => m.kind === "model"),
      knowledge: manifests.find((m) => m.kind === "knowledge" && m.name === preset.knowledge) as KnowledgeManifest | undefined,
      plans,
      mounts,
      toolManifestPaths,
      ...(knowledgeInfo ? { knowledgeInfo } : {}),
      entryName: preset.entry,
      channelRoutes: preset.channels ?? {},
      ...(preset.budgetUsd !== undefined ? { budgetUsd: preset.budgetUsd } : {}),
      ...(preset.maxConcurrentSessions !== undefined ? { maxConcurrentSessions: preset.maxConcurrentSessions } : {}),
      ...(preset.fallbackModels ? { fallbackModels: preset.fallbackModels } : {}),
      repoRoot,
    },
  };
}

/**
 * P6 routing step (composition-root duty): priority -> alias, health gate
 * with alias-level fallback, lease presence check. The smoke-harness env
 * override (AGENTOS_SMOKE_*) beats manifest lease NAMES — same rule as P5,
 * relocated, not changed.
 */
async function routeModel(flags: ServeFlags, asm: Assembly): Promise<{ ok: true; value: RoutedModel } | { ok: false; exitCode: number; lines: string[] }> {
  const active = resolveActiveModel({
    presetModel: asm.presetModel,
    override: flags.model,
    // The mounted entry IS the channel: cli REPL vs web console may each pin
    // their own model in preset.channelModels.
    channel: flags.web ? "rest" : "cli",
    ...(asm.channelModels ? { channelModels: asm.channelModels } : {}),
    models: asm.allModels,
  });
  if (!active.ok) return { ok: false, exitCode: 1, lines: active.errors.map((e) => `✗ ${e.path}: ${e.message}${e.hint ? ` (${e.hint})` : ""}`) };
  const { manifest } = active.active;

  const gate = new HealthGate(async (m) => dialects[selectDialect(m)].healthCheck(m));
  let picked = await gate.pick(manifest, active.active.alias);
  let chosen = manifest;
  // Cross-endpoint fallback (spec #26): declared preset.fallbackModels, in
  // order, only after the primary has NO healthy alias. Explicit, never silent.
  if (!picked.ok) {
    for (const name of fallbackManifestOrder(manifest.name, asm.fallbackModels, asm.allModels)) {
      const candidate = asm.allModels.find((m) => m.name === name);
      if (!candidate) continue;
      const attempt = await gate.pick(candidate);
      if (attempt.ok) {
        write(`⚠ model fallback: "${manifest.name}" unhealthy → "${candidate.name}" (declared preset.fallbackModels)\n`);
        chosen = candidate;
        picked = attempt;
        break;
      }
    }
  }
  if (!picked.ok) {
    return {
      ok: false,
      exitCode: 1,
      lines: [
        `✗ no healthy alias for model manifest "${manifest.name}"${asm.fallbackModels?.length ? " (and declared fallbacks are unhealthy)" : ""}:`,
        ...Object.entries(picked.probes).map(([alias, r]) => `    ${alias}: ${r.ok ? "ok" : (r.reason ?? "probe failed")}`),
      ],
    };
  }
  const effectiveManifest = chosen;

  const smokeLease = process.env.AGENTOS_SMOKE_BASE_URL
    ? { baseUrlEnv: "AGENTOS_SMOKE_BASE_URL", credentialsEnv: "AGENTOS_SMOKE_API_KEY" }
    : { baseUrlEnv: manifest.baseUrlEnv, credentialsEnv: manifest.credentialsEnv };
  const lease: ModelLease = { provider: manifest.provider, ...smokeLease };
  if ((lease.baseUrlEnv && !process.env[lease.baseUrlEnv]) || (lease.credentialsEnv && !process.env[lease.credentialsEnv])) {
    return {
      ok: false,
      exitCode: 1,
      lines: [`✗ model channel not configured (needs ${lease.baseUrlEnv ?? "baseUrlEnv"} + ${lease.credentialsEnv ?? "credentialsEnv"} in the environment; values are never printed)`],
    };
  }
  return {
    ok: true,
    value: {
      lease,
      manifestName: effectiveManifest.name,
      provider: effectiveManifest.provider,
      alias: picked.alias,
      modelId: picked.modelId,
      usageAttr: effectiveManifest.usageAttr,
    },
  };
}

/* knowledge chain (P7) ------------------------------------------------------ */

/**
 * P7 knowledge chain mounted THROUGH the P3 assembly line: the in-process kb
 * server is wrapped by the adapter (createSdkMcpServer stays kernel-exclusive
 * there), registered as an sdk-transport ToolMountPlan synthesized in memory
 * (config/ is P7b territory), so drift/allowlist bookkeeping is unified.
 * mount type != path degrades with a warning (P8 ships the git-sync loader);
 * no kb manifest = plain session. `confirm` is the entry's human gate:
 * chat reuses the REPL queue (piped lines answer in order), web the SSE modal.
 */
export async function wireKnowledge(
  asm: Assembly,
  confirm: (req: Omit<ConfirmRequest, "requestId">) => Promise<ConfirmResult>,
  workspaceDir: string,
  /** The mounted entry adapter's own capabilities.confirm — never assumed. */
  confirmCapable: boolean,
): Promise<KbWiring | null> {
  const km = asm.knowledge;
  if (!km) return null;
  if (km.mount.type !== "path") {
    write(`⚠ knowledge "${km.name}": mount type "${km.mount.type}" needs the P8 sync loader — session runs without kb\n`);
    return null;
  }
  const root = resolve(asm.repoRoot, km.mount.path);
  const draftsDir = join(asm.repoRoot, ".agentos", "kb-drafts");
  const receiptsLog = join(asm.repoRoot, ".agentos", "kb-receipts.jsonl");
  // the guide lives IN THE SESSION WORKSPACE (hotfix clean-room: the agent's
  // file territory is its workspace, not the source repo)
  const overviewFile = join(workspaceDir, "kb-overview.md");
  const provider = createMarkdownProvider({ name: km.provider, root, draftsDir, receiptsLog });
  const tools = buildKbTools({
    provider,
    confirmCapable,
    bookRoot: root,
    draftsDir,
    receiptsLog,
    workspaceOverviewFile: overviewFile,
    confirm,
    tenant: { tenantId: asm.presetName },
  });
  // factory name == manifest name == mount key: one identity, "kb".
  const kbManifest = toolProviderManifestSchema.parse({
    kind: "tool",
    version: "1",
    name: "kb",
    transport: "sdk",
    auth: { mode: "none" },
    allowedTools: tools.map((t: NeutralTool) => t.name),
    // Retry policy data (spec #205): reads are retry-safe, the two write
    // beats are not — kb_write mints a new receipt per call, kb_commit
    // consumes one. The executor branches on exactly this declaration.
    idempotent: { default: true, overrides: { kb_write: false, kb_commit: false } },
    schemaExchange: "json-schema",
  }) as ToolProviderManifest;
  // Plan first (a placeholder factory satisfies the registry lookup) so the
  // server's retry policy can branch on the surfaced plan, not a guess.
  const { plans: kbPlans, errors } = planTools([kbManifest], { sdkFactories: { kb: {} } });
  const kbPlan = kbPlans[0];
  const serverConfig = createInProcessServer(tools, "kb", {
    ...(kbPlan
      ? {
          retry: {
            idempotentFor: (toolName: string) => isIdempotent(kbPlan, toolName),
            onRetry: (toolName: string) =>
              write(`⚠ transport failure on ${toolName}: retrying once (declared idempotent)\n`),
          },
        }
      : {}),
    // Large kb pages/results land in the session workspace, not in context.
    workspaceDir,
  });
  if (errors.length > 0 || kbPlans[0] === undefined) {
    write(
      `⚠ kb plan failed — session runs without kb: ${errors.length ? errors.map((e) => `${e.path}: ${e.message}`).join("; ") : "sdk factory 'kb' produced no plan"}\n`,
    );
    return null;
  }
  await tools[0]?.handler({}); // kb_overview: render + persist the guide for the pointer line
  return {
    plan: kbPlans[0],
    sdkServers: { kb: serverConfig.instance },
    pointer: [kbPointerLine(overviewFile)],
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
  const { presetName, plans } = asm.value;
  const routed = await routeModel(flags, asm.value);
  if (!routed.ok) {
    for (const l of routed.lines) write(`${l}\n`);
    return routed.exitCode;
  }
  const { lease: modelLease, modelId } = routed.value;

  const externalKey = flags.session ?? (flags.continue ? "cli" : `cli-${Date.now()}`);
  const ledger = openLedger();
  const swept = ledger.sweepRunning(); // #253: the previous process is gone; its "running" rows are ghosts
  if (swept > 0) write(`⚠ ledger: ${swept} stale running row(s) marked aborted\n`);
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

  // Chat's human gate rides the SAME line queue: piped input answers prompts in
  // order (question, then y/n, then /exit) — no stdin contention with a second readline.
  const chatConfirm = async (req: Omit<ConfirmRequest, "requestId">): Promise<ConfirmResult> => {
    write(`\n${req.prompt} [y/N] `);
    const ans = (await ask()) ?? "";
    return { approved: /^(y|yes)$/i.test(ans.trim()), decidedBy: `cli-user:${ans.trim() || "no-answer"}`, timestampMs: Date.now() };
  };
  // Hotfix clean-room: per-session workspace = the agent's legal file territory.
  const workspaceDir = join(asm.value.repoRoot, ".agentos", "workspaces", externalKey);
  mkdirSync(workspaceDir, { recursive: true });
  const kb = await wireKnowledge(asm.value, chatConfirm, workspaceDir, entry.capabilities.confirm);
  const allPlans = kb ? [...plans, kb.plan] : plans;

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
      const out = await runTurn({
        model: modelLease,
        prompt: line,
        toolMounts: allPlans,
        sdkServers: kb?.sdkServers,
        systemPromptAdditions: kb?.pointer,
        workspaceDir,
        resumeSdkSessionId: currentSdk,
        modelId,
      });
      entry.render(out.events);
      const attr = attributionFor(out, routed.value, presetName, externalKey);
      write(`${formatAttributionLine(attr)}\n`);
      appendAttribution(attr);
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
  const { presetName, plans, mounts, repoRoot } = asm.value;
  // Channel routing table (spec #212): the web channel must be served by the
  // REST adapter. A dangling route is a config lie and stops the boot here —
  // it can never silently serve the other kernel's channel.
  // Absent route = this mode's own adapter serves the channel (the server
  // knows what it mounts). Only an EXPLICIT route to a different kernel is a
  // conflict — that is the anti-pattern ③ guard.
  const webEntry = asm.value.channelRoutes.web ?? REST_ENTRY;
  if (webEntry !== REST_ENTRY) {
    write(`✗ channels.web routes to "${webEntry}", but serve --web mounts the "${REST_ENTRY}" adapter — fix the preset's channels table\n`);
    return 1;
  }
  const routed = await routeModel(flags, asm.value);
  if (!routed.ok) {
    for (const l of routed.lines) write(`${l}\n`);
    return routed.exitCode;
  }
  const { lease: modelLease, modelId } = routed.value;

  const staticDir = join(repoRoot, "apps", "web", "dist");
  if (!existsSync(join(staticDir, "index.html"))) {
    write(`✗ web console not built — run: pnpm --filter @agentos/web build\n`);
    return 1;
  }
  const ledger = openLedger();
  const swept = ledger.sweepRunning(); // #253: boot recovery, same rule as the REPL
  // Local one-time token (spec #287): generated per boot unless the operator
  // pins one. It is printed to this terminal only and never logged anywhere.
  const webToken = process.env.AGENTOS_WEB_TOKEN ?? randomBytes(24).toString("base64url");
  if (swept > 0) write(`⚠ ledger: ${swept} stale running row(s) marked aborted\n`);
  const dbPath = ledgerPathFromEnv();
  // Active-turn registry for SIGTERM drainage (spec #293): a shutdown waits
  // for in-flight turns (bounded), then the sweep settles any row they left.
  const activeTurns = new Set<Promise<unknown>>();
  // Resource governance (spec #163/#164): the preset declares both; absent =
  // unlimited / no budget gate. Queueing is FIFO and never drops a turn.
  const turnSlots = new Semaphore(asm.value.maxConcurrentSessions ?? 64);
  const budgetUsd = asm.value.budgetUsd;
  const server = await startServer({
    presetName,
    model: { provider: modelLease.provider, baseUrlEnv: modelLease.baseUrlEnv, credentialsEnv: modelLease.credentialsEnv },
    mounts,
    runner: async (ctx) => {
      const releaseSlot = await turnSlots.acquire();
      const turn = (async () => {
      if (budgetExceeded(aggregateUsage(usageLogPath()).totals.costUsd, budgetUsd)) {
        const answer = await ctx.confirm({
          prompt: `Declared budget (${budgetUsd} USD) reached — run this turn anyway?`,
          subject: { budgetUsd, event: "budget-gate" },
        });
        if (!answer.approved) {
          throw new Error("budget gate denied: cumulative spend is at the declared ceiling");
        }
      }
      // Hotfix clean-room: per-browser-session workspace (externalKey keyed).
      const workspaceDir = join(asm.value.repoRoot, ".agentos", "workspaces", ctx.externalKey);
      mkdirSync(workspaceDir, { recursive: true });
      const kb = await wireKnowledge(asm.value, ctx.confirm, workspaceDir, REST_CAPABILITIES.confirm);
      // Request-level override (#115): re-resolve through the same three-layer
      // routing; an unknown name fails the turn rather than silently ignoring.
      const effective = ctx.modelOverride
        ? await routeModel({ preset: flags.preset, model: ctx.modelOverride, web: true }, asm.value)
        : { ok: true as const, value: routed.value };
      if (!effective.ok) {
        throw new Error(`model override rejected: ${effective.lines.join(" ")}`);
      }
      const out = await runTurn({
        model: effective.value.lease,
        prompt: ctx.prompt,
        signal: ctx.signal,
        toolMounts: kb ? [...plans, kb.plan] : plans,
        sdkServers: kb?.sdkServers,
        systemPromptAdditions: kb?.pointer,
        workspaceDir,
        resumeSdkSessionId: ctx.resumeSdkSessionId,
        onEvent: ctx.emit,
        modelId,
      });
      // server-side attribution: stdout line + usage.log. The web UI is frozen
      // for P5.1 visual review — attribution display there waits for that verdict.
      const attr = attributionFor(out, effective.value, presetName, ctx.externalKey);
      write(`${formatAttributionLine(attr)}\n`);
      appendAttribution(attr);
      // Operational log (spec #124/#292): metadata only — session key, model
      // identity, token counts. Never prompt/reply/tool payload (R2/R9).
      appendLog(repoRoot, "serve", {
        event: "turn",
        session: ctx.externalKey,
        provider: attr.provider,
        model: attr.modelId ?? attr.alias ?? attr.manifest,
        usage: attr.usage ?? null,
      });
      // the real runner has no confirm consumer yet (P7 kb_commit gating will
      // be the first); the out-of-band channel itself is conformance-proven.
      return { sdkSessionId: out.sdkSessionId };
      })();
      activeTurns.add(turn);
      try {
        return await turn;
      } finally {
        activeTurns.delete(turn);
        releaseSlot();
      }
    },
    ledger,
    // History replay (P5.1): the ONLY place that knows both halves — the ledger
    // pointer belongs to core, the transcript format belongs to the adapter, and
    // the workspace path convention (per-session cwd) is this root's own rule.
    // entry-rest stays format-blind; it just calls what it was handed.
    readTranscript: ({ sdkSessionId, externalKey }) =>
      readTranscript(sdkSessionId, join(repoRoot, ".agentos", "workspaces", externalKey)),
    port: flags.port ?? 8787,
    ...(flags.host ? { host: flags.host } : {}),
    dbPath,
    staticDir,
    systemPrompt: BASE_SYSTEM_PROMPT,
    token: webToken,
    health: async () => ({
      model: await (async () => {
        try {
          const probe = await dialects[selectDialect(modelLease)].healthCheck(modelLease);
          return { key: routed.value.manifestName, healthy: probe.ok, ...(probe.reason ? { reason: probe.reason } : {}) };
        } catch (err) {
          return { key: routed.value.manifestName, healthy: false, reason: err instanceof Error ? err.message : "probe failed" };
        }
      })(),
      mounts: mounts.map((m) => ({
        key: m.key,
        healthy: m.degraded !== true,
        version: m.transport,
        ...(m.degraded ? { reason: "degraded or not resolvable" } : {}),
      })),
    }),
    logs: ({ lines }) => readLogs(repoRoot, lines).map((f) => ({ name: f.name, lines: f.lines.map((l) => l) })),
    knowledge: asm.value.knowledgeInfo ?? undefined,
    entry: { name: asm.value.entryName, confirm: REST_CAPABILITIES.confirm },
    dialect: selectDialect(modelLease),
    kbDrafts: (() => {
      const km = asm.value.knowledge;
      if (!km || km.mount.type !== "path") return undefined;
      const root = resolve(asm.value.repoRoot, km.mount.path);
      const draftsDir = join(asm.value.repoRoot, ".agentos", "kb-drafts");
      const receiptsLog = join(asm.value.repoRoot, ".agentos", "kb-receipts.jsonl");
      const parse = (receiptId: string) => {
        const file = join(draftsDir, `${receiptId}.md`);
        if (!existsSync(file)) return null;
        const raw = readFileSync(file, "utf8");
        const targetLine = /<!-- target: (?:NEW )?([^\s>]+) -->/.exec(raw)?.[1] ?? "";
        const body = raw.split("\n").slice(3).join("\n");
        const title = /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? targetLine;
        return { receiptId, pageId: targetLine, title, preview: body.trim().slice(0, 400), createdAtMs: existsSync(file) ? Math.floor(statSync(file).mtimeMs) : null };
      };
      return {
        list: () =>
          existsSync(draftsDir)
            ? readdirSync(draftsDir)
                .filter((f: string) => f.endsWith(".md"))
                .map((f: string) => parse(f.slice(0, -3)))
                .filter((d): d is NonNullable<typeof d> => d !== null)
                .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))
            : [],
        commit: (receiptId: string) => {
          const draft = parse(receiptId);
          if (!draft) return { ok: false, reason: "unknown receipt" };
          try {
            commitDraft({
              bookRoot: root,
              draftsDir,
              receiptsLog,
              receiptId,
              pageId: draft.pageId,
              evidence: `web draft inbox: committed ${draft.pageId}`,
              confirmation: { confirmedBy: "web-user:kb-draft-commit", confirmedAtMs: Date.now() },
            });
            return { ok: true };
          } catch (err) {
            return { ok: false, reason: err instanceof Error ? err.message : String(err) };
          }
        },
        discard: (receiptId: string) => {
          const file = join(draftsDir, `${receiptId}.md`);
          if (!existsSync(file)) return { ok: false };
          unlinkSync(file);
          return { ok: true };
        },
      };
    })(),
    listPresets: () => listPresetFiles(asm.value.repoRoot),
    usage: (q) => aggregateUsage(usageLogPath(), q),
    // Session workspaces are keyed by the entry's externalKey; only boring
    // keys resolve, so a client-supplied session id can never pick a path.
    workspaceDirFor: (externalKey) =>
      /^[A-Za-z0-9_-]{1,200}$/.test(externalKey) ? join(asm.value.repoRoot, ".agentos", "workspaces", externalKey) : null,
    listTools: (): ToolDescriptor[] => {
      const mounted: ToolDescriptor[] = asm.value.plans.map((p) => ({
        key: p.key,
        transport: p.transport,
        manifestPath: asm.value.toolManifestPaths[p.key] ?? null,
        allowedTools: p.allowedTools ?? null,
        idempotent: p.idempotent ?? null,
        mounted: true,
      }));
      const absent: ToolDescriptor[] = mounts
        .filter((m) => m.degraded === true)
        .map((m) => ({
          key: m.key,
          transport: m.transport,
          manifestPath: asm.value.toolManifestPaths[m.key] ?? null,
          allowedTools: null,
          idempotent: null,
          mounted: false,
        }));
      return [...mounted, ...absent];
    },
    validatePreset: (requested) => {
      const target = resolvePresetTarget(asm.value.repoRoot, requested);
      if (target === null) return { exitCode: 1, lines: [`✗ preset not found (searched ${requested})`] };
      return runPresetValidate(target);
    },
  });
  write(
    `● agentos serve --web | preset=${presetName} mounts=${plans.length}\n  console: ${server.url}\n  token:   ${webToken}\n  (paste the token into the console once; it is stored in this browser only)\n  Ctrl+C exits cleanly (ledger stays zombie-free)\n`,
  );

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
