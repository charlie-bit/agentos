/**
 * spec #225 — the bootstrap guide is resident context and must honor the
 * 1–2K-token promise (#61) even for a large corpus. 500 pages is the fixture;
 * token count is the usual chars/4 estimate, deliberately conservative.
 */
import { describe, expect, it } from "vitest";
import type { KbOverview } from "@agentos/contracts";
import { MAX_INDEX_ENTRIES, renderIndex, renderOverview } from "../render.js";

function corpus(n: number): KbOverview {
  const entries = Array.from({ length: n }, (_, i) => ({
    id: `topics/very-long-directory-name/page-${String(i).padStart(4, "0")}.md`,
    title: `Page number ${i} with a descriptive title`,
    timestampMs: 1_700_000_000_000 + i,
  }));
  return { index: { entries }, recentUpdates: entries.slice(-5).reverse() };
}

const approxTokens = (s: string): number => Math.ceil(s.length / 4);

describe("overview rendering budget (#225)", () => {
  it("500 pages render inside 2K tokens with an explicit truncation note", () => {
    const guide = renderOverview(corpus(500), { name: "Big book" });
    expect(approxTokens(guide)).toBeLessThanOrEqual(2000);
    expect(guide).toContain("380 more pages");
    expect(guide).toContain("kb_search");
  });

  it("a small corpus is rendered whole (no bogus truncation)", () => {
    const guide = renderOverview(corpus(3));
    expect(guide).toContain("page-0000.md");
    expect(guide).not.toContain("more page");
  });

  it("the index cap is explicit and deterministic", () => {
    const once = renderIndex(corpus(500));
    const twice = renderIndex(corpus(500));
    expect(once).toBe(twice);
    expect(renderedNames(once)).toHaveLength(MAX_INDEX_ENTRIES);
  });
});

function renderedNames(index: string): string[] {
  return index
    .split("\n")
    .filter((l) => l.includes("page-") && !l.startsWith("…"));
}
