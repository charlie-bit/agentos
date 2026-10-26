/**
 * spec #205 — the retry executor. Branch source is the mount plan's
 * idempotent declaration; the retry is exactly one extra transport attempt.
 */
import { describe, expect, it, vi } from "vitest";
import { isIdempotent, withRetryOnce } from "../retry.js";

describe("isIdempotent — plan is the only branch source (#205)", () => {
  it("absent declaration means NOT retry-safe", () => {
    expect(isIdempotent({}, "read_file")).toBe(false);
  });

  it("default applies unless an override names the tool", () => {
    const plan = { idempotent: { default: true, overrides: { write_file: false } } };
    expect(isIdempotent(plan, "read_file")).toBe(true);
    expect(isIdempotent(plan, "write_file")).toBe(false);
  });

  it("a mostly-mutating server carves out reads", () => {
    const plan = { idempotent: { default: false, overrides: { read_text_file: true } } };
    expect(isIdempotent(plan, "read_text_file")).toBe(true);
    expect(isIdempotent(plan, "edit_file")).toBe(false);
  });
});

describe("withRetryOnce — exactly one extra transport attempt", () => {
  it("an idempotent call that fails once is retried and succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValueOnce("ok");
    await expect(withRetryOnce(fn, true)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("a non-idempotent call is never retried", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("socket hang up"));
    await expect(withRetryOnce(fn, false)).rejects.toThrow("socket hang up");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("a second failure propagates (no retry storm)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("still down"));
    await expect(withRetryOnce(fn, true)).rejects.toThrow("still down");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("success is never retried and domain answers pass straight through", async () => {
    const fn = vi.fn().mockResolvedValue({ hits: [] });
    await expect(withRetryOnce(fn, true)).resolves.toEqual({ hits: [] });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
