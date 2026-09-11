/**
 * The thin kernel shell — the repo's ONLY place allowed to import
 * @anthropic-ai/claude-agent-sdk (ESLint-enforced seam).
 * Responsibilities, and nothing else:
 *   1) translate a ModelProviderManifest's env leases into the SDK's env;
 *   2) translate NEUTRAL ToolMountPlans (from core/loader) into the SDK's
 *      MCP server shapes — this translation is the only kernel-shape logic;
 *   3) hand query() a minimal prompt + assembled servers;
 *   4) normalize the SDK message stream to contracts' RenderEvent, checking
 *      declared-vs-discovered tools at init (drift = warning event, never a
 *      hard stop — missing tools degrade, the chain keeps running).
 * The model channel is vendor-agnostic: the adapter knows url+key
 * (Anthropic-compatible) only — which vendor sits behind the URL is env
 * content, not a code branch. The single exception is AWS Bedrock, and even
 * that is just the kernel's own documented env switch, not an adapter branch.
 * Credential hygiene: VALUES are read from a provided env record only at
 * this boundary, forwarded to the child process env, never logged, never
 * persisted. The manifest side stores env var NAMES only.
 * Sandbox/permissions are deliberately minimal for P2 hello-world:
 * pre-approved read-only MCP tools, default permission mode — production
 * tightening is P5+ (governance module).
 */
import { appendFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { ModelProviderManifest, NeutralTool, RenderEvent, ToolMountPlan } from "@agentos/contracts";
import { driftReport, selectDialect } from "@agentos/core";
import { dialect as anthropicCompat } from "@agentos/model-anthropic-compat";
import { dialect as bedrock } from "@agentos/model-bedrock";
import { createSdkMcpServer, query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/** The subset of a model manifest the adapter actually consumes. */
export type ModelLease = Pick<ModelProviderManifest, "provider" | "baseUrlEnv" | "credentialsEnv">;

export interface ResolvedChannel {
  /** Anthropic-compatible base URL, or undefined = kernel default / vendor env switch. */
  baseUrl?: string;
  /** Auth token for that URL, or undefined = not leased (vendor-native credential chain). */
  authToken?: string;
  /** true = let the kernel use its documented Bedrock env switch instead. */
  useBedrock: boolean;
}

/**
 * Resolve env leases against a record (process.env by default — injectable so
 * tests never touch real credentials). P6 delegation, behavior-equivalent:
 * dialect SELECTION lives in core (selectDialect), lease READING lives in the
 * provider packages; this function only adapts the neutral ModelChannel to the
 * adapter-local shape. Precedence rule unchanged (url lease beats bedrock).
 */
export function resolveChannel(model: ModelLease, env: NodeJS.ProcessEnv = process.env): ResolvedChannel {
  const channel =
    selectDialect(model) === "bedrock" ? bedrock.resolveChannel(model, env) : anthropicCompat.resolveChannel(model, env);
  return { baseUrl: channel.baseUrl, authToken: channel.authToken, useBedrock: channel.nativeChain === "bedrock" };
}

/** Kernel model selection env: set ANTHROPIC_MODEL only when a model id was resolved upstream. */
export function modelEnv(modelId?: string): Record<string, string> {
  return modelId === undefined ? {} : { ANTHROPIC_MODEL: modelId };
}

/**
 * Child-process env delta for the kernel. Keys are the SDK's documented env
 * contract (public docs): ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN for the
 * generic url+key channel; CLAUDE_CODE_USE_BEDROCK for the vendor-native one.
 * Never include AWS_* / *KEY* values here — this function may be logged in tests.
 */
export function sdkEnvDelta(channel: ResolvedChannel): Record<string, string> {
  const delta: Record<string, string> = {};
  if (channel.baseUrl !== undefined) delta.ANTHROPIC_BASE_URL = channel.baseUrl;
  if (channel.authToken !== undefined) delta.ANTHROPIC_AUTH_TOKEN = channel.authToken;
  if (channel.useBedrock) delta.CLAUDE_CODE_USE_BEDROCK = "1";
  return delta;
}

/**
 * Plan -> SDK MCP server config translation (the kernel-shape boundary).
 * sdk plans need a live instance from the caller's registry (the opaque
 * objects the loader saw by NAME); absent instance = the entry is skipped
 * with no kernel call — consistent with the loader's degrade-not-fail rule.
 */
export function plansToMcpServers(
  plans: readonly ToolMountPlan[],
  sdkServers?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const plan of plans) {
    if (plan.transport === "stdio" && plan.stdio) {
      out[plan.key] = { type: "stdio", command: plan.stdio.command, ...(plan.stdio.args ? { args: plan.stdio.args } : {}) };
    } else if (plan.transport === "http" && plan.http) {
      out[plan.key] = { type: "http", url: plan.http.url, ...(plan.http.headers ? { headers: plan.http.headers } : {}) };
    } else if (plan.transport === "sdk" && plan.sdk) {
      const instance = sdkServers?.[plan.sdk.factoryName];
      if (instance === undefined) continue;
      out[plan.key] = { type: "sdk", name: plan.sdk.factoryName, instance };
    }
  }
  return out;
}

/**
 * Pre-approval list for the kernel: `mcp__<key>__<tool>` per declared bare
 * name. Plans without an allowlist contribute nothing here — their tools
 * fall to runtime permission behavior (P5 governance tightens this).
 */
export function allowedToolsFromPlans(plans: readonly ToolMountPlan[]): string[] {
  return plans.flatMap((p) => (p.allowedTools ?? []).map((t) => `mcp__${p.key}__${t}`));
}

/**
 * D-0910-7 (NEW-1) fs-MCP ∩ clean-room closure. Evidence chain: with the
 * clean-room cwd (workspaceDir), the kernel answers the stdio filesystem
 * server's MCP roots/list with {cwd} alone, and server-filesystem 2026.8.x
 * REPLACES its argv-declared roots with that answer — argv root=repo was
 * silently overridden, so the mount was up but its declared surface was
 * unreachable ("mounted but lying"). The kernel's official grant knob is the
 * SDK's `additionalDirectories` (docs: roots/list = launch dir ∪ every
 * additional working directory) — we compute the root set from the MOUNT
 * PLANS themselves, never a code constant:
 *     fsRoots = unique( every absolute path in every stdio plan's args
 *                        ∪ workspaceDir )
 * Clean-room semantics unchanged: the reachable surface IS the declared
 * surface — this CLOSES the gap the hotfix opened, it does not bypass it.
 * Paths are absolute-path-filtered (isAbsolute), so flag-like args ("-y",
 * package names) never leak into the grant list.
 */
export function fsRootsFromPlans(
  plans: readonly ToolMountPlan[],
  workspaceDir?: string,
): string[] {
  const roots = new Set<string>();
  for (const plan of plans) {
    for (const arg of plan.stdio?.args ?? []) {
      if (isAbsolute(arg)) roots.add(arg);
    }
  }
  if (workspaceDir !== undefined) roots.add(workspaceDir);
  return [...roots];
}

/**
 * D-0910-4 followup (④a): the EXECUTION-side mirror of the builtin-menu
 * allowlist. The menu trim (tools: ["Read"]) removes undeclared tools from
 * the ADVERTISED surface, but a model that insists on a banned call anyway
 * would otherwise reach the kernel's default permission behavior — the
 * execution surface keeps a gap the advertisement closed. This gate closes
 * it: allow exactly `Read` + `mcp__<mounted-key>__*`; everything else gets
 * a structured DENY (never a throw — the turn survives, the lie surfaces as
 * a `tool.denied` RenderEvent so the user SEES the refusal, not a hang).
 */
export function canUseToolFromPlans(plans: readonly ToolMountPlan[]): (toolName: string) => boolean {
  const mountKeys = new Set(plans.map((p) => p.key));
  return (toolName: string): boolean => {
    if (toolName === "Read") return true;
    const m = /^mcp__([^_].*?)__/.exec(toolName);
    return m?.[1] !== undefined && mountKeys.has(m[1]);
  };
}

/**
 * Aggregate declared-vs-discovered drift across mounted keys. Discovery names
 * arrive kernel-prefixed (`mcp__<key>__<tool>`); each plan is checked against
 * its own stripped slice, and reports are concatenated. Empty allowlist plan =
 * pass-through per the drift contract (no alarms from it).
 */
export function collectDrift(
  plans: readonly ToolMountPlan[],
  discoveredFullNames: readonly string[],
): { missing: string[]; undeclared: string[] } {
  const missing: string[] = [];
  const undeclared: string[] = [];
  const planKeys = new Set(plans.map((p) => p.key));
  for (const plan of plans) {
    const prefix = `mcp__${plan.key}__`;
    const bare = discoveredFullNames.filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length));
    const report = driftReport(plan.allowedTools ?? [], bare);
    missing.push(...report.missing.map((t) => `${plan.key}/${t}`));
    undeclared.push(...report.undeclared.map((t) => `${plan.key}/${t}`));
  }
  // Hotfix global pass: ANY discovered mcp__<key>__ tool whose key is not a
  // mounted plan is undeclared — the structural alarm for host leakage:
  // the day the clean-room clause (settingSources:[]) ever lapses, borrowed
  // host servers scream through this line immediately.
  for (const name of discoveredFullNames) {
    const m = /^mcp__([^_].*?)__/.exec(name);
    if (m?.[1] !== undefined && !planKeys.has(m[1])) {
      undeclared.push(`${m[1]}/${name.slice(`mcp__${m[1]}__`.length)}`);
    }
  }
  return { missing, undeclared };
}

export interface TurnInput {
  model: ModelLease;
  prompt: string;
  /** SDK session id to continue; absent = fresh conversation. */
  resumeSdkSessionId?: string;
  /** Neutral mount plans from core/loader — the ONLY way tools reach the kernel now. */
  toolMounts: readonly ToolMountPlan[];
  /** Instances for sdk-plan factories, keyed by factoryName. */
  sdkServers?: Record<string, unknown>;
  /** Explicit pre-approval override; default derives from plan allowlists (see allowedToolsFromPlans). */
  allowedTools?: string[];
  /** Kernel turn cap. Default 6 — hello-world needs tool round-trip + answer. */
  maxTurns?: number;
  /**
   * Real model id resolved upstream (core/routing picked manifest+alias).
   * Absent = kernel default (P2-P5 behavior, smoke stays byte-equivalent).
   */
  modelId?: string;
  /** Extra system-prompt segments (P7: knowledge pointer line). Base prompt stays first. */
  systemPromptAdditions?: string[];
  /**
   * HOTFIX clean-room: the session workspace — the agent's legal territory for
   * file operations and pointer drops (kb guide, offloads), isolated from the
   * source repository. Absent = process.cwd() (the pre-hotfix implicit
   * behavior, kept so untouched callers like the smoke harness stay green).
   */
  workspaceDir?: string;
  /**
   * Incremental delivery (P5 additive, backward compatible): called per
   * normalized RenderEvent AS IT ARRIVES, before the turn resolves. Absent =
   * P4 behavior untouched. Throw from this callback is caught and ignored —
   * a dead consumer must not kill the kernel turn.
   */
  onEvent?: (event: RenderEvent) => void;
}

export interface TurnOutput {
  /** Normalized event stream, in arrival order. */
  events: RenderEvent[];
  /** Kernel session id from the stream — store it in the ledger for resume. */
  sdkSessionId?: string;
  /** Terminal result facts (no transcript content). */
  result?: {
    subtype: string;
    isError: boolean;
    numTurns?: number;
    totalCostUsd?: number;
    /**
     * Kernel token accounting for this turn. Counts are vendor-neutral
     * (whatever the endpoint reports); totalCostUsd is an Anthropic list-price
     * estimate and is NOT reliable on non-Anthropic compatibility endpoints —
     * there, channel-side billing is authoritative.
     */
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheCreationTokens?: number;
    };
  };
}

/**
 * Consume a kernel message stream into RenderEvents. Exported so conformance
 * and unit tests can drive the FULL stream behavior (normalization, drift,
 * incremental onEvent) with synthetic async iterables — no kernel, no network.
 */
export async function consumeStream(
  stream: AsyncIterable<SDKMessage>,
  opts: { toolMounts: readonly ToolMountPlan[]; onEvent?: (event: RenderEvent) => void },
): Promise<TurnOutput> {
  const events: RenderEvent[] = [];
  let sdkSessionId: string | undefined;
  let result: TurnOutput["result"];

  const emit = (list: RenderEvent[]): void => {
    for (const e of list) {
      events.push(e);
      try {
        opts.onEvent?.(e);
      } catch {
        /* dead consumer: the turn survives (onEvent hygiene clause) */
      }
    }
  };

  for await (const message of stream) {
    sdkSessionId = message.session_id ?? sdkSessionId;
    emit(normalize(message));
    if (message.type === "system" && message.subtype === "init") {
      // Drift is a WARNING event, not a hard stop: fewer tools must still run
      // the chain (absent-degrade philosophy); the web console surfaces it.
      const drift = collectDrift(opts.toolMounts, message.tools ?? []);
      if (drift.missing.length + drift.undeclared.length > 0) {
        emit([{ type: "kernel.system.drift", payload: drift, timestampMs: Date.now() }]);
      }
    }
    if (message.type === "result") {
      const u = message.usage as
        | {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          }
        | undefined;
      result = {
        subtype: message.subtype,
        isError: message.is_error,
        numTurns: message.num_turns,
        totalCostUsd: message.total_cost_usd,
        ...(u
          ? {
              usage: {
                inputTokens: u.input_tokens,
                outputTokens: u.output_tokens,
                cacheReadTokens: u.cache_read_input_tokens,
                cacheCreationTokens: u.cache_creation_input_tokens,
              },
            }
          : {}),
      };
    }
  }
  return { events, sdkSessionId, result };
}

/**
 * JSON Schema (NeutralTool vocabulary) -> the kernel's zod raw-shape dialect.
 * This conversion is kernel-shape translation, so it lives HERE and nowhere else.
 */
function toZodShape(schema: NeutralTool["inputSchema"]): Record<string, z.ZodType> {
  const required = new Set(schema.required ?? []);
  const shape: Record<string, z.ZodType> = {};
  for (const [key, def] of Object.entries(schema.properties)) {
    const base: z.ZodType =
      def.type === "number" ? z.number() : def.type === "boolean" ? z.boolean() : def.type === "array" ? z.array(z.unknown()) : z.string();
    shape[key] = required.has(key) ? base : base.optional();
  }
  return shape;
}

/**
 * Wrap neutral tool definitions as an in-process MCP server (P7: the sdk
 * transport factory's first real use). Returns the kernel config object —
 * register its `.instance` under your factory name via TurnInput.sdkServers.
 * Handler results are JSON-stringified into a text block; tool output
 * semantics stay in the neutral handlers, never here.
 */
export function createInProcessServer(
  tools: readonly NeutralTool[],
  serverName = "agentos-kb",
): { type: "sdk"; name: string; instance: unknown } {
  return createSdkMcpServer({
    name: serverName,
    version: "0.1.0",
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: toZodShape(t.inputSchema),
      handler: async (args: Record<string, unknown>): Promise<{ content: { type: "text"; text: string }[] }> => {
        const result = await t.handler(args ?? {});
        return { content: [{ type: "text" as const, text: JSON.stringify(result ?? null) }] };
      },
    })),
  }) as unknown as { type: "sdk"; name: string; instance: unknown };
}

/**
 * Base system prompt. Second segment is the capability self-report boundary
 * (D-0910-4): the builtin menu is trimmed to Read (see buildQueryOptions), so
 * a model that advertises Bash/network/subagent ability is misdescribing the
 * PRODUCT to its user. Trimming alone does not fix that — the model cannot
 * infer the trim from an absent tool, it just repeats whatever its priors say
 * a "Claude Code" agent can do. The sentence is the treatment for the lying,
 * the trim is the treatment for the doing.
 */
/**
 * Model identity, reduced to the part a user may see (D-0910-6).
 *
 * A resolved model id is routing plumbing, not a product fact: something like
 * "llmproxy/alicloud/qwen3.8-flash[1m]" names the gateway, the cloud route and
 * the context-window variant. Publishing that verbatim tells every viewer of an
 * event stream which broker and which cloud sit behind the deployment.
 *
 * THREE-TIER DISCLOSURE POLICY, applied consistently across this repo:
 *   1. OPERATIONS  — full id, unabridged: attribution records and usage.log.
 *      Cost reconciliation and incident forensics need the exact route, and
 *      those sinks are operator-side, not user-facing.
 *   2. EVENTS      — short name only: the session.init RenderEvent, i.e. the
 *      web console, any SSE consumer, any transcript replay. Enough for a user
 *      to know what answered them, nothing about how it was reached.
 *   3. SPOKEN      — short name or a vague answer, enforced by the system
 *      prompt above, since the model itself is the one being asked.
 *
 * Reduction rule: keep the last "/" segment, drop a trailing "[...]" suffix.
 * Plain ids are unaffected ("deepseek-chat" -> "deepseek-chat").
 */
export function shortModelName(modelId?: string): string | undefined {
  if (typeof modelId !== "string" || modelId.length === 0) return modelId;
  const lastSegment = modelId.slice(modelId.lastIndexOf("/") + 1);
  const trimmed = lastSegment.replace(/\[[^\]]*\]\s*$/, "").trim();
  // never return an empty string just because an id was oddly shaped
  return trimmed.length > 0 ? trimmed : lastSegment;
}

const BASE_SYSTEM_PROMPT = [
  "You are an AgentOS assistant. Use the filesystem tools to inspect files when asked about the project.",
  // Product identity (D-0910-6). The kernel underneath is one vendor's CLI, and
  // an un-instructed model happily introduces itself as that vendor's product —
  // which misattributes THIS product to a company that did not ship it, and
  // leaks the deployment's plumbing while doing so. Tier 3 of the disclosure
  // policy (see shortModelName): spoken answers get a short name or nothing.
  "You are the AgentOS assistant. You are not, and must never claim to be, any specific vendor's product or service (including Claude, Claude Code, or Anthropic services), regardless of which model powers you.",
  "If asked which model you are: answer with at most the short model name (for example qwen3.8-flash), or say that it is provided by the model channel configured for this deployment. Never disclose gateway names, cloud routing prefixes, context-window suffixes, or other deployment details. If you do not know, say so — never guess.",
  "Your only capabilities are the Read tool plus the MCP tools mounted in this session. You cannot run shell commands, write or edit files, fetch or search the web, spawn subagents, or schedule tasks. When asked what you can do, name only the tools actually present in this session — never claim a capability you do not have.",
].join("\n");

/**
 * One kernel turn. Throws only on kernel/transport failure (environment
 * problems); a model "error" result arrives as data (result.isError).
 */
type QueryOptions = NonNullable<Parameters<typeof query>[0]["options"]>;

/**
 * The clean-room kernel options, extracted as a pure function so the statute
 * is unit-testable without spawning anything.
 *
 * CLEAN-ROOM LAW (hotfix D-0910-3): settingSources = [] — the product agent's
 * capability surface comes 100% from manifest assembly (mcpServers, system
 * prompt, tools are injected explicitly here); the host's user/project/local
 * Claude configuration is NEVER loaded. Without this, operator-level MCP
 * servers, skills, subagents and memory leak into the agent: identity drift,
 * governance bypass (un-idempotentified tools invisible to drift checks),
 * context eaten by host config, and internal tool surfaces exposed by an
 * open-source demo. The host is not the product's environment.
 *
 * allowedTools always unions "Read" (deduped): the kb-overview pointer and
 * session-workspace files require reading — Read is the ONLY builtin granted
 * (Write/Edit/Bash stay outside the whitelist, governance decision).
 *
 * BUILTIN SURFACE LAW (hotfix D-0910-4). Researched against the installed SDK
 * type surface (@anthropic-ai/claude-agent-sdk 0.3.263, sdk.d.ts) rather than
 * assumed, because the three knobs mean three different things:
 *   - `allowedTools`  = AUTO-APPROVE without prompting. NOT an availability
 *     gate; the SDK doc says verbatim "To restrict which tools are available,
 *     use the `tools` option instead". Listing Read here only spares it the
 *     permission prompt — it never hid Bash from the menu.
 *   - `disallowedTools` = removed from the model's context AND blocked for
 *     harness-internal direct calls. A denylist: correct but enumerative.
 *   - `tools` = "the base set of available built-in tools"; `[]` disables all
 *     builtins, `["Read"]` leaves exactly Read. An ALLOWLIST, and the only
 *     knob that actually trims the advertised menu. Plumbed at runtime as the
 *     `--tools` CLI flag; `mcpServers` travels separately (`--mcp-config`), so
 *     trimming builtins leaves every mounted MCP tool intact.
 * We therefore set `tools: ["Read"]` and deliberately do NOT add a
 * `disallowedTools` denylist: an allowlist strictly dominates it here, since
 * every builtin the SDK adds in a future release is excluded by construction,
 * whereas a hand-kept denylist of Bash, Write, Edit, the Web tools, Task and
 * cron rots silently
 * the moment upstream ships a new tool. Before this clause the model was shown
 * (and would advertise) the kernel's whole builtin menu: headless permission
 * denial made execution fail safely, but the schemas still cost resident
 * context and the surface became real the day permissionMode relaxes.
 */
export function buildQueryOptions(
  input: TurnInput,
  env: NodeJS.ProcessEnv = process.env,
): QueryOptions {
  const channel = resolveChannel(input.model, env);
  const derived = input.allowedTools ?? allowedToolsFromPlans(input.toolMounts);
  const fsRoots = fsRootsFromPlans(input.toolMounts, input.workspaceDir);
  return {
    systemPrompt:
      input.systemPromptAdditions && input.systemPromptAdditions.length > 0
        ? [BASE_SYSTEM_PROMPT, ...input.systemPromptAdditions]
        : BASE_SYSTEM_PROMPT,
    settingSources: [],
    // Probe-verified (D-0910-3 addendum): settingSources blocks host config/MCP
    // (host's 8 servers -> 0) but the CLI's FIRST-PARTY bundled skills still
    // enumerate (16 public names, no host ones). The SDK's documented `skills`
    // option is "the single place to turn skills on" -> empty seals the last
    // inherited surface: capability = manifest assembly + kernel built-in tools.
    skills: [],
    mcpServers: plansToMcpServers(input.toolMounts, input.sdkServers) as never,
    // the availability gate (see BUILTIN SURFACE LAW above) — not allowedTools
    tools: ["Read"],
    allowedTools: [...new Set([...derived, "Read"])],
    permissionMode: "default",
    maxTurns: input.maxTurns ?? 6,
    cwd: input.workspaceDir ?? process.cwd(),
    // D-0910-7: grant the kernel exactly the roots the plans declared (see
    // fsRootsFromPlans) so roots/list answers the stdio servers' truth. With no
    // stdio plans and no workspaceDir this is [] and the key stays absent —
    // the smoke path (no workspaceDir) is untouched, byte-compatible.
    ...(fsRoots.length > 0 ? { additionalDirectories: fsRoots } : {}),
    ...(input.resumeSdkSessionId ? { resume: input.resumeSdkSessionId } : {}),
    env: { ...env, ...sdkEnvDelta(channel), ...modelEnv(input.modelId) },
  };
}

export async function runTurn(input: TurnInput): Promise<TurnOutput> {
  const opts = buildQueryOptions(input);
  const gate = canUseToolFromPlans(input.toolMounts);
  // Execution-side hard gate (④a, see canUseToolFromPlans): a call outside
  // the menu mirror gets a structured deny — never a throw. Each denial also
  // lands one JSONL line in .agentos/audit.jsonl (usage.log's sibling dir):
  // the local-only execution audit — no reporting, the log is the record.
  const denied: RenderEvent[] = [];
  const auditedOpts = {
    ...opts,
    canUseTool: (async (toolName: string) => {
      if (gate(toolName)) return { behavior: "allow" as const };
      const event: RenderEvent = {
        type: "tool.denied",
        payload: { tool: toolName, reason: "outside the mounted menu (execution mirror of the declared surface)" },
        timestampMs: Date.now(),
      };
      denied.push(event);
      try {
        appendFileSync(join(process.env.AGENTOS_AUDIT_DIR ?? ".agentos", "audit.jsonl"), JSON.stringify({ ts: Date.now(), tool: toolName }) + "\n");
      } catch {
        /* audit sink failure must never kill the turn */
      }
      return { behavior: "deny" as const, message: `${toolName} is not part of this deployment's tool surface (denied by policy)` };
    }) as unknown as NonNullable<Parameters<typeof query>[0]["options"]>["canUseTool"],
  };
  const out = await consumeStream(query({ prompt: input.prompt, options: auditedOpts }), {
    toolMounts: input.toolMounts,
    onEvent: input.onEvent,
  });
  // Denied events ride at the head of the turn's stream (they fire during
  // execution, before the result frame) — prepended so the UI sees them.
  return denied.length > 0 ? { ...out, events: [...denied, ...out.events] } : out;
}

/**
 * SDK message -> contracts RenderEvent. Dot-namespace mirrors the upstream
 * event vocabulary; the SDK's per-message session_id is dropped (the ledger
 * owns identity). Assistant text blocks and tool_use blocks are 1:1;
 * user/tool_result frames are summarized as tool.result. Unknown frames pass
 * through as "kernel.<type>[.<subtype>]" so nothing silently vanishes.
 */
export function normalize(message: SDKMessage): RenderEvent[] {
  const ts = Date.now();
  switch (message.type) {
    case "system":
      if (message.subtype === "init") {
        // `tools` is the surface the KERNEL reports for this session (D-0910-4):
        // the audit/drift data source, and the structural proof that the builtin
        // trim took effect — conformance asserts Bash/Write/Edit/Web* are absent.
        return [
          {
            type: "session.init",
            payload: { model: shortModelName(message.model), cwd: message.cwd, tools: message.tools ?? [] },
            timestampMs: ts,
          },
        ];
      }
      return [{ type: `kernel.system.${message.subtype}`, payload: {}, timestampMs: ts }];
    case "assistant": {
      const out: RenderEvent[] = [];
      for (const block of message.message.content ?? []) {
        if (block.type === "text") out.push({ type: "assistant.text", payload: { text: block.text }, timestampMs: ts });
        else if (block.type === "tool_use")
          out.push({ type: "tool.call", payload: { tool: block.name, input: block.input }, timestampMs: ts });
      }
      return out;
    }
    case "user": {
      const content = message.message?.content;
      if (!Array.isArray(content)) return [];
      const out: RenderEvent[] = [];
      for (const block of content as { type?: string; is_error?: boolean }[]) {
        if (block?.type === "tool_result")
          out.push({ type: "tool.result", payload: { isError: block.is_error === true }, timestampMs: ts });
      }
      return out;
    }
    case "result":
      return [
        {
          type: "result",
          payload: {
            subtype: message.subtype,
            isError: message.is_error,
            usage: (message as { usage?: unknown }).usage ?? null,
            totalCostUsd: message.total_cost_usd ?? null,
          },
          timestampMs: ts,
        },
      ];
    default:
      return [{ type: `kernel.${(message as { type?: string }).type ?? "unknown"}`, payload: {}, timestampMs: ts }];
  }
}
