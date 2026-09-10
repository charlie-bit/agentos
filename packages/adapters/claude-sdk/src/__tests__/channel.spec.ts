/**
 * Credential-lease tests, pure: resolveChannel/sdkEnvDelta run against an
 * injected fake env record — real process.env is never read, and no value in
 * these fixtures is ever a real credential. Kernel invocation itself is
 * covered by scripts/p2-smoke, not by unit tests.
 */
import { describe, expect, it } from "vitest";
import {
  resolveChannel,
  sdkEnvDelta,
  modelEnv,
  normalize,
  plansToMcpServers,
  allowedToolsFromPlans,
  collectDrift,
  consumeStream,
  buildQueryOptions,
  type TurnInput,
} from "../index.js";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

const FAKE_ENV = {
  AGENTOS_SMOKE_BASE_URL: "https://channel.example/anthropic",
  AGENTOS_SMOKE_API_KEY: "sk-fake-not-a-real-key-000000",
} as const;

describe("resolveChannel", () => {
  it("generic Anthropic-compatible lease: url + key", () => {
    const ch = resolveChannel(
      { provider: "deepseek", baseUrlEnv: "AGENTOS_SMOKE_BASE_URL", credentialsEnv: "AGENTOS_SMOKE_API_KEY" },
      FAKE_ENV,
    );
    expect(ch.baseUrl).toBe(FAKE_ENV.AGENTOS_SMOKE_BASE_URL);
    expect(ch.authToken).toBe(FAKE_ENV.AGENTOS_SMOKE_API_KEY);
    expect(ch.useBedrock).toBe(false);
  });

  it("aws-bedrock without a URL lease flips the kernel's documented switch", () => {
    const ch = resolveChannel({ provider: "aws-bedrock", credentialsEnv: "AWS_BEARER_TOKEN_BEDROCK" }, FAKE_ENV);
    expect(ch.useBedrock).toBe(true);
    expect(ch.baseUrl).toBeUndefined();
  });

  it("aws-bedrock WITH a URL lease prefers the explicit lease over the switch", () => {
    const ch = resolveChannel(
      { provider: "aws-bedrock", baseUrlEnv: "AGENTOS_SMOKE_BASE_URL", credentialsEnv: "AGENTOS_SMOKE_API_KEY" },
      FAKE_ENV,
    );
    expect(ch.useBedrock).toBe(false);
    expect(ch.baseUrl).toBeDefined();
  });

  it("a missing env entry degrades to undefined, never throws", () => {
    const ch = resolveChannel({ provider: "x", credentialsEnv: "NOT_SET_ANYWHERE" }, {});
    expect(ch.authToken).toBeUndefined();
  });
});

describe("sdkEnvDelta", () => {
  it("emits exactly the documented key names — values pass through untouched", () => {
    const delta = sdkEnvDelta({
      baseUrl: "https://channel.example/anthropic",
      authToken: "sk-fake",
      useBedrock: false,
    });
    expect(Object.keys(delta).sort()).toEqual(["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"]);
  });

  it("bedrock switch alone, no url keys", () => {
    expect(sdkEnvDelta({ useBedrock: true })).toEqual({ CLAUDE_CODE_USE_BEDROCK: "1" });
  });

  it("empty channel, empty delta", () => {
    expect(sdkEnvDelta({ useBedrock: false })).toEqual({});
  });
});

describe("modelEnv (P6: kernel model selection)", () => {
  it("resolved id becomes ANTHROPIC_MODEL", () => {
    expect(modelEnv("vendor-b/big")).toEqual({ ANTHROPIC_MODEL: "vendor-b/big" });
  });
  it("absent id adds nothing (kernel default preserved = smoke parity)", () => {
    expect(modelEnv(undefined)).toEqual({});
  });
});

describe("resolveChannel delegates to dialects (P6 behavior-equivalence)", () => {
  it("produces the identical shape the inline P2 logic produced", () => {
    const generic = resolveChannel({ provider: "deepseek", baseUrlEnv: "AGENTOS_SMOKE_BASE_URL", credentialsEnv: "AGENTOS_SMOKE_API_KEY" }, FAKE_ENV);
    expect(generic).toEqual({ baseUrl: FAKE_ENV.AGENTOS_SMOKE_BASE_URL, authToken: FAKE_ENV.AGENTOS_SMOKE_API_KEY, useBedrock: false });
    const bw = resolveChannel({ provider: "aws-bedrock", credentialsEnv: "AWS_BEARER_TOKEN_BEDROCK" }, FAKE_ENV);
    expect(bw).toEqual({ baseUrl: undefined, authToken: undefined, useBedrock: true });
  });
});

describe("normalize (synthetic SDK frames, kernel-free)", () => {
  const msg = (over: Record<string, unknown>) =>
    ({ session_id: "s", uuid: "u", ...over }) as unknown as Parameters<typeof normalize>[0];

  it("assistant text block -> assistant.text", () => {
    const events = normalize(msg({ type: "assistant", message: { content: [{ type: "text", text: "hi" }] } }));
    expect(events[0]?.type).toBe("assistant.text");
    expect(events[0]?.payload).toEqual({ text: "hi" });
  });

  it("assistant tool_use block -> tool.call with name+input", () => {
    const events = normalize(
      msg({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__filesystem__read_file", input: { path: "/x" } }] } }),
    );
    expect(events[0]?.type).toBe("tool.call");
  });

  it("user tool_result block -> tool.result; non-array content -> nothing", () => {
    const withResult = normalize(msg({ type: "user", message: { content: [{ type: "tool_result", is_error: false }] } }));
    expect(withResult[0]?.type).toBe("tool.result");
    expect(normalize(msg({ type: "user", message: { content: "text" } }))).toEqual([]);
  });

  it("result frame carries subtype + is_error + usage/cost as data", () => {
    const events = normalize(
      msg({ type: "result", subtype: "success", is_error: false, duration_ms: 1, num_turns: 2, result: "ok", total_cost_usd: 0, usage: {}, modelUsage: {}, permission_denials: [] }),
    );
    expect(events[0]?.type).toBe("result");
    expect(events[0]?.payload).toEqual({ subtype: "success", isError: false, usage: {}, totalCostUsd: 0 });
    // Endpoints that omit accounting: say so explicitly (null), never invent numbers.
    const bare = normalize(msg({ type: "result", subtype: "success", is_error: false }));
    expect(bare[0]?.payload).toEqual({ subtype: "success", isError: false, usage: null, totalCostUsd: null });
  });

  it("unknown frame types never vanish silently", () => {
    const events = normalize(msg({ type: "future_thing" }));
    expect(events[0]?.type).toBe("kernel.future_thing");
  });
});

describe("plan translation (P3): ToolMountPlan -> kernel shapes", () => {
  const stdioPlan = {
    key: "fs",
    transport: "stdio" as const,
    stdio: { command: "npx", args: ["-y", "server-filesystem", "/root"] },
    allowedTools: ["read_file"],
  };
  const httpPlan = {
    key: "gw",
    transport: "http" as const,
    http: { url: "https://mcp.example.com/rpc", headers: { Authorization: "Bearer fake" } },
  };
  const sdkPlan = { key: "bi", transport: "sdk" as const, sdk: { factoryName: "builtin" } };

  it("stdio and http translate field-for-field; sdk needs its instance", () => {
    const servers = plansToMcpServers([stdioPlan, httpPlan, sdkPlan], { builtin: { marker: true } });
    expect(servers.fs).toEqual({ type: "stdio", command: "npx", args: ["-y", "server-filesystem", "/root"] });
    expect(servers.gw).toEqual({ type: "http", url: "https://mcp.example.com/rpc", headers: { Authorization: "Bearer fake" } });
    expect(servers.bi).toEqual({ type: "sdk", name: "builtin", instance: { marker: true } });
  });

  it("an sdk plan without a registered instance is skipped, not fabricated", () => {
    expect(plansToMcpServers([sdkPlan], {})).toEqual({});
  });

  it("allowedTools derive to mcp__<key>__<tool>; unlisted plans contribute nothing", () => {
    expect(allowedToolsFromPlans([stdioPlan, httpPlan])).toEqual(["mcp__fs__read_file"]);
  });
});

describe("drift wiring (P3)", () => {
  const plan = {
    key: "fs",
    transport: "stdio" as const,
    stdio: { command: "srv" },
    allowedTools: ["read_file", "gone_tool"],
  };

  it("collectDrift strips the kernel prefix and reports per-key in key/tool form", () => {
    // HOTFIX amendment: a foreign key (mcp__other__x) now ALSO alarms via the
    // global pass; the old expectation encoded the leak-blindness this fixes.
    const drift = collectDrift([plan], ["mcp__fs__read_file", "mcp__fs__surprise", "mcp__other__x"]);
    expect(drift).toEqual({ missing: ["fs/gone_tool"], undeclared: ["fs/surprise", "other/x"] });
  });

  it("a clean init produces no drift event (normalize+collect stay quiet)", () => {
    const discovered = ["mcp__fs__read_file", "mcp__fs__gone_tool"];
    const drift = collectDrift([plan], discovered);
    expect(drift).toEqual({ missing: [], undeclared: [] });
  });
});

describe("consumeStream + onEvent (P5 incremental delivery, synthetic kernel)", () => {
  const frames = [
    { type: "system", subtype: "init", session_id: "s-9", tools: ["mcp__fs__read_file", "mcp__fs__gone_tool"] },
    { type: "assistant", session_id: "s-9", message: { content: [{ type: "text", text: "hello" }] } },
    { type: "result", session_id: "s-9", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0.02 },
  ] as unknown as SDKMessage[];
  const fakeStream = () => (async function* () { for (const f of frames) yield f; })();
  const mount = {
    key: "fs",
    transport: "stdio" as const,
    stdio: { command: "x" },
    allowedTools: ["read_file", "gone_tool", "never_mounted"],
  };

  it("onEvent fires per normalized RenderEvent in stream order", async () => {
    const seen: string[] = [];
    const out = await consumeStream(fakeStream(), { toolMounts: [mount], onEvent: (e) => seen.push(e.type) });
    // drift lands right after the init frame it was computed from
    expect(seen).toEqual(["session.init", "kernel.system.drift", "assistant.text", "result"]);
    expect(out.sdkSessionId).toBe("s-9");
    expect(out.result?.subtype).toBe("success");
  });

  it("a throwing onEvent consumer does not kill the turn", async () => {
    const out = await consumeStream(fakeStream(), {
      toolMounts: [mount],
      onEvent: () => {
        throw new Error("dead sink");
      },
    });
    expect(out.events.length).toBe(4); // events still accumulate server-side
    expect(out.result?.isError).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* HOTFIX D-0910-3: clean-room kernel statute — pure options, no spawn.       */

const turnBase = (over: Partial<TurnInput> = {}): TurnInput => ({
  model: { provider: "vendor-x", baseUrlEnv: "AGENTOS_SMOKE_BASE_URL", credentialsEnv: "AGENTOS_SMOKE_API_KEY" },
  prompt: "hi",
  toolMounts: [{ key: "fs", transport: "stdio", stdio: { command: "x" }, allowedTools: ["read_file"] }],
  ...over,
});

describe("clean-room options (buildQueryOptions)", () => {
  it("settingSources is the empty set — host config is NOT the product's environment", () => {
    expect(buildQueryOptions(turnBase(), FAKE_ENV).settingSources).toEqual([]);
  });

  it("workspaceDir becomes cwd; absent falls back to process.cwd() (smoke parity)", () => {
    expect(buildQueryOptions(turnBase({ workspaceDir: "/tmp/ws-1" }), FAKE_ENV).cwd).toBe("/tmp/ws-1");
    expect(buildQueryOptions(turnBase(), FAKE_ENV).cwd).toBe(process.cwd());
  });

  it("allowedTools unions Read only — Write/Edit/Bash never granted", () => {
    const tools = buildQueryOptions(turnBase(), FAKE_ENV).allowedTools ?? [];
    expect(tools).toContain("Read");
    expect(tools).toContain("mcp__fs__read_file");
    for (const banned of ["Write", "Edit", "Bash", "NotebookEdit"]) expect(tools).not.toContain(banned);
    // deduped + override path keeps the same guarantee:
    const overridden = buildQueryOptions(turnBase({ allowedTools: ["Read", "mcp__x__y"] }), FAKE_ENV).allowedTools ?? [];
    expect(overridden.filter((t) => t === "Read")).toHaveLength(1);
  });

  it("leases resolve through the INJECTED env (pure function, zero process.env reads)", () => {
    const o = buildQueryOptions(turnBase(), FAKE_ENV);
    expect(o.env?.ANTHROPIC_BASE_URL).toBe("https://channel.example/anthropic");
    expect(o.env?.ANTHROPIC_AUTH_TOKEN).toBe("sk-fake-not-a-real-key-000000");
  });
});

describe("collectDrift global pass (structural leak alarm)", () => {
  it("a discovered mcp__ghost-server__x with no mounted plan screams undeclared", () => {
    const plan = { key: "fs", transport: "stdio" as const, stdio: { command: "x" }, allowedTools: ["read_file"] };
    const drift = collectDrift([plan], ["mcp__fs__read_file", "mcp__ghost-server__sneaky_tool"]);
    expect(drift.missing).toEqual([]);
    expect(drift.undeclared).toContain("ghost-server/sneaky_tool");
  });
  it("declared keys behave exactly as before (no regression in the per-plan pass)", () => {
    const plan = { key: "fs", transport: "stdio" as const, stdio: { command: "x" }, allowedTools: ["read_file", "gone"] };
    expect(collectDrift([plan], ["mcp__fs__read_file"])).toEqual({ missing: ["fs/gone"], undeclared: [] });
  });
});
