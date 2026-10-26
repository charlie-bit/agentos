/**
 * Turn timeline (spec #128/#295): "why was this slow" needs the events of one
 * turn in order — tool calls with their measured duration, gate denials, and
 * drift — without the conversation text. Derived from reducer entries, so it
 * adds no wire vocabulary.
 */
import type { Entry } from "./chat-reducer";

export interface TimelineItem {
  id: string;
  kind: "tool" | "denied" | "drift" | "usage";
  label: string;
  detail?: string;
  durationMs?: number;
  status?: "running" | "ok" | "error";
}

export function turnTimeline(entries: readonly Entry[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const e of entries) {
    if (e.kind === "tool") {
      const denied = e.status === "error" && /denied|not part of/i.test(e.input);
      items.push({
        id: e.id,
        kind: denied ? "denied" : "tool",
        label: e.name,
        detail: denied ? e.input.slice(0, 120) : e.input.slice(0, 80),
        ...(e.durationMs !== undefined ? { durationMs: e.durationMs } : {}),
        status: e.status,
      });
    } else if (e.kind === "drift") {
      items.push({
        id: e.id,
        kind: "drift",
        label: "registry drift",
        detail: `missing ${e.missing.length} · undeclared ${e.undeclared.length} · unverified ${e.unverified.length}`,
      });
    }
  }
  return items;
}
