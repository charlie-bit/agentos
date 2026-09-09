/**
 * The thin kernel shell — the repo's ONLY place allowed to import
 * @anthropic-ai/claude-agent-sdk (ESLint-enforced seam).
 * Responsibilities, and nothing else:
 *   1) translate a ModelProviderManifest's env leases into the SDK's env;
 *   2) hand query() a minimal prompt + the filesystem MCP server;
 *   3) normalize the SDK message stream to contracts' RenderEvent.
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
import type { ModelProviderManifest, RenderEvent } from "@agentos/contracts";
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
 * P2 hand-built MCP mount — fields isomorphic to config/tools/mcp-filesystem.yml
 * (stdio + command + read-only allowlist). P3's loader assembles these from
 * manifests automatically; this literal is the seed of that mapping.
 */
function filesystemServer(repoRoot: string) {
  return {
    filesystem: {
      type: "stdio" as const,
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", repoRoot],
    },
  };
}

export interface TurnInput {
  model: ModelLease;
  prompt: string;
  /** SDK session id to continue; absent = fresh conversation. */
  resumeSdkSessionId?: string;
  /** Absolute path the filesystem MCP may read — normally the repo root. */
  repoRoot: string;
  /** Default: the read-only filesystem tools (see ALLOWED below). */
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

/** Pre-approved tool names for the MCP server key above (read-only subset). */
export const DEFAULT_ALLOWED_TOOLS = [
  "mcp__filesystem__read_file",
  "mcp__filesystem__list_directory",
  "mcp__filesystem__read_multiple_files",
];

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
      mcpServers: filesystemServer(input.repoRoot),
      allowedTools: input.allowedTools ?? DEFAULT_ALLOWED_TOOLS,
      permissionMode: "default",
      maxTurns: input.maxTurns ?? 6,
      ...(input.resumeSdkSessionId ? { resume: input.resumeSdkSessionId } : {}),
      env: { ...process.env, ...sdkEnvDelta(channel) },
    },
  });

  for await (const message of stream) {
    sdkSessionId = message.session_id ?? sdkSessionId;
    events.push(...normalize(message));
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
