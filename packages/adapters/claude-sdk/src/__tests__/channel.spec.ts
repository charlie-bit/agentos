/**
 * Credential-lease tests, pure: resolveChannel/sdkEnvDelta run against an
 * injected fake env record — real process.env is never read, and no value in
 * these fixtures is ever a real credential. Kernel invocation itself is
 * covered by scripts/p2-smoke, not by unit tests.
 */
import { describe, expect, it } from "vitest";
import { resolveChannel, sdkEnvDelta, normalize } from "../index.js";

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

  it("result frame carries subtype + is_error as data", () => {
    const events = normalize(
      msg({ type: "result", subtype: "success", is_error: false, duration_ms: 1, num_turns: 2, result: "ok", total_cost_usd: 0, usage: {}, modelUsage: {}, permission_denials: [] }),
    );
    expect(events[0]?.type).toBe("result");
    expect(events[0]?.payload).toEqual({ subtype: "success", isError: false });
  });

  it("unknown frame types never vanish silently", () => {
    const events = normalize(msg({ type: "future_thing" }));
    expect(events[0]?.type).toBe("kernel.future_thing");
  });
});
