/**
 * Scheduler window math (spec #367/#369). Pure: the serve loop owns the timer,
 * the ledger owns lastRun (#368), this module only answers "is a window due,
 * and how many windows did we miss".
 *
 * Law: at most ONE fire per window boundary. A long stop (missed > 1 period)
 * never replays back-to-back — the missed count is reported for visibility
 * and the next effective window is returned instead.
 */
import type { CronSpec } from "./cron.js";

export interface WindowVerdict {
  due: boolean;
  /** The boundary this decision belongs to (next run after lastRun). */
  scheduledFor: Date | null;
  /** Windows skipped while the process was down (0 = on time). */
  missed: number;
  /** Boundary strictly after now — what to store as the new lastRun target. */
  nextRun: Date | null;
}

const MAX_WALK = 500;

export function windowVerdict(spec: CronSpec, lastRunMs: number | null, nowMs: number): WindowVerdict {
  const anchor = new Date((lastRunMs ?? nowMs - 60_000) as number);
  const scheduledFor = spec.nextRunAfter(anchor);
  if (scheduledFor === null || scheduledFor.getTime() > nowMs) {
    return { due: false, scheduledFor, missed: 0, nextRun: scheduledFor };
  }
  // Count how many further boundaries also elapsed (the missed windows).
  let missed = 0;
  let cursor = scheduledFor;
  for (let i = 0; i < MAX_WALK; i += 1) {
    const step = spec.nextRunAfter(cursor);
    if (step === null) break;
    if (step.getTime() > nowMs) return { due: true, scheduledFor, missed, nextRun: step };
    cursor = step;
    missed += 1;
  }
  return { due: true, scheduledFor, missed, nextRun: null };
}
