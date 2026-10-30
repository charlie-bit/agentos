/**
 * TOOL SUITE — drift conformance (pure function, fully offline).
 * The drift contract: declared-but-absent is an alarm; discovered-but-
 * undeclared is an alarm; wildcard declarations authorize without demanding.
 * Spec #226: an EMPTY allowlist is not "all clear" — it is UNVERIFIED, a
 * distinct fact a caller must be able to surface.
 */
import { describe, expect, it } from "vitest";
import { driftReport } from "@agentos/core";

describe("drift contract", () => {
  it("pass-through: no declaration, no judgment — but explicitly unverified", () => {
    expect(driftReport([], ["a", "b", "c"])).toEqual({ missing: [], undeclared: [], unverified: true });
  });

  it("perfect match stays silent and verified", () => {
    expect(driftReport(["read_file", "list_directory"], ["list_directory", "read_file"])).toEqual({
      missing: [],
      undeclared: [],
      unverified: false,
    });
  });

  it("renamed upstream tool is reported missing", () => {
    expect(driftReport(["read_file", "fetch_url"], ["read_file", "download_url"])).toEqual({
      missing: ["fetch_url"],
      undeclared: ["download_url"],
      unverified: false,
    });
  });

  it("wildcards authorize any concrete discovery", () => {
    expect(driftReport(["read_*", "list_*"], ["read_file", "read_lines", "list_dir"])).toEqual({
      missing: [],
      undeclared: [],
      unverified: false,
    });
  });

  it("a wildcard declaration is never itself reported missing", () => {
    expect(driftReport(["read_*", "write_*"], ["read_only_one"])).toEqual({
      missing: [],
      undeclared: [],
      unverified: false,
    });
  });

  it("bare star authorizes everything discovered (and counts as a declaration)", () => {
    expect(driftReport(["*"], ["anything", "at_all"])).toEqual({ missing: [], undeclared: [], unverified: false });
  });

  it("regex metacharacters in names cannot forge wildcard semantics", () => {
    // "a.b" is a LITERAL name — must not match discovered "axb"
    expect(driftReport(["a.b"], ["axb"])).toEqual({ missing: ["a.b"], undeclared: ["axb"], unverified: false });
  });
});
