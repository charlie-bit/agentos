/** spec #357 — cron parsing and window math, all with fake clocks. */
import { describe, expect, it } from "vitest";
import { parseCron } from "../cron.js";

const at = (s: string) => new Date(s);
/** Local wall-clock string — cron evaluates in local time, so tests do too. */
const local = (d: Date | null): string | null =>
  d === null ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

describe("cron parser (#357)", () => {
  it("aliases expand and match the documented windows", () => {
    const daily = parseCron("@daily");
    expect(daily.matches(at("2026-03-01T00:00:00"))).toBe(true);
    expect(daily.matches(at("2026-03-01T00:01:00"))).toBe(false);
    expect(local(daily.nextRunAfter(at("2026-03-01T00:00:00")))).toBe("2026-03-02T00:00");
    const weekly = parseCron("@weekly");
    expect(weekly.nextRunAfter(at("2026-03-01T12:00:00"))?.getDay()).toBe(0);
  });

  it("steps, ranges and lists stay inside their fields", () => {
    const every15 = parseCron("*/15 * * * *");
    for (const minute of [0, 15, 30, 45]) expect(every15.matches(at(`2026-01-01T10:${String(minute).padStart(2, "0")}:00`))).toBe(true);
    expect(every15.matches(at("2026-01-01T10:07:00"))).toBe(false);
    const office = parseCron("0 9-17 * * 1-5");
    expect(office.matches(at("2026-03-02T09:00:00"))).toBe(true);
    expect(office.matches(at("2026-03-01T09:00:00"))).toBe(false);
    expect(parseCron("0 0 1,15 * *").matches(at("2026-03-15T00:00:00"))).toBe(true);
  });

  it("month ends and leap years resolve through nextRunAfter", () => {
    const monthly = parseCron("0 0 31 * *");
    expect(local(monthly.nextRunAfter(at("2026-01-31T00:00:00")))).toBe("2026-03-31T00:00");
    const leap = parseCron("0 0 29 2 *");
    expect(local(leap.nextRunAfter(at("2026-03-01T00:00:00")))).toBe("2028-02-29T00:00");
  });

  it("rejects malformed input loudly", () => {
    expect(() => parseCron("0 0 * *")).toThrow(/5 fields/);
    expect(() => parseCron("60 0 * * *")).toThrow(/out-of-range/);
    expect(() => parseCron("*/0 * * * *")).toThrow(/step/);
    expect(() => parseCron("0 0 * * 9")).toThrow(/out-of-range/);
  });
});
