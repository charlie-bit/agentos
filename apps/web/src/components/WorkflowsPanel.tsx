import { useEffect, useState } from "react";
import { Bot, CalendarClock, CirclePlay, CircleStop, CircleCheck, CircleAlert, Play, Plus, Search, Webhook, Wrench } from "lucide-react";
import { getWorkflowRun, getWorkflowRuns, getWorkflows, runWorkflow, HttpError, type WorkflowRun, type WorkflowStepOutcome, type WorkflowSummary } from "../lib/api";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { WorkflowComposer } from "./WorkflowComposer";
import { cn } from "../lib/utils";

const STEP_ICON = { agent: Bot, tool: Wrench, skill: Play, kb_search: Search, human: CirclePlay } as const;
const TRIGGER_ICON = { manual: Play, schedule: CalendarClock, webhook: Webhook } as const;
const STATUS_ICON = { done: CircleCheck, error: CircleAlert, running: CirclePlay, aborted: CircleStop, pending: CirclePlay } as const;

/** Workflows page (#375) with a read-only vertical step flow (#376) — HTML/CSS only, no graph lib. */
export function WorkflowsPanel({ onOpenSession }: { onOpenSession?: (key: string) => void }) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [detail, setDetail] = useState<{ id: string; steps: WorkflowStepOutcome[]; run: WorkflowRun } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const refresh = async () => {
    try {
      setWorkflows((await getWorkflows()).workflows);
      setError(null);
    } catch (err) {
      // 501 = no workflow catalogue wired by this deployment: an empty state.
      if (err instanceof HttpError && err.status === 501) {
        setWorkflows([]);
        setError(null);
        return;
      }
      setError(err instanceof Error ? err.message : "workflows unavailable");
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const openFlow = async (w: WorkflowSummary) => {
    if (open === w.name) return setOpen(null);
    setOpen(w.name);
    setRuns((await getWorkflowRuns(w.name).catch(() => ({ runs: [] }))).runs);
  };

  if (composing) return <WorkflowComposer onClose={() => setComposing(false)} />;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 md:p-6" aria-label="workflows">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Schedule cards show the next boundary; "missed" counts windows skipped while the server was down (never replayed).
        </p>
        <Button size="sm" onClick={() => setComposing(true)}>
          <Plus className="h-3 w-3" /> New workflow
        </Button>
      </div>
      {error && <div className="text-sm text-err">{error}</div>}
      {!error && workflows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No workflows mounted. Add <code>config/workflows/*.yml</code> or run <code>agentos workflows scaffold</code>.
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <ul className="mx-auto flex max-w-4xl flex-col gap-2 pb-2">
          {workflows.map((w) => {
            const Trigger = TRIGGER_ICON[w.trigger];
            const expanded = open === w.name;
            return (
              <li key={w.name} className="overflow-hidden rounded-lg border border-border bg-card/40">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-card"
                  onClick={() => void openFlow(w)}
                  aria-expanded={expanded}
                >
                  <Trigger className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{w.name}</span>
                  {typeof w.missed === "number" && w.missed > 0 && (
                    <span className="rounded bg-warn/20 px-1.5 py-0.5 text-[10px] text-warn" title="windows skipped while down">missed {w.missed}</span>
                  )}
                  <span className="text-[11px] text-muted-foreground">{w.stepCount} steps · {w.trigger}</span>
                </button>
                {w.nextRun && <div className="px-3 pb-2 text-[11px] text-muted-foreground">next: {new Date(w.nextRun).toLocaleString()}</div>}

                {expanded && (
                  <div className="border-t border-border px-3 py-2.5 text-xs">
                    <ol className="relative ml-2 border-l border-border pl-3">
                      {(w.steps ?? []).map((type, i) => {
                        const Icon = STEP_ICON[(type as keyof typeof STEP_ICON)] ?? Wrench;
                        return (
                          <li key={i} className="relative py-0.5 text-[11px] text-muted-foreground">
                            <span className="absolute -left-[19px] flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border bg-card">
                              <Icon className="h-2 w-2" />
                            </span>
                            {i + 1}. {type}
                          </li>
                        );
                      })}
                      {(w.steps ?? []).length === 0 && <li className="text-[11px] text-muted-foreground">step detail not disclosed</li>}
                    </ol>

                    {runs.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {runs.slice(0, 5).map((r) => {
                          const S = STATUS_ICON[r.status];
                          return (
                            <li key={r.id}>
                              <button
                                className="flex w-full items-center gap-1.5 text-[11px]"
                                onClick={() =>
                                  void getWorkflowRun(r.id)
                                    .then((d) => setDetail({ id: r.id, steps: d.steps, run: d.run }))
                                    .catch(() => setDetail(null))
                                }
                              >
                                <S className={cn("h-3 w-3", r.status === "error" ? "text-err" : r.status === "done" ? "text-ok" : "text-muted-foreground")} />
                                <span className="font-mono text-muted-foreground">{new Date(r.startedAtMs).toLocaleString()}</span>
                                <span className="text-muted-foreground">{r.status}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <Button size="sm" variant="outline" className="mt-2" onClick={() => void runWorkflow(w.name).then(refresh)}>
                      Run now
                    </Button>

                    {detail && (
                      <div className="mt-2 rounded-md border border-border bg-background p-2">
                        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>instance {detail.id.slice(0, 8)} · {detail.run.status}</span>
                          <span className="flex items-center gap-2">
                            {detail.run.sessionKey && onOpenSession && (
                              <button
                                className="text-primary underline decoration-dotted"
                                title="open the run's conversation"
                                onClick={() => onOpenSession(detail.run.sessionKey as string)}
                              >
                                session
                              </button>
                            )}
                            <a href={`/api/workflows/runs/${encodeURIComponent(detail.id)}/export?format=jsonl`} download title="download run (JSONL)">⤓</a>
                          </span>
                        </div>
                        <ol className="space-y-0.5">
                          {detail.steps.map((st) => (
                            <li key={st.index} className="flex items-center gap-1.5 text-[11px]">
                              <span className={cn("h-1.5 w-1.5 rounded-full", st.status === "ok" ? "bg-ok" : st.status === "error" ? "bg-err" : st.status === "denied" ? "bg-warn" : "bg-muted")} />
                              <span className="font-mono">{st.index + 1}. {st.type}</span>
                              <span className="text-muted-foreground">{st.status} · {st.durationMs}ms</span>
                              {st.error && <span className="truncate text-err" title={st.error}>{st.error.slice(0, 40)}</span>}
                            </li>
                          ))}
                        </ol>
                        {detail.run.resumeFrom !== null && detail.run.resumeFrom !== undefined && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2"
                            onClick={() => void runWorkflow(w.name, detail.run.resumeFrom as number).then(refresh)}
                          >
                            Resume from step {(detail.run.resumeFrom as number) + 1}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}
