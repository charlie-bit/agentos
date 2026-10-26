import { describe, expect, it } from "vitest";
import { budgetExceeded, Semaphore } from "../concurrency.js";

describe("Semaphore (spec #164)", () => {
  it("never runs more than the limit and queues the rest FIFO", async () => {
    const sem = new Semaphore(2);
    const order: number[] = [];
    const runs: Array<Promise<void>> = [];
    for (let i = 0; i < 5; i += 1) {
      runs.push(
        (async () => {
          const release = await sem.acquire();
          order.push(i);
          expect(sem.running).toBeLessThanOrEqual(2);
          await new Promise((r) => setTimeout(r, 5));
          release();
        })(),
      );
    }
    await Promise.all(runs);
    expect(order).toEqual([0, 1, 2, 3, 4]);
    expect(sem.running).toBe(0);
  });
});

describe("budget gate (spec #163)", () => {
  it("trips at or above the declared threshold, never without one", () => {
    expect(budgetExceeded(0.5, 1)).toBe(false);
    expect(budgetExceeded(1, 1)).toBe(true);
    expect(budgetExceeded(9, undefined)).toBe(false);
  });
});
