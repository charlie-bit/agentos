import { describe, expect, it } from "vitest";
import { dialectBadge, isCompatDialect } from "./dialect";

describe("compat dialect badge (spec #213)", () => {
  it("compat dialects advertise the compatibility", () => {
    expect(dialectBadge("anthropic-compat")).toBe("compat endpoint");
    expect(dialectBadge("openai-compat")).toBe("openai-compat");
    expect(isCompatDialect("anthropic-compat")).toBe(true);
  });

  it("native bedrock and unknown/absent stay unbadged", () => {
    expect(dialectBadge("bedrock")).toBeNull();
    expect(dialectBadge(null)).toBeNull();
    expect(dialectBadge(undefined)).toBeNull();
    expect(isCompatDialect("bedrock")).toBe(false);
  });
});
