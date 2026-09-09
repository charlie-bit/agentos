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
import type { ModelProviderManifest, RenderEvent, ToolMountPlan } from "@agentos/contracts";
import { driftReport } from "@agentos/core";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

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
 * tests never touch real credentials). Precedence: an explicit baseUrlEnv lease
 * wins even for aws-bedrock; the Bedrock switch applies only with no URL lease.
 */
export function resolveChannel(model: ModelLease, env: NodeJS.ProcessEnv = process.env): ResolvedChannel {
  const baseUrl = model.baseUrlEnv ? env[model.baseUrlEnv] : undefined;
  const authToken = model.credentialsEnv ? env[model.credentialsEnv] : undefined;
  const useBedrock = !model.baseUrlEnv && model.provider === "aws-bedrock";
  return { baseUrl, authToken, useBedrock };
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
  for (const plan of plans) {
    const prefix = `mcp__${plan.key}__`;
    const bare = discoveredFullNames.filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length));
    const report = driftReport(plan.allowedTools ?? [], bare);
    missing.push(...report.missing.map((t) => `${plan.key}/${t}`));
    undeclared.push(...report.undeclared.map((t) => `${plan.key}/${t}`));
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
 * One kernel turn. Throws only on kernel/transport failure (environment
 * problems); a model "error" result arrives as data (result.isError).
 */
export async function runTurn(input: TurnInput): Promise<TurnOutput> {
  const channel = resolveChannel(input.model);
  const events: RenderEvent[] = [];
  let sdkSessionId: string | undefined;
  let result: TurnOutput["result"];

  const stream = query({
    prompt: input.prompt,
    options: {
      systemPrompt: "You are an AgentOS assistant. Use the filesystem tools to inspect files when asked about the project.",
      mcpServers: plansToMcpServers(input.toolMounts, input.sdkServers) as never,
      allowedTools: input.allowedTools ?? allowedToolsFromPlans(input.toolMounts),
      permissionMode: "default",
      maxTurns: input.maxTurns ?? 6,
      ...(input.resumeSdkSessionId ? { resume: input.resumeSdkSessionId } : {}),
      env: { ...process.env, ...sdkEnvDelta(channel) },
    },
  });

  for await (const message of stream) {
    sdkSessionId = message.session_id ?? sdkSessionId;
    events.push(...normalize(message));
    if (message.type === "system" && message.subtype === "init") {
      // Drift is a WARNING event, not a hard stop: fewer tools must still run
      // the chain (absent-degrade philosophy); governance consumes this in P5.
      const drift = collectDrift(input.toolMounts, message.tools ?? []);
      if (drift.missing.length + drift.undeclared.length > 0) {
        events.push({ type: "kernel.system.drift", payload: drift, timestampMs: Date.now() });
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
        return [{ type: "session.init", payload: { model: message.model, cwd: message.cwd }, timestampMs: ts }];
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
