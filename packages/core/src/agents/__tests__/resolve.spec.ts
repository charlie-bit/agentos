/** spec #329 — inheritance semantics: prompt concat, tools union, child override. */
import { describe, expect, it } from "vitest";
import type { AgentManifest } from "@agentos/contracts";
import { resolveAgent } from "../resolve.js";

const a = (over: Partial<AgentManifest> & { name: string }): AgentManifest =>
  ({ kind: "agent", version: "1", systemPrompt: "base", ...over }) as AgentManifest;

describe("resolveAgent (spec #329)", () => {
  it("concatenates prompts root→leaf and unions tools", () => {
    const agents = new Map([
      ["base", a({ name: "base", systemPrompt: "ROOT", tools: ["search", "read"] })],
      ["child", a({ name: "child", baseAgent: "base", systemPrompt: "CHILD", tools: ["write", "read"] })],
    ]);
    const r = resolveAgent("child", agents);
    expect(r.systemPrompt).toBe("ROOT\n\nCHILD");
    expect(r.tools).toEqual(["search", "read", "write"]);
    expect(r.chain).toEqual(["base", "child"]);
  });

  it("nearest override wins for knowledge/model", () => {
    const agents = new Map([
      ["base", a({ name: "base", knowledge: "kb-base", model: "model-base" })],
      ["child", a({ name: "child", baseAgent: "base", model: "model-child" })],
    ]);
    const r = resolveAgent("child", agents);
    expect(r.knowledge).toBe("kb-base");
    expect(r.model).toBe("model-child");
  });

  it("an agent with no base runs as itself; unknown/cyclic input throws", () => {
    const agents = new Map([["solo", a({ name: "solo", systemPrompt: "solo" })]]);
    expect(resolveAgent("solo", agents)).toMatchObject({ chain: ["solo"], tools: [] });
    expect(() => resolveAgent("ghost", agents)).toThrow(/unknown agent/);
    const cyclic = new Map([
      ["x", a({ name: "x", baseAgent: "y" })],
      ["y", a({ name: "y", baseAgent: "x" })],
    ]);
    expect(() => resolveAgent("x", cyclic)).toThrow(/cycle/);
  });
});
