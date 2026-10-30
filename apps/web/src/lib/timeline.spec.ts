import { describe, expect, it } from "vitest";
import { turnTimeline } from "./timeline";
import type { Entry } from "./chat-reducer";

describe("turn timeline (spec #128/#295)", () => {
  it("orders tools with durations and flags denied calls separately", () => {
    const entries: Entry[] = [
      { kind: "user", id: "u", text: "why slow?" },
      { kind: "tool", id: "t1", name: "kb_search", input: '{"q":"x"}', status: "ok", durationMs: 1200 },
      { kind: "tool", id: "t2", name: "bash", input: "bash is not part of this deployment's tool surface (denied by policy)", status: "error" },
      { kind: "drift", id: "d", missing: ["a"], undeclared: [], unverified: ["gw"] },
      { kind: "assistant", id: "a", text: "done", status: "done" },
    ];
    const items = turnTimeline(entries);
    expect(items.map((i) => i.kind)).toEqual(["tool", "denied", "drift"]);
    expect(items[0]).toMatchObject({ label: "kb_search", durationMs: 1200 });
    expect(items[2]?.detail).toContain("unverified 1");
  });

  it("an empty turn yields an empty timeline", () => {
    expect(turnTimeline([])).toEqual([]);
  });
});
