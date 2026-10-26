/**
 * Client-side session filtering (spec #266): title / external key / status.
 * Pure, so it is testable without a DOM. The server-side equivalent (#267)
 * exists for lists larger than one page; this keeps typing instant.
 */
import type { SessionRow } from "./api";

export function filterSessions(rows: readonly SessionRow[], query: string): SessionRow[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...rows];
  return rows.filter((r) => {
    const title = (r.title ?? "").toLowerCase();
    const key = r.external_key.toLowerCase();
    const status = r.status.toLowerCase();
    return title.includes(q) || key.includes(q) || status.includes(q);
  });
}
