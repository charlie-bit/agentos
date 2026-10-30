/**
 * spec #245 — the knowledge pointer line exists once. serve --web used to
 * spell its own variant, which drifted from KB_POINTER_LINE.
 */
import { describe, expect, it } from "vitest";
import { KB_POINTER_LINE, kbPointerLine } from "../tools.js";

describe("kb pointer line (#245)", () => {
  it("names the path it was given", () => {
    const line = kbPointerLine("/srv/ws/kb-overview.md");
    expect(line).toContain("/srv/ws/kb-overview.md");
    expect(line).toContain("kb_search");
    expect(line).toContain("kb_get_page");
  });

  it("the constant is the default-location call", () => {
    expect(KB_POINTER_LINE).toBe(kbPointerLine());
    expect(KB_POINTER_LINE).toContain("./kb-overview.md");
  });
});
