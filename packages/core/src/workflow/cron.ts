/**
 * Hand-written cron (spec #357, ruling E: zero dependencies). Five fields
 * (minute hour day-of-month month day-of-week) with `*`, step syntax, `a-b`, `a,b`
 * and the @daily/@hourly/@weekly aliases. Scheduling precision is the MINUTE
 * window — we never claim seconds.
 */
export interface CronSpec {
  readonly source: string;
  matches(d: Date): boolean;
  /** Smallest matching minute strictly after `after`; null if none in 4 years. */
  nextRunAfter(after: Date): Date | null;
}

const ALIASES: Record<string, string> = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
  "@yearly": "0 0 1 1 *",
};

interface Field {
  values: Set<number>;
  wildcard: boolean;
}

function parseField(expr: string, min: number, max: number, name: string): Field {
  const values = new Set<number>();
  let wildcard = false;
  for (const part of expr.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) throw new Error(`cron: bad step in ${name}: ${expr}`);
    let lo: number;
    let hi: number;
    if (rangePart === "*") {
      wildcard = true;
      lo = min;
      hi = max;
    } else if (rangePart !== undefined && rangePart.includes("-")) {
      const [a, b] = rangePart.split("-");
      lo = Number(a);
      hi = Number(b);
    } else {
      lo = Number(rangePart);
      hi = lo;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
      throw new Error(`cron: out-of-range ${name} field: ${expr} (allowed ${min}-${max})`);
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  if (values.size === 0) throw new Error(`cron: empty ${name} field`);
  return { values, wildcard };
}

export function parseCron(source: string): CronSpec {
  const normalized = ALIASES[source.trim()] ?? source.trim();
  const fields = normalized.split(/\s+/);
  if (fields.length !== 5) throw new Error(`cron: expected 5 fields, got ${fields.length}: ${source}`);
  const [minute, hour, dom, month, dow] = fields as [string, string, string, string, string];
  const m = parseField(minute, 0, 59, "minute");
  const h = parseField(hour, 0, 23, "hour");
  const d = parseField(dom, 1, 31, "day-of-month");
  const mo = parseField(month, 1, 12, "month");
  const w = parseField(dow, 0, 6, "day-of-week");

  const matches = (date: Date): boolean => {
    // Standard cron DOM/DOW rule: when BOTH are restricted, either may match.
    const domOk = d.values.has(date.getDate());
    const dowOk = w.values.has(date.getDay());
    const dayOk = !d.wildcard && !w.wildcard ? domOk || dowOk : domOk && dowOk;
    return m.values.has(date.getMinutes()) && h.values.has(date.getHours()) && mo.values.has(date.getMonth() + 1) && dayOk;
  };

  return {
    source,
    matches,
    nextRunAfter(after: Date): Date | null {
      const cursor = new Date(after.getTime());
      cursor.setSeconds(0, 0);
      cursor.setMinutes(cursor.getMinutes() + 1);
      // 4 years of minutes is the bound (covers Feb-29-only schedules).
      for (let i = 0; i < 4 * 366 * 24 * 60; i += 1) {
        if (matches(cursor)) return new Date(cursor.getTime());
        cursor.setMinutes(cursor.getMinutes() + 1);
      }
      return null;
    },
  };
}
