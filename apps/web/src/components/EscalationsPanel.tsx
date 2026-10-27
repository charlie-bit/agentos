import { useEffect, useState } from "react";
import { getEscalations, type EscalationEntry } from "../lib/api";
import { ScrollArea } from "./ui/scroll-area";

/** Gate hand-off history (spec #127/#294): timestamps + reasons, no content. */
export function EscalationsPanel({ onClose }: { onClose: () => void }) {
  const [recent, setRecent] = useState<EscalationEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void getEscalations(50)
      .then((b) => setRecent(b.recent ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "escalations unavailable"));
  }, []);
  return (
    <aside className="flex w-full shrink-0 flex-col gap-1 border-l border-border p-2 text-xs md:w-80" aria-label="escalations">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">escalations ({recent.length})</span>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">×</button>
      </div>
      {error && <div className="px-1 text-err">{error}</div>}
      {!error && recent.length === 0 && <div className="px-1 text-muted-foreground">none recorded</div>}
      <ScrollArea className="min-h-0 flex-1">
        <ul className="space-y-1">
          {recent.map((e, i) => (
            <li key={`${e.ts}-${i}`} className="rounded border border-border p-1.5 font-mono text-[10px] text-muted-foreground">
              <div>{e.ts ? new Date(e.ts).toISOString() : "?"} · {e.sessionId ?? "?"}</div>
              <div className="truncate text-foreground">{e.reason ?? "(no reason)"}</div>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </aside>
  );
}
