import { useEffect, useRef } from "react";
import { Braces, CheckCircle2, ChevronRight, LoaderCircle, TriangleAlert, XCircle, Brain } from "lucide-react";
import type { Entry, State } from "../lib/chat-reducer";
import { cn } from "../lib/utils";
import { Markdown } from "./Markdown";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { ScrollArea } from "./ui/scroll-area";

/** tool.call/tool.result lifecycle block: collapsed by default, open on error. */
function ToolCallBlock({ e }: { e: Extract<Entry, { kind: "tool" }> }) {
  const Icon = e.status === "error" ? XCircle : e.status === "ok" ? CheckCircle2 : LoaderCircle;
  return (
    <Collapsible defaultOpen={false} className="max-w-3xl rounded-lg border border-dashed border-border">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs">
        <ChevronRight className="h-3.5 w-3.5 text-muted transition-transform group-data-[state=open]:rotate-90" />
        <Icon className={cn("h-3.5 w-3.5", e.status === "error" && "text-err", e.status === "ok" && "text-ok", e.status === "running" && "animate-spin text-run")} />
        <span className="font-mono text-foreground">{e.name}</span>
        <span className="truncate font-mono text-muted">{e.input.slice(0, 90)}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-2">
        <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-[11px] text-muted">{e.input}</pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ThinkingLine({ e }: { e: Extract<Entry, { kind: "thinking" }> }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted" data-open={e.open}>
      {e.open ? <Brain className="h-3.5 w-3.5 animate-pulse" /> : <Brain className="h-3.5 w-3.5" />}
      <span>
        kernel noise: {e.count} frame{e.count === 1 ? "" : "s"} aggregated
      </span>
    </div>
  );
}

function DriftBanner({ e }: { e: Extract<Entry, { kind: "drift" }> }) {
  return (
    <div className="flex max-w-3xl items-start gap-2 rounded-lg border border-warn/60 px-3 py-2 text-xs text-warn" role="alert">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <strong className="font-semibold">tool drift</strong> — missing: {e.missing.join(", ") || "—"} · undeclared:{" "}
        {e.undeclared.join(", ") || "—"} <span className="text-muted">(warning only; the session continues)</span>
      </span>
    </div>
  );
}

/** ChatStream = the RenderEvent vocabulary, rendered once each. */
export function ChatStream({ state }: { state: State }) {
  const anchor = useRef<HTMLDivElement>(null);
  const count = state.entries.length + (state.entries.at(-1)?.kind === "thinking" ? (state.entries.at(-1) as { count: number }).count : 0);
  useEffect(() => {
    anchor.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [count]);
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-2.5 px-4 py-3">
        {state.entries.length === 0 && (
          <div className="mt-[30vh] flex flex-col items-center gap-2 text-center text-sm text-muted">
            <Braces className="h-6 w-6 opacity-40" />
            <span>
              Ask the assistant anything it can answer with the mounted tools.
              {state.resumed && <span className="ml-1 text-ok">· session resumed (server-side history)</span>}
            </span>
          </div>
        )}
        {state.entries.map((e) => {
          switch (e.kind) {
            case "user":
              return (
                <div key={e.id} className="max-w-3xl self-end rounded-lg bg-primary/10 px-3 py-1.5 text-sm">
                  {e.text}
                </div>
              );
            case "assistant":
              return (
                <article key={e.id} className={cn("max-w-3xl text-sm", e.status === "error" && "text-err")}>
                  <Markdown text={e.text} streaming={e.status === "streaming"} />
                  {e.status === "streaming" && <span className="ml-0.5 animate-pulse text-primary">▌</span>}
                  {e.status === "error" && <div className="text-[11px] text-err">turn ended in error</div>}
                </article>
              );
            case "tool":
              return <ToolCallBlock key={e.id} e={e} />;
            case "thinking":
              return <ThinkingLine key={e.id} e={e} />;
            case "drift":
              return <DriftBanner key={e.id} e={e} />;
          }
        })}
        <div ref={anchor} />
      </div>
    </ScrollArea>
  );
}
