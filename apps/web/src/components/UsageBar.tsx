import { useState } from "react";
import { PhoneOutgoing } from "lucide-react";
import { escalate, getEscalations } from "../lib/api";
import type { Usage } from "../lib/chat-reducer";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

/** cumulative result-frame usage + attribution + escalation telemetry. */
export function UsageBar({
  usage,
  escalations,
  sessionId,
  onEscalated,
  modelShort,
}: {
  usage: Usage;
  escalations: number;
  sessionId: string;
  onEscalated: (count: number) => void;
  /** Short model name from session.init (D-0910-6 tier-2); full id never crosses the wire. */
  modelShort: string | null;
}) {
  const [pressed, setPressed] = useState<"idle" | "sending" | "done">("idle");
  const click = async () => {
    if (pressed !== "idle") return;
    setPressed("sending");
    await escalate(sessionId).catch(() => undefined);
    onEscalated((await getEscalations().catch(() => ({ count: escalations }))).count);
    setPressed("done");
    setTimeout(() => setPressed("idle"), 1500);
  };
  const num = (n: number) => n.toLocaleString();
  return (
    <TooltipProvider delayDuration={200}>
      <footer className="flex items-center gap-3 border-t border-border px-4 py-1.5 text-[11px] text-muted">
        <span className="font-mono">
          in {num(usage.input)} · out {num(usage.output)}
          {usage.cacheRead > 0 && <> · cache_rd {num(usage.cacheRead)}</>}
          {usage.cacheWrite > 0 && <> · cache_wr {num(usage.cacheWrite)}</>} · ≈${usage.cost.toFixed(4)}
        </span>
        {/* Attribution line (④a): WHO answered and HOW it is billed. Short name
            only — gateway/route/window suffixes are operations-side facts. */}
        {modelShort !== null && (
          <span className="font-mono text-muted" title="answered by the model channel configured for this deployment">
            · by {modelShort}
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help underline decoration-dotted">billing caveat</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs border border-border bg-card px-2 py-1 text-[11px]">
            cost is Anthropic list-price; on compatibility endpoints the channel's own billing is authoritative
          </TooltipContent>
        </Tooltip>
        <span className="flex-1" />
        <span className="font-mono">escalations: {escalations}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void click()}
          disabled={pressed === "sending"}
        >
          <PhoneOutgoing className="h-3 w-3" />
          {pressed === "done" ? "recorded ✓" : pressed === "sending" ? "sending…" : "escalate to human"}
        </Button>
      </footer>
    </TooltipProvider>
  );
}
