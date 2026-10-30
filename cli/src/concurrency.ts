/** FIFO semaphore for turn slots (spec #164). No timers, no dependency. */
export class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active += 1;
    return () => this.release();
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next();
  }

  get running(): number {
    return this.active;
  }
}

/** Budget gate decision (spec #163). Strictly at/over the threshold trips. */
export function budgetExceeded(spentUsd: number, budgetUsd: number | undefined): boolean {
  return budgetUsd !== undefined && spentUsd >= budgetUsd;
}
