/**
 * ToolMountPlan is a pure TYPE addition, but its transport-member coherence
 * rule is runtime-enforced so conformance suites can validate plans offline.
 * Sad cases = the three cross-member violations + secret-ish shapes.
 */
import { describe, expect, it } from "vitest";
import { toolMountPlanSchema } from "../index.js";

describe("toolMountPlanSchema — happy", () => {
  it("accepts stdio with pre-tokenized args", () => {
    expect(
      toolMountPlanSchema.safeParse({
        key: "filesystem",
        transport: "stdio",
        stdio: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/root"] },
        allowedTools: ["read_file"],
        idempotent: { default: false, overrides: { read_file: true } },
      }).success,
    ).toBe(true);
  });

  it("accepts http with resolved headers (memory-only values by contract doc)", () => {
    expect(
      toolMountPlanSchema.safeParse({
        key: "gateway",
        transport: "http",
        http: { url: "https://mcp.example.com/rpc", headers: { Authorization: "Bearer x" } },
      }).success,
    ).toBe(true);
  });

  it("accepts sdk as a bare factory name", () => {
    expect(
      toolMountPlanSchema.safeParse({ key: "builtin", transport: "sdk", sdk: { factoryName: "builtin" } }).success,
    ).toBe(true);
  });
});

describe("toolMountPlanSchema — sad", () => {
  for (const [label, plan] of [
    ["stdio without its member", { key: "k", transport: "stdio" }],
    ["http member on a stdio plan", { key: "k", transport: "stdio", stdio: { command: "x" }, http: { url: "https://a.b" } }],
    ["sdk member on an http plan", { key: "k", transport: "http", http: { url: "https://a.b" }, sdk: { factoryName: "f" } }],
    ["no transport member at all", { key: "k", transport: "sdk" }],
  ] as const) {
    it(`rejects ${label}`, () => {
      const r = toolMountPlanSchema.safeParse(plan);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.message).toContain("exactly the member matching transport");
    });
  }

  it("rejects unknown top-level keys (plans carry no hidden fields)", () => {
    expect(toolMountPlanSchema.safeParse({ key: "k", transport: "http", http: { url: "u" }, rawSecret: "s" }).success).toBe(false);
  });

  it("rejects empty key", () => {
    expect(toolMountPlanSchema.safeParse({ key: "", transport: "sdk", sdk: { factoryName: "f" } }).success).toBe(false);
  });
});
