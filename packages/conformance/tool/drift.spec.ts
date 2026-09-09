/**
 * TOOL SUITE — drift conformance (pure function, fully offline).
 * The drift contract: declared-but-absent is an alarm; discovered-but-
 * undeclared is an alarm; an empty allowlist is pass-through (no alarms in
 * either direction); wildcard declarations authorize without demanding.
 */
import { describe, expect, it } from "vitest";
import { driftReport } from "@agentos/core";

describe("drift contract", () => {
  it("pass-through: no declaration, no judgment", () => {
    expect(driftReport([], ["a", "b", "c"])).toEqual({ missing: [], undeclared: [] });
  });

  it("perfect match stays silent", () => {
    expect(driftReport(["read_file", "list_directory"], ["list_directory", "read_file"])).toEqual({
      missing: [],
      undeclared: [],
    });
  });

  it("renamed upstream tool is reported missing", () => {
    expect(driftReport(["read_file", "fetch_url"], ["read_file", "download_url"])).toEqual({
      missing: ["fetch_url"],
      undeclared: ["download_url"],
    });
  });

  it("wildcards authorize any concrete discovery", () => {
    expect(driftReport(["read_*", "list_*"], ["read_file", "read_lines", "list_dir"])).toEqual({
      missing: [],
      undeclared: [],
    });
  });

  it("a wildcard declaration is never itself reported missing", () => {
    expect(driftReport(["read_*", "write_*"], ["read_only_one"])).toEqual({
      missing: [],
      undeclared: [],
    });
  });

  it("bare star authorizes everything discovered", () => {
    expect(driftReport(["*"], ["anything", "at_all"])).toEqual({ missing: [], undeclared: [] });
  });

  it("regex metacharacters in names cannot forge wildcard semantics", () => {
    // "a.b" is a LITERAL name — must not match discovered "axb"
    expect(driftReport(["a.b"], ["axb"])).toEqual({ missing: ["a.b"], undeclared: ["axb"] });
  });
});
