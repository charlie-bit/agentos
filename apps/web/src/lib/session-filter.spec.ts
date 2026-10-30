import { describe, expect, it } from "vitest";
import { filterSessions } from "./session-filter";
import type { SessionRow } from "./api";

const row = (over: Partial<SessionRow>): SessionRow => ({
  id: over.id ?? "id",
  external_key: over.external_key ?? "web-1",
  status: over.status ?? "idle",
  preset: "p",
  last_active_ms: 0,
  title: over.title ?? null,
});

describe("filterSessions (spec #266)", () => {
  const rows = [
    row({ id: "1", external_key: "web-alpha", title: "Checkout latency", status: "idle" }),
    row({ id: "2", external_key: "web-beta", title: "MySQL failover", status: "running" }),
    row({ id: "3", external_key: "web-gamma", title: null, status: "error" }),
  ];

  it("matches title, key and status case-insensitively", () => {
    expect(filterSessions(rows, "checkout").map((r) => r.id)).toEqual(["1"]);
    expect(filterSessions(rows, "BETA").map((r) => r.id)).toEqual(["2"]);
    expect(filterSessions(rows, "error").map((r) => r.id)).toEqual(["3"]);
  });

  it("an empty query returns every row, without mutating the input", () => {
    const out = filterSessions(rows, "   ");
    expect(out).toHaveLength(3);
    expect(out).not.toBe(rows);
  });

  it("no match is an empty list, not undefined", () => {
    expect(filterSessions(rows, "zzz")).toEqual([]);
  });
});
