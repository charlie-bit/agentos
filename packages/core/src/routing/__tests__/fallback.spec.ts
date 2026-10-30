/** spec #26 — the declared cross-endpoint fallback order is explicit and pure. */
import { describe, expect, it } from "vitest";
import { fallbackManifestOrder } from "../active.js";
import type { ModelProviderManifest } from "@agentos/contracts";

const m = (name: string): ModelProviderManifest =>
  ({ kind: "model", version: "1", name, provider: name, models: { g: `${name}-real` } }) as ModelProviderManifest;

describe("fallbackManifestOrder (spec #26)", () => {
  it("keeps declared order, drops the primary, unknown names and duplicates", () => {
    const models = [m("a"), m("b"), m("c")];
    expect(fallbackManifestOrder("a", ["c", "ghost", "b", "c", "a"], models)).toEqual(["c", "b"]);
  });

  it("no declaration means no cross-endpoint escape", () => {
    expect(fallbackManifestOrder("a", [], [m("a"), m("b")])).toEqual([]);
  });
});
