/** spec #367/#369 — window decisions and missed-window policy, fake clocks. */
import { describe, expect, it } from "vitest";
import { parseCron } from "../cron.js";
import { windowVerdict } from "../scheduler.js";

const at = (s: string) => new Date(s).getTime();
const daily = parseCron("@daily");

describe("scheduler windows (#367)", () => {
  it("fires once when the boundary has passed, and not before", () => {
    const now = at("2026-03-02T00:00:30");
    const verdict = windowVerdict(daily, at("2026-03-01T00:00:10"), now);
    expect(verdict.due).toBe(true);
    expect(verdict.missed).toBe(0);
    expect(verdict.scheduledFor?.toISOString().slice(0, 16)).toBe(new Date(at("2026-03-02T00:00:00")).toISOString().slice(0, 16));

    const early = windowVerdict(daily, at("2026-03-02T00:00:10"), now);
    expect(early.due).toBe(false);
    expect(early.nextRun).not.toBeNull();
  });

  it("first run (no lastRun) fires when a boundary falls in the last minute", () => {
    const due = windowVerdict(daily, null, at("2026-03-02T00:00:05"));
    expect(due.due).toBe(true);
  });
});

describe("missed windows (#369)", () => {
  it("a long outage fires ONCE and reports the skipped windows", () => {
    const now = at("2026-03-05T12:00:00");
    const verdict = windowVerdict(daily, at("2026-03-01T00:00:05"), now);
    expect(verdict.due).toBe(true);
    expect(verdict.missed).toBeGreaterThanOrEqual(3); // Mar 2,3,4 boundaries elapsed
    expect(verdict.nextRun!.getTime()).toBeGreaterThan(now); // next effective window is future
  });

  it("@weekly over 2 weeks reports the skipped week", () => {
    const weekly = parseCron("@weekly");
    const verdict = windowVerdict(weekly, at("2026-03-01T00:00:05"), at("2026-03-16T12:00:00"));
    expect(verdict.due).toBe(true);
    expect(verdict.missed).toBeGreaterThanOrEqual(1);
  });
});
