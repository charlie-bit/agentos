import { useEffect, useState } from "react";
import { getAgents, type AgentInfo } from "../lib/api";
import { chainLabel, fenceSummary, isSelf } from "../lib/agents";
import { ScrollArea } from "./ui/scroll-area";

/** Role catalogue cards (#343): chain, fence and where the yml lives. */
export function AgentsPanel({ onClose, onStartRole }: { onClose: () => void; onStartRole?: (agent: string) => void }) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void getAgents()
      .then((b) => setAgents(b.agents))
      .catch((err) => setError(err instanceof Error ? err.message : "roles unavailable"));
  }, []);
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-1 border-l border-border p-2 text-xs" aria-label="agent roles">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">roles ({agents.length})</span>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">×</button>
      </div>
      {error && <div className="px-1 text-err">{error}</div>}
      {!error && agents.length === 0 && <div className="px-1 text-muted-foreground">no roles mounted (preset declared none)</div>}
      <ScrollArea className="min-h-0 flex-1">
        <ul className="space-y-1">
          {agents.map((a) => (
            <li key={a.name} className="rounded border border-border p-1.5">
              <button className="block w-full text-left" onClick={() => onStartRole?.(a.name)} title={`start a turn as ${a.name}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-foreground">{a.name}</span>
                  <span className="text-[10px] text-muted-foreground">{isSelf(a) ? "self" : "inherits"}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">{chainLabel(a)}</div>
                <div className="text-[10px] text-muted-foreground">fence: {fenceSummary(a)}</div>
                <div className="text-[10px] text-muted-foreground">{a.manifestPath ?? "synthesized"}</div>
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </aside>
  );
}
