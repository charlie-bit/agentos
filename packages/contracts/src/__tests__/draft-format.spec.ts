/**
 * spec #224 — the draft header has ONE definition (contracts), consumed by the
 * writer and the committer. These tests pin the round trip and the degrade
 * path: a page WITHOUT a header must come back whole, never lose its first
 * lines to a line-count assumption.
 */
import { describe, expect, it } from "vitest";
import { DRAFT_HEADER_TAG, renderDraftFile, stripDraftHeader } from "../knowledge.js";

describe("draft file format (#224)", () => {
  it("round-trips a body byte for byte", () => {
    const body = "# Title\n\ntext with <!-- comments --> inside\n";
    const file = renderDraftFile("r-1", "NEW topics/x.md", body);
    expect(file).toContain(`<!-- ${DRAFT_HEADER_TAG} r-1 -->`);
    expect(file).toContain("<!-- target: NEW topics/x.md -->");
    expect(stripDraftHeader(file)).toBe(body);
  });

  it("a header with no blank line still strips cleanly", () => {
    const file = "<!-- agentos draft r-2 -->\n<!-- target: a.md -->\nbody";
    expect(stripDraftHeader(file)).toBe("body");
  });

  it("a page without a header is returned unchanged", () => {
    const plain = "# Real page\nfirst line matters\n";
    expect(stripDraftHeader(plain)).toBe(plain);
  });

  it("a foreign leading comment is not mistaken for a draft header", () => {
    const plain = "<!-- todo: keep -->\n# Page\n";
    expect(stripDraftHeader(plain)).toBe(plain);
  });
});
