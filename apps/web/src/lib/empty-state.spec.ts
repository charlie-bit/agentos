import { describe, expect, it } from "vitest";
import { EMPTY_COPY, emptyVariant } from "./empty-state";

describe("empty variants (spec #268)", () => {
  it("no provider outranks no sessions (nothing can run)", () => {
    expect(emptyVariant({ sessionCount: 0, mountCount: 0, hasKnowledge: false })).toBe("no-provider");
  });

  it("no sessions comes before no knowledge", () => {
    expect(emptyVariant({ sessionCount: 0, mountCount: 2, hasKnowledge: false })).toBe("no-sessions");
  });

  it("a configured deployment with history has no empty state", () => {
    expect(emptyVariant({ sessionCount: 3, mountCount: 1, hasKnowledge: true })).toBeNull();
    expect(emptyVariant({ sessionCount: 3, mountCount: 1, hasKnowledge: false })).toBe("no-kb");
  });

  it("every variant has copy with a next action", () => {
    for (const variant of ["no-provider", "no-sessions", "no-kb"] as const) {
      expect(EMPTY_COPY[variant].title.length).toBeGreaterThan(0);
      expect(EMPTY_COPY[variant].action.length).toBeGreaterThan(0);
    }
  });
});
