import { useEffect, useState } from "react";
import { getUsage, type UsageRow } from "../lib/api";
import { ScrollArea } from "./ui/scroll-area";

/** Per-role usage view (#349): the agent dimension the usage log already carries. */
export function UsagePanel({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void getUsage()
      .then((b) => setRows(b.rows))
      .catch((err) => setError(err instanceof Error ? err.message : "usage unavailable"));
  }, []);
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-1 border-l border-border p-2 text-xs" aria-label="usage by role">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">usage by role ({rows.length})</span>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">×</button>
      </div>
      {error && <div className="px-1 text-err">{error}</div>}
      {!error && rows.length === 0 && <div className="px-1 text-muted-foreground">no usage recorded yet</div>}
      <ScrollArea className="min-h-0 flex-1">
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={`${r.provider}-${r.model}-${r.agent ?? "self"}`} className="rounded border border-border p-1.5 font-mono text-[10px]">
              <div className="flex justify-between text-foreground">
                <span>{r.agent ?? "self"}</span>
                <span>{r.turns} turn(s)</span>
              </div>
              <div className="text-muted-foreground">{r.provider}/{r.model}</div>
              <div className="text-muted-foreground">in {r.input} · out {r.output} · ≈${r.costUsd.toFixed(4)}</div>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </aside>
  );
}
