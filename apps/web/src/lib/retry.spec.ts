import { describe, expect, it, vi } from "vitest";
import { withRetry } from "./retry";

describe("withRetry (spec #282)", () => {
  it("retries once after a transient failure and succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");
    await expect(withRetry(fn, [1])).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured attempts and rethrows", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("down"));
    await expect(withRetry(fn, [1, 1])).rejects.toThrow("down");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
