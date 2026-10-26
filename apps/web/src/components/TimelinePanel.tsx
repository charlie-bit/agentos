import { turnTimeline } from "../lib/timeline";
import type { State } from "../lib/chat-reducer";
import { ScrollArea } from "./ui/scroll-area";

/** "Why was this turn slow" (spec #128/#295): the last turn's events, in order. */
export function TimelinePanel({ state, onClose }: { state: State; onClose: () => void }) {
  const items = turnTimeline(state.entries);
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-1 border-l border-border p-2 text-xs" aria-label="turn timeline">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">turn timeline ({items.length})</span>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">×</button>
      </div>
      {items.length === 0 && <div className="px-1 text-muted-foreground">no tool activity in this turn</div>}
      <ScrollArea className="min-h-0 flex-1">
        <ol className="space-y-1">
          {items.map((i) => (
            <li key={i.id} className="rounded border border-border p-1.5 font-mono text-[10px]">
              <div className="flex items-center justify-between">
                <span className={i.kind === "denied" ? "text-err" : "text-foreground"}>{i.label}</span>
                {typeof i.durationMs === "number" && <span className="text-muted-foreground">{i.durationMs}ms</span>}
              </div>
              {i.detail && <div className="truncate text-muted-foreground">{i.detail}</div>}
            </li>
          ))}
        </ol>
      </ScrollArea>
    </aside>
  );
}
