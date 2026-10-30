import { describe, expect, it } from "vitest";
import { chainLabel, fenceSummary, isSelf } from "./agents";
import type { AgentInfo } from "./api";

const a = (over: Partial<AgentInfo>): AgentInfo => ({
  name: "analyst",
  chain: ["analyst"],
  promptPreview: "p",
  tools: [],
  manifestPath: null,
  ...over,
});

describe("role card derivation (spec #343)", () => {
  it("renders the inheritance chain root→leaf", () => {
    expect(chainLabel(a({ chain: ["base", "analyst"], baseAgent: "base" }))).toBe("base → analyst");
    expect(chainLabel(a({}))).toBe("analyst");
  });
  it("summarises the fence, naming the open case", () => {
    expect(fenceSummary(a({ tools: ["kb_search", "todo_add"] }))).toBe("kb_search · todo_add");
    expect(fenceSummary(a({ tools: [] }))).toBe("full preset surface");
  });
  it("knows the self case", () => {
    expect(isSelf(a({}))).toBe(true);
    expect(isSelf(a({ baseAgent: "base", chain: ["base", "analyst"] }))).toBe(false);
  });
});
